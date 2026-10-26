package com.jd.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jd.posting.model.PostingEnums;
import com.jd.posting.repo.JobPostingRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Map;
import java.util.UUID;
import java.util.stream.StreamSupport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.datasource.url=jdbc:h2:mem:dashboard_application_test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE;DATABASE_TO_LOWER=TRUE")
@ActiveProfiles("test")
class DashboardApplicationHttpIntegrationTest {
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 19, 12, 0);
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired JobPostingRepository repository;
    @MockBean(name = "dashboardClock") Clock clock;
    private final HttpClient client = HttpClient.newHttpClient();
    private long companyId;
    private long resumeId;

    private JsonNode request(String method, String path, Object body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/jd-collector/api" + path));
        if (body == null) builder.method(method, HttpRequest.BodyPublishers.noBody());
        else builder.header("Content-Type", "application/json")
                .method(method, HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        var response = client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).withFailMessage(response.body()).isEqualTo(200);
        return mapper.readTree(response.body()).path("result");
    }

    @BeforeEach
    void setup() throws Exception {
        when(clock.getZone()).thenReturn(ZONE);
        when(clock.instant()).thenReturn(NOW.atZone(ZONE).toInstant());
        companyId = request("POST", "/companies", Map.of("name", "投递时间图测试-" + UUID.randomUUID(),
                "businessType", "UNKNOWN", "productOwnership", "UNKNOWN")).path("id").asLong();
        resumeId = request("POST", "/resume-versions", Map.of("name", "时间图测试简历", "type", "TARGETED",
                "versionLabel", "v1", "active", true, "contentMarkdown", "# 测试候选人\n\n## 技能\nJava开发")).path("id").asLong();
    }

    private long posting() throws Exception {
        return request("POST", "/postings", Map.of("companyId", companyId, "title", "时间图测试岗位",
                "direction", "JAVA_BACKEND", "source", "OTHER", "rawJd", "测试岗位正文",
                "matchScore", 30, "companyScore", 15, "freshnessScore", 10, "commuteScore", 0, "salaryScore", 10))
                .path("id").asLong();
    }

    private long apply(LocalDateTime at) throws Exception {
        long id = posting();
        request("PUT", "/postings/" + id + "/stage", Map.of("toStage", "APPLIED", "resumeVersionId", resumeId,
                "appliedAt", at.toString()));
        return id;
    }

    private JsonNode application(long id) throws Exception {
        return StreamSupport.stream(request("GET", "/dashboard/today", null).path("planItems").spliterator(), false)
                .filter(p -> p.path("id").asText().equals("application-" + id)).findFirst().orElse(null);
    }

    @Test
    void applicationAppearsWithoutFollowUpAndBecomesAbnormalOnlyAfterFourteenDays() throws Exception {
        long id = apply(NOW.minusDays(14));
        var before = request("GET", "/postings/" + id, null);
        var events = request("GET", "/postings/" + id + "/events", null);
        assertThat(before.hasNonNull("nextAction")).isFalse();
        assertThat(before.hasNonNull("nextActionAt")).isFalse();
        assertThat(application(id).path("status").asText()).isEqualTo("WAITING_FEEDBACK");
        assertThat(application(id).path("feedbackDueAt").asText()).isEqualTo(NOW.toString() + ":00");
        when(clock.instant()).thenReturn(NOW.plusSeconds(1).atZone(ZONE).toInstant());
        var late = application(id);
        assertThat(late.path("status").asText()).isEqualTo("TIMED_OUT");
        assertThat(late.path("elapsedDays").asLong()).isEqualTo(14);
        assertThat(request("GET", "/postings/" + id, null)).isEqualTo(before);
        assertThat(request("GET", "/postings/" + id + "/events", null)).isEqualTo(events);
        assertThat(repository.findById(id).orElseThrow().getStage()).isEqualTo(PostingEnums.Stage.APPLIED);
    }

    @Test
    void recordedFeedbackAndInterviewStopAlertEvenAfterReturningToApplied() throws Exception {
        for (String stage : new String[]{"HR_SCREEN", "WRITTEN_TEST", "INTERVIEW", "OFFER"}) {
            long id = apply(NOW.minusDays(30));
            request("PUT", "/postings/" + id + "/stage", Map.of("toStage", stage));
            assertThat(application(id).path("status").asText()).isEqualTo("FEEDBACK_RECEIVED");
            request("PUT", "/postings/" + id + "/stage", Map.of("toStage", "APPLIED"));
            assertThat(application(id).path("status").asText()).isEqualTo("FEEDBACK_RECEIVED");
        }
        long id = apply(NOW.minusDays(30));
        request("POST", "/postings/" + id + "/interviews", Map.of("roundNo", 1, "type", "TECHNICAL", "format", "ONLINE",
                "scheduledAt", NOW.plusDays(1).toString(), "status", "SCHEDULED"));
        assertThat(application(id).path("status").asText()).isEqualTo("FEEDBACK_RECEIVED");
    }

    @Test
    void closureStopsAlertAndArchivedAndUnappliedJobsAreExcludedWhileSkipTierKeepsApplicationFact() throws Exception {
        assertThat(application(posting())).isNull();
        for (String stage : new String[]{"REJECTED", "WITHDRAWN", "CLOSED", "ACCEPTED"}) {
            long id = apply(NOW.minusDays(30));
            request("PUT", "/postings/" + id + "/stage", Map.of("toStage", stage));
            assertThat(application(id).path("status").asText()).isEqualTo(stage.equals("ACCEPTED") ? "COMPLETED" : "ENDED");
        }
        long archived = apply(NOW.minusDays(30));
        request("PUT", "/postings/" + archived + "/archive", Map.of());
        assertThat(application(archived)).isNull();
        long skipped = apply(NOW.minusDays(30));
        var stored = repository.findById(skipped).orElseThrow();
        stored.setTier(PostingEnums.Tier.SKIP);
        repository.saveAndFlush(stored);
        assertThat(application(skipped).path("status").asText()).isEqualTo("TIMED_OUT");
    }

    @Test
    void timelineKeepsEveryRecordedMilestoneAndInterviewAfterClosure() throws Exception {
        long id = apply(NOW.minusDays(10));
        for (String stage : new String[]{"HR_SCREEN", "WRITTEN_TEST"}) {
            request("PUT", "/postings/" + id + "/stage", Map.of("toStage", stage,
                    "occurredAt", NOW.minusDays(stage.equals("HR_SCREEN") ? 8 : 6).toString()));
        }
        long interviewId = request("POST", "/postings/" + id + "/interviews", Map.of("roundNo", 1,
                "type", "TECHNICAL", "format", "ONLINE", "scheduledAt", NOW.minusDays(2).toString(),
                "status", "COMPLETED")).path("id").asLong();
        request("PUT", "/postings/" + id + "/stage", Map.of("toStage", "REJECTED", "occurredAt", NOW.toString()));
        var before = request("GET", "/postings/" + id + "/events", null);
        var items = StreamSupport.stream(request("GET", "/dashboard/today", null).path("planItems").spliterator(), false)
                .filter(p -> p.path("postingId").asLong() == id).toList();
        assertThat(items).filteredOn(p -> p.path("kind").asText().equals("APPLICATION")).hasSize(1);
        assertThat(items).filteredOn(p -> p.path("kind").asText().equals("INTERVIEW"))
                .singleElement().satisfies(p -> {
                    assertThat(p.path("interviewId").asLong()).isEqualTo(interviewId);
                    assertThat(p.path("status").asText()).isEqualTo("COMPLETED");
                });
        assertThat(items).filteredOn(p -> p.path("kind").asText().equals("STAGE"))
                .extracting(p -> p.path("title").asText()).containsExactly("HR沟通", "笔试", "被拒");
        assertThat(request("GET", "/postings/" + id + "/events", null)).isEqualTo(before);
        assertThat(repository.findById(id).orElseThrow().getStage()).isEqualTo(PostingEnums.Stage.REJECTED);
    }

    @Test
    void futureFollowUpAndPostingEditsDoNotCountAsFeedbackOrResetApplicationTimer() throws Exception {
        long id = apply(NOW.minusDays(30));
        request("PUT", "/postings/" + id + "/stage", Map.of("toStage", "APPLIED", "nextAction", "下周询问HR",
                "nextActionAt", NOW.plusDays(7).toString()));
        var stored = repository.findById(id).orElseThrow();
        stored.setRiskNotes("更新风险说明不代表收到反馈");
        repository.saveAndFlush(stored);
        assertThat(application(id).path("status").asText()).isEqualTo("TIMED_OUT");
        assertThat(application(id).path("elapsedDays").asLong()).isEqualTo(30);
        assertThat(application(id).path("scheduledAt").asText()).startsWith("2026-09-19");
    }
}
