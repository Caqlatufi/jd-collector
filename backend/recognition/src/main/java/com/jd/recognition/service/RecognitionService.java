package com.jd.recognition.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.jd.common.exception.BusinessException;
import com.jd.common.exception.ErrorCode;
import com.jd.common.config.ProjectPaths;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.channels.OverlappingFileLockException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/** Durable file queue. Polls process identity; it never treats an observation timeout as process exit. */
public class RecognitionService {
    private static final Logger LOG = LoggerFactory.getLogger(RecognitionService.class);
    private static final Pattern ID = Pattern.compile("[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}");
    private static final Set<String> TERMINAL = Set.of("SUCCEEDED", "NEEDS_REVIEW", "FAILED");
    private final ObjectMapper mapper;
    private final Path projectRoot;
    private final Path root;
    private final boolean enabled;
    private final int concurrency;
    private final int maxAttempts;
    private final int timeoutSeconds;
    private final String node;
    private final String codex;
    private final String model;
    private final String reasoningEffort;

    public RecognitionService(ObjectMapper mapper, String configuredProject, String directory, boolean enabled,
            int concurrency, int maxAttempts, int timeoutSeconds, String node, String codex) {
        this(mapper, configuredProject, directory, enabled, concurrency, maxAttempts, timeoutSeconds, node, codex,
                "gpt-6-astra", "medium");
    }

    public RecognitionService(ObjectMapper mapper, String configuredProject, String directory, boolean enabled,
            int concurrency, int maxAttempts, int timeoutSeconds, String node, String codex, String model, String reasoningEffort) {
        if (!model.matches("[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}") ||
                !Set.of("low", "medium", "high", "xhigh").contains(reasoningEffort)) {
            throw new IllegalArgumentException("截图识别模型或推理强度配置无效");
        }
        this.mapper = mapper;
        this.projectRoot = resolveProject(configuredProject);
        this.root = directory.isBlank() ? projectRoot.resolve("runtime/jd-screenshots") : projectRoot.resolve(directory).normalize();
        this.enabled = enabled;
        this.concurrency = Math.max(1, Math.min(concurrency, 4));
        this.maxAttempts = Math.max(1, Math.min(maxAttempts, 3));
        this.timeoutSeconds = Math.max(10, Math.min(timeoutSeconds, 600));
        this.node = node;
        this.codex = codex;
        this.model = model;
        this.reasoningEffort = reasoningEffort;
    }

    private static Path resolveProject(String configured) {
        return ProjectPaths.root(configured);
    }

    @Scheduled(fixedDelayString = "${jd-collector.recognition.poll-ms:5000}")
    public synchronized void poll() {
        if (!enabled) return;
        try {
            Files.createDirectories(root.resolve("jobs"));
            try (var channel = FileChannel.open(root.resolve("scheduler.lock"), StandardOpenOption.CREATE, StandardOpenOption.WRITE);
                    var lock = channel.tryLock()) {
                if (lock == null) return;
                List<Path> jobs = directories();
                int active = 0;
                List<Path> queued = new ArrayList<>();
                for (Path job : jobs) {
                    try {
                        ObjectNode state = refresh(job);
                        String status = state.path("status").asText();
                        if (status.equals("RUNNING") || status.equals("STARTING")) active++;
                        if (status.equals("QUEUED") || (status.equals("RETRY_WAIT") &&
                                !Instant.parse(state.path("retryAt").asText()).isAfter(Instant.now()))) queued.add(job);
                    } catch (IOException | RuntimeException e) {
                        LOG.warn("截图识别任务 {} 状态读取失败，保留原文件", job.getFileName());
                    }
                }
                for (Path job : queued) {
                    if (active >= concurrency) break;
                    launch(job);
                    active++;
                }
            }
        } catch (OverlappingFileLockException e) {
            // Another scheduler owns the queue; no duplicate launch.
        } catch (IOException e) {
            LOG.warn("截图识别工作目录不可用，稍后重试");
        }
    }

    private List<Path> directories() throws IOException {
        Path jobs = root.resolve("jobs");
        if (!Files.isDirectory(jobs)) return List.of();
        try (var paths = Files.list(jobs)) {
            return paths.filter(p -> ID.matcher(p.getFileName().toString()).matches())
                    .filter(p -> Files.isDirectory(p, LinkOption.NOFOLLOW_LINKS))
                    .filter(p -> Files.isRegularFile(p.resolve("task.json"), LinkOption.NOFOLLOW_LINKS))
                    .sorted(Comparator.comparing(p -> p.getFileName().toString())).toList();
        }
    }

    private ObjectNode readState(Path job) throws IOException {
        Path file = job.resolve("state.json");
        if (Files.exists(file)) return (ObjectNode) mapper.readTree(Files.readAllBytes(file));
        ObjectNode state = mapper.createObjectNode();
        state.put("taskId", job.getFileName().toString());
        state.put("status", "QUEUED");
        state.put("attempt", 0);
        state.put("model", model);
        state.put("reasoningEffort", reasoningEffort);
        // Adopt an execution started before the backend, instead of rerunning it.
        for (int attempt = 1; Files.isDirectory(job.resolve("attempt-" + attempt)); attempt++) {
            state.put("attempt", attempt);
            state.put("status", "STARTING");
            state.put("startedAt", Files.getLastModifiedTime(job.resolve("attempt-" + attempt)).toInstant().toString());
        }
        return state;
    }

    private ObjectNode refresh(Path job) throws IOException {
        ObjectNode state = readState(job);
        String status = state.path("status").asText();
        if (TERMINAL.contains(status) || status.equals("QUEUED") || status.equals("RETRY_WAIT")) return state;
        Path attempt = job.resolve("attempt-" + state.path("attempt").asInt());
        if (isAlive(state)) return state;
        Path workerFile = attempt.resolve("worker.json");
        if (Files.isRegularFile(workerFile)) {
            JsonNode worker = mapper.readTree(Files.readAllBytes(workerFile));
            state.put("pid", worker.path("pid").asLong());
            state.put("processStartedAt", worker.path("processStartedAt").asText());
            if (isAlive(state)) {
                state.put("status", "RUNNING");
                writeState(job, state);
                return state;
            }
        }
        Path completionFile = attempt.resolve("completion.json");
        if (Files.isRegularFile(completionFile)) {
            JsonNode completion = mapper.readTree(Files.readAllBytes(completionFile));
            String outcome = completion.path("status").asText();
            if (!TERMINAL.contains(outcome) || completion.path("attempt").asInt() != state.path("attempt").asInt())
                throw new IOException("Invalid completion");
            state.setAll((ObjectNode) completion);
            if (outcome.equals("FAILED") && state.path("attempt").asInt() < maxAttempts &&
                    completion.path("errorCode").asText().matches("CODEX_(TIMEOUT|EXIT_[0-9]+)")) {
                state.put("status", "RETRY_WAIT");
                state.put("retryAt", Instant.now().plusSeconds(30).toString());
            }
        } else if (Instant.parse(state.path("startedAt").asText()).plusSeconds(30).isBefore(Instant.now())) {
            // A missing terminal record is not permission to rerun an uncertain request.
            state.put("status", "FAILED");
            state.put("errorCode", "WORKER_EXIT_WITHOUT_COMPLETION");
            state.put("completedAt", Instant.now().toString());
        } else return state;
        writeState(job, state);
        return state;
    }

    private boolean isAlive(JsonNode state) {
        long pid = state.path("pid").asLong(0);
        String started = state.path("processStartedAt").asText("");
        if (pid <= 0 || started.isBlank()) return false;
        return ProcessHandle.of(pid).filter(ProcessHandle::isAlive).map(process ->
                process.info().startInstant().map(actual -> Math.abs(actual.toEpochMilli() - Instant.parse(started).toEpochMilli()) < 5000)
                        .orElse(true)).orElse(false);
    }

    protected Process startWorker(List<String> command, Path attemptDirectory) throws IOException {
        return new ProcessBuilder(command).directory(projectRoot.toFile())
                .redirectOutput(attemptDirectory.resolve("worker.stdout.log").toFile())
                .redirectError(attemptDirectory.resolve("worker.stderr.log").toFile()).start();
    }

    private void launch(Path job) throws IOException {
        ObjectNode state = readState(job);
        int attempt = state.path("attempt").asInt() + 1;
        Path attemptDirectory = job.resolve("attempt-" + attempt);
        Files.createDirectories(attemptDirectory);
        state.put("attempt", attempt);
        state.put("status", "STARTING");
        state.put("startedAt", Instant.now().toString());
        state.put("model", model);
        state.put("reasoningEffort", reasoningEffort);
        state.remove(List.of("pid", "processStartedAt", "errorCode", "completedAt", "retryAt"));
        writeState(job, state);
        try {
            Process process = startWorker(List.of(node, projectRoot.resolve("ops/recognition/worker.mjs").toString(),
                    job.toString(), Integer.toString(attempt), codex, Integer.toString(timeoutSeconds * 1000),
                    model, reasoningEffort), attemptDirectory);
            state.put("pid", process.pid());
            state.put("processStartedAt", process.info().startInstant().orElse(Instant.now()).toString());
            state.put("status", "RUNNING");
        } catch (IOException e) {
            state.put("status", "FAILED");
            state.put("errorCode", "WORKER_START_FAILED");
            state.put("completedAt", Instant.now().toString());
        }
        writeState(job, state);
    }

    private void writeState(Path job, ObjectNode state) throws IOException {
        state.put("updatedAt", Instant.now().toString());
        Path temporary = job.resolve("state-" + UUID.randomUUID() + ".tmp");
        Files.write(temporary, mapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(state));
        Files.move(temporary, job.resolve("state.json"), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
    }

    public synchronized List<JsonNode> list() {
        try {
            List<JsonNode> result = new ArrayList<>();
            for (Path job : directories()) result.add(readState(job));
            return result;
        } catch (IOException e) { throw storageError(); }
    }

    public synchronized JsonNode detail(String id) {
        try {
            Path job = resolveJob(id);
            ObjectNode result = readState(job);
            result.set("task", mapper.readTree(Files.readAllBytes(job.resolve("task.json"))));
            if (Files.isRegularFile(job.resolve("result.json")))
                result.set("result", mapper.readTree(Files.readAllBytes(job.resolve("result.json"))));
            return result;
        } catch (IOException e) { throw storageError(); }
    }

    public synchronized JsonNode retry(String id) {
        try {
            Path job = resolveJob(id);
            Files.createDirectories(root);
            try (var channel = FileChannel.open(root.resolve("scheduler.lock"), StandardOpenOption.CREATE, StandardOpenOption.WRITE);
                    var lock = channel.tryLock()) {
                if (lock == null) throw conflict();
                ObjectNode state = refresh(job);
                if (!state.path("status").asText().equals("FAILED") || isAlive(state)) throw conflict();
                state.put("status", "QUEUED");
                writeState(job, state);
                return state;
            }
        } catch (OverlappingFileLockException e) { throw conflict(); }
        catch (IOException e) { throw storageError(); }
    }

    public JsonNode configuration() {
        ObjectNode result = mapper.createObjectNode();
        result.put("enabled", enabled);
        result.put("workDirectory", root.toString());
        result.put("concurrency", concurrency);
        result.put("model", model);
        result.put("reasoningEffort", reasoningEffort);
        return result;
    }

    private Path resolveJob(String id) {
        if (!ID.matcher(id).matches()) throw new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, "任务编号无效");
        Path job = root.resolve("jobs").resolve(id);
        if (!Files.isDirectory(job, LinkOption.NOFOLLOW_LINKS) || !Files.isRegularFile(job.resolve("task.json")))
            throw new BusinessException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, "识别任务不存在");
        return job;
    }

    private BusinessException conflict() {
        return new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "任务正在运行或不是失败状态，不能重复启动");
    }

    private BusinessException storageError() {
        return new BusinessException(ErrorCode.INTERNAL_ERROR, HttpStatus.INTERNAL_SERVER_ERROR, "识别任务记录读取失败，请检查工作目录");
    }
}
