package com.jd.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class ContactStageHttpIntegrationTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired JobPostingRepository repository;
    private final HttpClient client = HttpClient.newHttpClient();
    private long postingId;

    private HttpRequest httpRequest(String method, String path, Object body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/jd-collector/api" + path));
        if (body == null) builder.method(method, HttpRequest.BodyPublishers.noBody());
        else builder.header("Content-Type", "application/json")
                .method(method, HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        return builder.build();
    }

    private HttpResponse<String> request(String method, String path, Object body) throws Exception {
        return client.send(httpRequest(method, path, body), HttpResponse.BodyHandlers.ofString());
    }

    private JsonNode result(HttpResponse<String> response) throws Exception {
        assertThat(response.statusCode()).withFailMessage("HTTP %s: %s", response.statusCode(), response.body()).isEqualTo(200);
        return mapper.readTree(response.body()).path("result");
    }

    private HttpResponse<String> contact(String to, String expected) throws Exception {
        return request("PUT", "/postings/" + postingId + "/contact-stage", Map.of("toStage", to, "expectedStage", expected));
    }

    private JsonNode events() throws Exception {
        return result(request("GET", "/postings/" + postingId + "/events", null));
    }

    private long createResume() throws Exception {
        return result(request("POST", "/resume-versions", Map.of("name", "阶段测试简历", "type", "TARGETED", "versionLabel", "test-v1",
                "contentMarkdown", "# 测试候选人\n## 技能\nJava后端", "active", true))).path("id").asLong();
    }

    @BeforeEach
    void setup() throws Exception {
        long companyId = result(request("POST", "/companies", Map.of("name", "投递前进度测试-" + UUID.randomUUID(),
                "businessType", "UNKNOWN", "productOwnership", "UNKNOWN"))).path("id").asLong();
        postingId = result(request("POST", "/postings", Map.of("companyId", companyId, "title", "投递前进度测试岗位",
                "direction", "JAVA_BACKEND", "source", "OTHER", "rawJd", "测试JD", "matchScore", 30, "companyScore", 15,
                "freshnessScore", 10, "commuteScore", 10, "salaryScore", 10))).path("id").asLong();
    }

    @Test
    void contactProgressPersistsWithHistoryWithoutRecordingAnApplication() throws Exception {
        String previous = "SCREENED";
        int count = 0;
        for (String stage : List.of("MESSAGE_SENT", "WAITING_COMMUNICATION", "CONTACT_NOT_SUITABLE", "SCREENED")) {
            JsonNode updated = result(contact(stage, previous));
            assertThat(updated.path("stage").asText()).isEqualTo(stage);
            var stored = repository.findByIdAndDeletedFalse(postingId).orElseThrow();
            assertThat(stored.getStage().name()).isEqualTo(stage);
            assertThat(stored.getAppliedAt()).isNull();
            assertThat(stored.getResumeVersionId()).isNull();
            assertThat(stored.getNextActionAt()).isNull();
            assertThat(stored.getNextAction()).isNull();
            JsonNode history = events();
            assertThat(history.size()).isEqualTo(++count);
            assertThat(history.get(0).path("fromStage").asText()).isEqualTo(previous);
            assertThat(history.get(0).path("toStage").asText()).isEqualTo(stage);
            assertThat(result(request("GET", "/postings?stage=" + stage + "&size=100", null)).toString()).contains("\"id\":" + postingId);
            assertThat(result(request("GET", "/postings?stage=APPLIED&size=100", null)).toString()).doesNotContain("\"id\":" + postingId + ",");
            previous = stage;
        }
    }

    @Test
    void staleSelectionAndInvalidTargetsFailWithoutAddingHistoryAndSameStageIsANoop() throws Exception {
        result(contact("MESSAGE_SENT", "SCREENED"));
        assertThat(contact("WAITING_COMMUNICATION", "SCREENED").statusCode()).isEqualTo(409);
        assertThat(contact("APPLIED", "MESSAGE_SENT").statusCode()).isEqualTo(400);
        assertThat(request("PUT", "/postings/" + postingId + "/contact-stage", Map.of("toStage", "SCREENED")).statusCode()).isEqualTo(400);
        assertThat(request("PUT", "/postings/999999/contact-stage", Map.of("toStage", "SCREENED", "expectedStage", "SCREENED")).statusCode()).isEqualTo(404);
        assertThat(result(contact("MESSAGE_SENT", "MESSAGE_SENT")).path("stage").asText()).isEqualTo("MESSAGE_SENT");
        assertThat(events().size()).isEqualTo(1);
        assertThat(repository.findByIdAndDeletedFalse(postingId).orElseThrow().getStage()).isEqualTo(PostingEnums.Stage.MESSAGE_SENT);
    }

    @Test
    void actualApplicationAndItsClosedHistoryAreProtectedAgainstBothContactAndLegacyStageWrites() throws Exception {
        result(contact("WAITING_COMMUNICATION", "SCREENED"));
        long resumeId = createResume();
        String date = LocalDateTime.now().withNano(0).toString();
        result(request("PUT", "/postings/" + postingId + "/stage", Map.of("toStage", "APPLIED", "resumeVersionId", resumeId, "appliedAt", date)));
        JsonNode before = result(request("GET", "/postings/" + postingId, null));
        assertThat(contact("MESSAGE_SENT", "APPLIED").statusCode()).isEqualTo(409);
        assertThat(request("PUT", "/postings/" + postingId + "/stage", Map.of("toStage", "SCREENED")).statusCode()).isEqualTo(409);
        assertThat(result(request("GET", "/postings/" + postingId, null))).isEqualTo(before);
        assertThat(events().size()).isEqualTo(2);
        result(request("PUT", "/postings/" + postingId + "/stage", Map.of("toStage", "CLOSED")));
        assertThat(contact("WAITING_COMMUNICATION", "CLOSED").statusCode()).isEqualTo(409);
        var stored = repository.findByIdAndDeletedFalse(postingId).orElseThrow();
        assertThat(stored.getStage()).isEqualTo(PostingEnums.Stage.CLOSED);
        assertThat(stored.getResumeVersionId()).isEqualTo(resumeId);
        assertThat(stored.getAppliedAt()).isEqualTo(LocalDateTime.parse(date));
    }

    @Test
    void simultaneousContactSelectionsCannotBothOverwriteTheSameObservedStage() throws Exception {
        var first = client.sendAsync(httpRequest("PUT", "/postings/" + postingId + "/contact-stage",
                Map.of("toStage", "MESSAGE_SENT", "expectedStage", "SCREENED")), HttpResponse.BodyHandlers.ofString());
        var second = client.sendAsync(httpRequest("PUT", "/postings/" + postingId + "/contact-stage",
                Map.of("toStage", "WAITING_COMMUNICATION", "expectedStage", "SCREENED")), HttpResponse.BodyHandlers.ofString());
        assertThat(List.of(first.join().statusCode(), second.join().statusCode())).containsExactlyInAnyOrder(200, 409);
        assertThat(events().size()).isEqualTo(1);
    }

    @Test
    void concurrentApplicationAlwaysFinishesAsAppliedAndCannotBeOverwrittenByAContactRequest() throws Exception {
        long resumeId = createResume();
        var contact = client.sendAsync(httpRequest("PUT", "/postings/" + postingId + "/contact-stage",
                Map.of("toStage", "MESSAGE_SENT", "expectedStage", "SCREENED")), HttpResponse.BodyHandlers.ofString());
        var application = client.sendAsync(httpRequest("PUT", "/postings/" + postingId + "/stage",
                Map.of("toStage", "APPLIED", "resumeVersionId", resumeId, "appliedAt", LocalDateTime.now().withNano(0).toString())),
                HttpResponse.BodyHandlers.ofString());
        assertThat(application.join().statusCode()).isEqualTo(200);
        int contactStatus = contact.join().statusCode();
        assertThat(contactStatus).isIn(200, 409);
        var stored = repository.findByIdAndDeletedFalse(postingId).orElseThrow();
        assertThat(stored.getStage()).isEqualTo(PostingEnums.Stage.APPLIED);
        assertThat(stored.getResumeVersionId()).isEqualTo(resumeId);
        assertThat(stored.getAppliedAt()).isNotNull();
        assertThat(events().size()).isEqualTo(contactStatus == 200 ? 2 : 1);
    }

    @Test
    void removingTheListColumnDoesNotEraseSavedFollowUpAndUnappliedClosedJobsRemainEditable() throws Exception {
        String date = LocalDateTime.now().plusDays(3).withNano(0).toString();
        result(request("PUT", "/postings/" + postingId + "/stage", Map.of("toStage", "READY_TO_APPLY", "nextAction", "旧计划", "nextActionAt", date)));
        result(contact("MESSAGE_SENT", "READY_TO_APPLY"));
        var stored = repository.findByIdAndDeletedFalse(postingId).orElseThrow();
        assertThat(stored.getNextAction()).isEqualTo("旧计划");
        assertThat(stored.getNextActionAt()).isEqualTo(LocalDateTime.parse(date));
        result(contact("CLOSED", "MESSAGE_SENT"));
        result(contact("WAITING_COMMUNICATION", "CLOSED"));
        assertThat(repository.findByIdAndDeletedFalse(postingId).orElseThrow().getStage()).isEqualTo(PostingEnums.Stage.WAITING_COMMUNICATION);
    }
}
