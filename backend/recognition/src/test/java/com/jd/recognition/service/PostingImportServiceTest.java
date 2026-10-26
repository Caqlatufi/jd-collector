package com.jd.recognition.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.jd.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PostingImportServiceTest {
    @TempDir Path root;
    private final ObjectMapper mapper = new ObjectMapper();
    private static final String URL = "https://www.zhipin.com/job_detail/test123.html";

    private PostingImportService service(boolean enabled) {
        return new PostingImportService(mapper, root.toString(), root.resolve("imports").toString(), enabled,
                "missing-node-fixture", "", "gpt-6-astra", "medium", 120, "http://127.0.0.1:7890/jd-collector/api");
    }

    @Test void acceptsGenericHttpsDetailsAndPreservesJobIdentity() {
        assertEquals(URL, PostingImportService.normalizeUrl(URL + "?from=search#top"));
        String tildeUrl = "https://www.zhipin.com/job_detail/527ac1dd43f4112103x_0tS1FlU~.html";
        assertEquals(tildeUrl, PostingImportService.normalizeUrl(tildeUrl + "?from=search#top"));
        String official = "https://nio.jobs.feishu.cn/index/position/7697199510845622566/detail";
        assertEquals(official, PostingImportService.normalizeUrl(official));
        assertEquals("https://careers.example.com/jobs?id=42#/position/42",
                PostingImportService.normalizeUrl("https://careers.example.com/jobs?id=42&utm_source=test#/position/42"));
        // URL syntax cannot decide page validity; first screenshot rejects lists/homepages.
        assertEquals("https://www.zhipin.com/web/geek/recommend", PostingImportService.normalizeUrl("https://www.zhipin.com/web/geek/recommend"));
        for (String bad : List.of("javascript:alert(1)", "http://www.zhipin.com/job_detail/a.html",
                "https://x@www.zhipin.com/job_detail/a.html", "https://www.zhipin.com:8443/job_detail/a.html")) {
            assertThrows(BusinessException.class, () -> PostingImportService.normalizeUrl(bad));
        }
    }

    @Test void duplicateQueueSurvivesRestartAndCannotRetryWhileQueued() {
        var task = service(false).create(URL);
        var restart = service(false);
        assertEquals(task.path("taskId"), restart.create(URL + "?track=1").path("taskId"));
        assertEquals(1, restart.list().size());
        assertEquals("QUEUED", restart.detail(task.path("taskId").asText()).path("status").asText());
        assertThrows(BusinessException.class, () -> restart.retry(task.path("taskId").asText()));
        assertThrows(BusinessException.class, () -> restart.detail("../outside"));
    }

    @Test void startFailureIsSpecificAndRetryRetainsSameTask() {
        var service = service(true);
        String id = service.create(URL).path("taskId").asText();
        service.poll();
        assertEquals("WORKER_START_FAILED", service.detail(id).path("errorCode").asText());
        assertEquals("QUEUED", service.retry(id).path("status").asText());
        assertEquals(1, service.list().size());
    }

    @Test void adoptsCompletionAndReturnsSafeResultWithoutProcessIdentity() throws Exception {
        var service = service(false);
        String id = service.create(URL).path("taskId").asText();
        Path job = root.resolve("imports/jobs").resolve(id);
        ObjectNode state = (ObjectNode) mapper.readTree(Files.readAllBytes(job.resolve("state.json")));
        state.put("status", "RUNNING"); state.put("attempt", 1); state.put("pid", 99999999);
        state.put("startedAt", "2020-01-01T00:00:00Z"); state.put("processStartedAt", "2020-01-01T00:00:00Z");
        Files.write(job.resolve("state.json"), mapper.writeValueAsBytes(state));
        Files.createDirectories(job.resolve("attempt-1"));
        Files.writeString(job.resolve("attempt-1/completion.json"),
                "{\"attempt\":1,\"status\":\"WAITING_USER\",\"errorCode\":\"LOGIN_REQUIRED\",\"message\":\"需要登录\"}");
        var result = service.detail(id);
        assertEquals("WAITING_USER", result.path("status").asText());
        assertTrue(!result.has("pid") && !result.has("processStartedAt"));
        assertEquals("QUEUED", service.retry(id).path("status").asText());
    }
}
