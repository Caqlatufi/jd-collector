package com.jd.recognition.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.jd.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RecognitionServiceTest {
    @TempDir Path directory;
    private final ObjectMapper mapper = new ObjectMapper();

    private class Scheduler extends RecognitionService {
        int launches;
        Scheduler(boolean enabled) {
            super(mapper, directory.toString(), directory.toString(), enabled, 2, 2, 120, "node", "");
        }
        @Override protected Process startWorker(List<String> command, Path attemptDirectory) throws IOException {
            launches++;
            throw new IOException("Deliberate fixture startup failure");
        }
    }

    private Path job(String id) throws IOException {
        Path job = Files.createDirectories(directory.resolve("jobs").resolve(id));
        Files.writeString(job.resolve("task.json"), "{\"taskId\":\"" + id + "\"}");
        return job;
    }

    private void running(Path job, String status, boolean alive) throws IOException {
        ObjectNode state = mapper.createObjectNode();
        state.put("taskId", job.getFileName().toString());
        state.put("status", status);
        state.put("attempt", 1);
        state.put("startedAt", Instant.now().minusSeconds(90).toString());
        state.put("pid", alive ? ProcessHandle.current().pid() : Long.MAX_VALUE);
        state.put("processStartedAt", ProcessHandle.current().info().startInstant().orElseThrow().toString());
        Files.writeString(job.resolve("state.json"), state.toString());
        Files.createDirectories(job.resolve("attempt-1"));
    }

    @Test void restartAdoptsLiveWorkAndRespectsConcurrency() throws Exception {
        running(job("job-a"), "RUNNING", true);
        running(job("job-b"), "RUNNING", true);
        job("job-c");
        Scheduler scheduler = new Scheduler(true);
        scheduler.poll();
        scheduler.poll();
        assertEquals(0, scheduler.launches);
        assertEquals("QUEUED", scheduler.detail("job-c").path("status").asText());
        assertThrows(BusinessException.class, () -> scheduler.retry("job-a"));
    }

    @Test void completedProcessIsRecordedOnceAndNeverRelaunched() throws Exception {
        Path job = job("job-a");
        running(job, "RUNNING", false);
        Files.writeString(job.resolve("attempt-1/completion.json"), "{\"status\":\"NEEDS_REVIEW\",\"attempt\":1}");
        Scheduler scheduler = new Scheduler(true);
        scheduler.poll();
        new Scheduler(true).poll();
        assertEquals("NEEDS_REVIEW", scheduler.detail("job-a").path("status").asText());
        assertEquals(0, scheduler.launches);
        assertEquals("NEEDS_REVIEW", mapper.readTree(Files.readString(job.resolve("state.json"))).path("status").asText());
    }

    @Test void unknownExitIsNotAutomaticallyResubmitted() throws Exception {
        running(job("job-a"), "STARTING", false);
        Scheduler scheduler = new Scheduler(true);
        scheduler.poll();
        scheduler.poll();
        assertEquals("WORKER_EXIT_WITHOUT_COMPLETION", scheduler.detail("job-a").path("errorCode").asText());
        assertEquals(0, scheduler.launches);
        scheduler.retry("job-a");
        scheduler.poll();
        assertEquals(1, scheduler.launches);
        assertEquals(2, scheduler.detail("job-a").path("attempt").asInt());
    }

    @Test void incompleteFoldersAndDisabledSchedulerDoNotLaunch() throws Exception {
        job(".uploading");
        Files.createDirectories(directory.resolve("jobs/unfinished"));
        Scheduler scheduler = new Scheduler(true);
        scheduler.poll();
        assertEquals(0, scheduler.launches);
        job("ready");
        Scheduler disabled = new Scheduler(false);
        disabled.poll();
        assertEquals(0, disabled.launches);
    }

    @Test void malformedJobDoesNotPreventOtherJobsFromRunning() throws Exception {
        Files.writeString(job("bad").resolve("state.json"), "invalid json");
        job("good");
        Scheduler scheduler = new Scheduler(true);
        scheduler.poll();
        assertEquals(1, scheduler.launches);
        assertEquals("WORKER_START_FAILED", scheduler.detail("good").path("errorCode").asText());
    }

    @Test void transientFailureWaitsBeforeRetry() throws Exception {
        Path job = job("job-a");
        running(job, "RUNNING", false);
        Files.writeString(job.resolve("attempt-1/completion.json"), "{\"status\":\"FAILED\",\"attempt\":1,\"errorCode\":\"CODEX_TIMEOUT\"}");
        Scheduler scheduler = new Scheduler(true);
        scheduler.poll();
        assertEquals("RETRY_WAIT", scheduler.detail("job-a").path("status").asText());
        scheduler.poll();
        assertEquals(0, scheduler.launches);
    }

    @Test void configuredModelIsReportedAndPassedToWorker() throws Exception {
        RecognitionService service = new RecognitionService(mapper, directory.toString(), "queue", true,
                2, 2, 120, "node", "codex.exe", "example-vision-model", "high") {
            @Override protected Process startWorker(List<String> command, Path attemptDirectory) throws IOException {
                assertEquals("example-vision-model", command.get(6));
                assertEquals("high", command.get(7));
                throw new IOException("Deliberate fixture startup failure");
            }
        };
        Path job = Files.createDirectories(directory.resolve("queue/jobs/configured"));
        Files.writeString(job.resolve("task.json"), "{\"taskId\":\"configured\"}");
        assertEquals(directory.resolve("queue").toString(), service.configuration().path("workDirectory").asText());
        assertEquals("example-vision-model", service.configuration().path("model").asText());
        service.poll();
        assertEquals("example-vision-model", service.detail("configured").path("model").asText());
        assertEquals("high", service.detail("configured").path("reasoningEffort").asText());
        assertThrows(IllegalArgumentException.class, () -> new RecognitionService(mapper, directory.toString(), "", false,
                2, 2, 120, "node", "", "invalid model", "medium"));
    }
}
