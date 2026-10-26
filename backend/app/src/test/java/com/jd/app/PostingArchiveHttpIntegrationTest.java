package com.jd.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.jd.pipeline.event.model.StageEvent;
import com.jd.pipeline.event.repo.StageEventRepository;
import com.jd.posting.model.PostingEnums;
import com.jd.posting.repo.JobPostingRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class PostingArchiveHttpIntegrationTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired JobPostingRepository repository;
    @Autowired StageEventRepository events;
    private final HttpClient client = HttpClient.newHttpClient();
    private long companyId;
    private long postingId;
    private long otherId;

    private HttpResponse<String> request(String method, String path, Object body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/jd-collector/api" + path));
        if (body == null) builder.method(method, HttpRequest.BodyPublishers.noBody());
        else builder.header("Content-Type", "application/json")
                .method(method, HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private JsonNode result(HttpResponse<String> response) throws Exception {
        assertThat(response.statusCode()).withFailMessage("HTTP %s: %s", response.statusCode(), response.body()).isEqualTo(200);
        return mapper.readTree(response.body()).path("result");
    }

    private long createPosting(String title) throws Exception {
        return result(request("POST", "/postings", Map.of("companyId", companyId, "title", title,
                "direction", "JAVA_BACKEND", "source", "BOSS", "rawJd", "归档应保留的完整JD正文",
                "matchScore", 30, "companyScore", 15, "freshnessScore", 10, "commuteScore", 10,
                "salaryScore", 10))).path("id").asLong();
    }

    @BeforeEach
    void setup() throws Exception {
        companyId = result(request("POST", "/companies", Map.of("name", "归档测试-" + UUID.randomUUID(),
                "businessType", "UNKNOWN", "productOwnership", "UNKNOWN"))).path("id").asLong();
        postingId = createPosting("将被归档的岗位");
        otherId = createPosting("继续保留的岗位");
    }

    private void assertArchived() throws Exception {
        ObjectNode before = mapper.valueToTree(repository.findById(postingId).orElseThrow());
        JsonNode otherBefore = result(request("GET", "/postings/" + otherId, null));
        assertThat(result(request("PUT", "/postings/" + postingId + "/archive", null)).asBoolean()).isTrue();
        var stored = repository.findById(postingId).orElseThrow();
        assertThat(stored.getDeleted()).isTrue();
        ObjectNode after = mapper.valueToTree(stored);
        before.remove("deleted");
        before.remove("updatedAt");
        after.remove("deleted");
        after.remove("updatedAt");
        assertThat(after).isEqualTo(before);
        assertThat(repository.findByIdAndDeletedFalse(postingId)).isEmpty();
        assertThat(request("GET", "/postings/" + postingId, null).statusCode()).isEqualTo(404);
        for (String sort : new String[]{"SCORE", "BOSS_COMPETITION"}) {
            JsonNode rows = result(request("GET", "/postings?companyId=" + companyId + "&sortBy=" + sort, null));
            assertThat(rows.size()).isEqualTo(1);
            assertThat(rows.get(0).path("id").asLong()).isEqualTo(otherId);
        }
        var csv = request("GET", "/postings/export.csv?companyId=" + companyId, null);
        assertThat(csv.statusCode()).isEqualTo(200);
        assertThat(csv.body()).contains("继续保留的岗位").doesNotContain("将被归档的岗位");
        assertThat(result(request("GET", "/postings/" + otherId, null))).isEqualTo(otherBefore);
        assertThat(request("PUT", "/postings/" + postingId + "/archive", null).statusCode()).isEqualTo(404);
    }

    @Test
    void archiveHidesThePostingPersistentlyWithoutDeletingItsFactsOrChangingOtherRows() throws Exception {
        assertArchived();
    }

    @Test
    void archivingAnAppliedPostingPreservesApplicationFactsAndHistoricalEvents() throws Exception {
        var posting = repository.findById(postingId).orElseThrow();
        posting.setStage(PostingEnums.Stage.APPLIED);
        posting.setAppliedAt(LocalDateTime.of(2026, 10, 13, 10, 0));
        posting.setNextAction("已有跟进备注");
        posting.setNextActionAt(LocalDateTime.of(2026, 10, 15, 10, 0));
        repository.saveAndFlush(posting);
        StageEvent event = new StageEvent();
        event.setJobPostingId(postingId);
        event.setFromStage(PostingEnums.Stage.SCREENED);
        event.setToStage(PostingEnums.Stage.APPLIED);
        event.setOccurredAt(posting.getAppliedAt());
        event.setNote("原始投递记录");
        long eventId = events.saveAndFlush(event).getId();
        assertArchived();
        assertThat(events.findById(eventId).orElseThrow().getNote()).isEqualTo("原始投递记录");
        assertThat(events.findById(eventId).orElseThrow().getDeleted()).isFalse();
        assertThat(result(request("GET", "/postings?companyId=" + companyId + "&stage=APPLIED", null))).isEmpty();
    }
}
