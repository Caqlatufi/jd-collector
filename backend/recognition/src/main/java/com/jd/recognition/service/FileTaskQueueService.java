package com.jd.recognition.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.jd.common.config.ProjectPaths;
import com.jd.common.exception.BusinessException;
import com.jd.common.exception.ErrorCode;
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

/** Durable file queue shared by JD import and company address discovery. Each queue runs serially. */
public class FileTaskQueueService {
    private static final Set<String> RETRYABLE = Set.of("FAILED", "WAITING_USER", "NEEDS_REVIEW", "PARTIAL");
    protected final ObjectMapper mapper;
    private final String workerScript;
    private final String tabPrefix;
    private final Path project;
    private final Path root;
    private final boolean enabled;
    private final String node;
    private final String codex;
    private final String model;
    private final String effort;
    private final String apiBase;
    private final int timeout;

    protected FileTaskQueueService(ObjectMapper mapper, String projectRoot, String directory, String defaultDirectory,
            String workerScript, String tabPrefix, boolean enabled,
            String node, String codex, String model, String effort, int timeout, String apiBase) {
        this.mapper = mapper;
        this.project = ProjectPaths.root(projectRoot);
        this.root = directory.isBlank() ? project.resolve(defaultDirectory) : Path.of(directory).toAbsolutePath();
        this.workerScript = workerScript;
        this.tabPrefix = tabPrefix;
        this.enabled = enabled;
        this.node = node;
        this.codex = codex;
        this.model = model;
        this.effort = effort;
        this.timeout = Math.max(30, Math.min(timeout, 600));
        this.apiBase = apiBase;
    }

    protected synchronized JsonNode enqueue(ObjectNode seed, String dedupKey) {
        try {
            Files.createDirectories(root.resolve("jobs"));
            for (Path job : jobs()) {
                ObjectNode state = refresh(job);
                if (seed.path(dedupKey).asText().equals(state.path(dedupKey).asText()) &&
                        Set.of("QUEUED", "RUNNING", "STARTING").contains(state.path("status").asText())) {
                    return view(job, state);
                }
            }
            String id = UUID.randomUUID().toString();
            Path job = root.resolve("jobs").resolve(id);
            Files.createDirectory(job);
            ObjectNode state = mapper.createObjectNode();
            state.put("taskId", id);
            state.setAll(seed);
            state.put("tabKey", tabPrefix + id);
            state.put("status", "QUEUED");
            state.put("attempt", 0);
            state.put("createdAt", Instant.now().toString());
            state.put("model", model);
            state.put("reasoningEffort", effort);
            write(job.resolve("task.json"), state);
            write(job.resolve("state.json"), state);
            return state;
        } catch (IOException e) { throw storageError(); }
    }

    @Scheduled(fixedDelayString = "${jd-collector.posting-import.poll-ms:2000}")
    public synchronized void poll() {
        if (!enabled) return;
        try {
            Files.createDirectories(root.resolve("jobs"));
            try (var channel = FileChannel.open(root.resolve("scheduler.lock"), StandardOpenOption.CREATE, StandardOpenOption.WRITE);
                    var lock = channel.tryLock()) {
                if (lock == null) return;
                List<Path> queued = new ArrayList<>();
                for (Path job : jobs()) {
                    ObjectNode state = refresh(job);
                    if (Set.of("STARTING", "RUNNING").contains(state.path("status").asText())) return;
                    if ("QUEUED".equals(state.path("status").asText())) queued.add(job);
                }
                if (!queued.isEmpty()) launch(queued.get(0));
            }
        } catch (IOException | OverlappingFileLockException e) {
            // Leave files intact. API access reports an explicit storage error if still unavailable.
        }
    }

    public synchronized List<JsonNode> list() {
        try {
            List<JsonNode> result = new ArrayList<>();
            for (Path job : jobs()) result.add(view(job, refresh(job)));
            result.sort(Comparator.comparing((JsonNode item) -> item.path("createdAt").asText()).reversed());
            // Retain all unfinished tasks and the last twenty terminal tasks in the response.
            List<JsonNode> visible = new ArrayList<>();
            int completed = 0;
            for (JsonNode item : result) {
                if (!"SUCCEEDED".equals(item.path("status").asText()) || completed++ < 20) visible.add(item);
            }
            return visible;
        } catch (IOException e) { throw storageError(); }
    }

    public synchronized JsonNode retry(String id) {
        try {
            Path job = job(id);
            ObjectNode state = refresh(job);
            if (!RETRYABLE.contains(state.path("status").asText()) || alive(state)) {
                throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "任务尚在运行或已完成，不能重复启动");
            }
            state.put("status", "QUEUED");
            state.remove(List.of("errorCode", "message", "completedAt", "phase"));
            write(job.resolve("state.json"), state);
            return state;
        } catch (IOException e) { throw storageError(); }
    }

    public synchronized JsonNode detail(String id) {
        try {
            Path job = job(id);
            return view(job, refresh(job));
        } catch (IOException e) { throw storageError(); }
    }

    private ObjectNode view(Path job, ObjectNode state) throws IOException {
        ObjectNode result = state.deepCopy();
        Path progress = job.resolve("attempt-" + state.path("attempt").asInt()).resolve("progress.json");
        if ("RUNNING".equals(state.path("status").asText()) && Files.isRegularFile(progress)) {
            JsonNode data = mapper.readTree(Files.readAllBytes(progress));
            for (String key : List.of("phase", "message", "captureCount", "updatedAt")) {
                if (data.has(key)) result.set(key, data.get(key));
            }
        }
        result.remove(List.of("pid", "processStartedAt", "startedAt"));
        return result;
    }

    private ObjectNode refresh(Path job) throws IOException {
        ObjectNode state = (ObjectNode) mapper.readTree(Files.readAllBytes(job.resolve("state.json")));
        if (!Set.of("STARTING", "RUNNING").contains(state.path("status").asText()) || alive(state)) return state;
        Path attempt = job.resolve("attempt-" + state.path("attempt").asInt());
        Path identity = attempt.resolve("worker.json");
        if (Files.isRegularFile(identity)) {
            JsonNode worker = mapper.readTree(Files.readAllBytes(identity));
            state.put("pid", worker.path("pid").asLong());
            state.put("processStartedAt", worker.path("processStartedAt").asText());
            if (alive(state)) {
                state.put("status", "RUNNING");
                write(job.resolve("state.json"), state);
                return state;
            }
        }
        Path completion = attempt.resolve("completion.json");
        if (Files.isRegularFile(completion)) {
            ObjectNode data = (ObjectNode) mapper.readTree(Files.readAllBytes(completion));
            if (data.path("attempt").asInt() != state.path("attempt").asInt()
                    || !Set.of("SUCCEEDED", "FAILED", "WAITING_USER", "NEEDS_REVIEW", "PARTIAL").contains(data.path("status").asText())) {
                throw new IOException("Invalid completion");
            }
            state.setAll(data);
        } else if (Instant.parse(state.path("startedAt").asText()).plusSeconds(30).isBefore(Instant.now())) {
            state.put("status", "FAILED");
            state.put("errorCode", "WORKER_EXIT_WITHOUT_COMPLETION");
            state.put("message", "收录进程已退出，未返回结果。重试时会先检查是否已入库，避免重复收录。");
        } else return state;
        write(job.resolve("state.json"), state);
        return state;
    }

    private boolean alive(JsonNode state) {
        long pid = state.path("pid").asLong();
        String start = state.path("processStartedAt").asText();
        if (pid <= 0 || start.isBlank()) return false;
        return ProcessHandle.of(pid).filter(ProcessHandle::isAlive).map(process -> process.info().startInstant()
                .map(actual -> Math.abs(actual.toEpochMilli() - Instant.parse(start).toEpochMilli()) < 5000)
                .orElse(true)).orElse(false);
    }

    protected Process startWorker(List<String> command, Path attempt) throws IOException {
        return new ProcessBuilder(command).directory(project.toFile())
                .redirectOutput(attempt.resolve("worker.stdout.log").toFile())
                .redirectError(attempt.resolve("worker.stderr.log").toFile()).start();
    }

    private void launch(Path job) throws IOException {
        ObjectNode state = (ObjectNode) mapper.readTree(Files.readAllBytes(job.resolve("state.json")));
        int attempt = state.path("attempt").asInt() + 1;
        Path directory = job.resolve("attempt-" + attempt);
        Files.createDirectories(directory);
        state.put("attempt", attempt);
        state.put("status", "STARTING");
        state.put("startedAt", Instant.now().toString());
        state.remove(List.of("pid", "processStartedAt", "errorCode", "completedAt"));
        write(job.resolve("state.json"), state);
        try {
            Process worker = startWorker(List.of(node, project.resolve(workerScript).toString(),
                    job.toString(), Integer.toString(attempt), codex, Integer.toString(timeout * 1000), model, effort, apiBase), directory);
            state.put("pid", worker.pid());
            state.put("processStartedAt", worker.info().startInstant().orElse(Instant.now()).toString());
            state.put("status", "RUNNING");
        } catch (IOException e) {
            state.put("status", "FAILED");
            state.put("errorCode", "WORKER_START_FAILED");
            state.put("message", "无法启动收录子进程，请检查本机 Node 配置。");
        }
        write(job.resolve("state.json"), state);
    }

    private List<Path> jobs() throws IOException {
        Path jobs = root.resolve("jobs");
        if (!Files.isDirectory(jobs)) return List.of();
        try (var paths = Files.list(jobs)) {
            return paths.filter(p -> p.getFileName().toString().matches("[0-9a-f-]{36}"))
                    .filter(p -> Files.isDirectory(p, LinkOption.NOFOLLOW_LINKS))
                    .filter(p -> Files.isRegularFile(p.resolve("state.json"), LinkOption.NOFOLLOW_LINKS))
                    .sorted(Comparator.comparingLong(p -> p.toFile().lastModified())).toList();
        }
    }

    private Path job(String id) {
        if (!id.matches("[0-9a-f-]{36}")) throw new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, "任务编号无效");
        Path job = root.resolve("jobs").resolve(id);
        if (!Files.isRegularFile(job.resolve("state.json"), LinkOption.NOFOLLOW_LINKS)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, "收录任务不存在");
        }
        return job;
    }

    private void write(Path file, ObjectNode value) throws IOException {
        value.put("updatedAt", Instant.now().toString());
        Path temporary = file.resolveSibling(UUID.randomUUID() + ".tmp");
        Files.write(temporary, mapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(value));
        Files.move(temporary, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
    }

    private BusinessException storageError() {
        return new BusinessException(ErrorCode.INTERNAL_ERROR, HttpStatus.INTERNAL_SERVER_ERROR, "收录任务记录无法读写，请检查本地工作目录");
    }
}
