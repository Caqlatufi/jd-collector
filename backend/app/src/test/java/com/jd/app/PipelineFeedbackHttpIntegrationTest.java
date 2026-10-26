package com.jd.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jd.interview.repo.InterviewRepository;
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
import java.util.stream.StreamSupport;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.datasource.url=jdbc:h2:mem:pipeline_feedback;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE;DATABASE_TO_LOWER=TRUE")
@ActiveProfiles("test")
class PipelineFeedbackHttpIntegrationTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired JobPostingRepository postings;
    @Autowired InterviewRepository interviews;
    private final HttpClient client = HttpClient.newHttpClient();
    private long companyId;
    private long resumeId;
    private long postingId;
    private final LocalDateTime appliedAt = LocalDateTime.now().minusDays(20).withNano(0);
    private final LocalDateTime interviewAt = LocalDateTime.now().plusDays(2).withNano(0);

    private HttpResponse<String> request(String method, String path, Object body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/jd-collector/api" + path));
        if (body == null) builder.method(method, HttpRequest.BodyPublishers.noBody());
        else builder.header("Content-Type", "application/json")
                .method(method, HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private JsonNode ok(String method, String path, Object body) throws Exception {
        var response = request(method, path, body);
        assertThat(response.statusCode()).withFailMessage(response.body()).isEqualTo(200);
        return mapper.readTree(response.body()).path("result");
    }

    private long createPosting() throws Exception {
        return ok("POST", "/postings", Map.of("companyId", companyId, "title", "反馈流程测试岗位",
                "direction", "FULL_STACK", "source", "OTHER", "rawJd", "测试JD正文", "matchScore", 30,
                "companyScore", 15, "freshnessScore", 10, "commuteScore", 0, "salaryScore", 10)).path("id").asLong();
    }

    @BeforeEach
    void setup() throws Exception {
        companyId = ok("POST", "/companies", Map.of("name", "反馈测试-" + UUID.randomUUID(),
                "businessType", "UNKNOWN", "productOwnership", "UNKNOWN")).path("id").asLong();
        resumeId = ok("POST", "/resume-versions", Map.of("name", "测试投递简历", "type", "TARGETED", "versionLabel", "v1",
                "contentMarkdown", "# 测试候选人\n\n## 技能\nJava全栈", "active", true)).path("id").asLong();
        postingId = createPosting();
        ok("PUT", "/postings/" + postingId + "/stage", Map.of("toStage", "APPLIED", "resumeVersionId", resumeId,
                "appliedAt", appliedAt.toString()));
    }

    private Map<String, Object> schedule(String expected) {
        return Map.of("expectedStage", expected, "scheduledAt", interviewAt.toString(), "type", "TECHNICAL",
                "format", "ONLINE", "note", "会议链接待招聘方发送");
    }

    private JsonNode application() throws Exception {
        return StreamSupport.stream(ok("GET", "/dashboard/today", null).path("planItems").spliterator(), false)
                .filter(p -> p.path("id").asText().equals("application-" + postingId)).findFirst().orElseThrow();
    }

    private void assertOriginalApplication() {
        var stored = postings.findById(postingId).orElseThrow();
        assertThat(stored.getResumeVersionId()).isEqualTo(resumeId);
        assertThat(stored.getAppliedAt()).isEqualTo(appliedAt);
    }

    @Test
    void scheduleCreatesInterviewStageAndTimelineAtomicallyWithoutResubmittingResumeOrApplicationTime() throws Exception {
        assertThat(application().path("status").asText()).isEqualTo("TIMED_OUT");
        var interview = ok("POST", "/postings/" + postingId + "/interview-schedule", schedule("APPLIED"));
        assertThat(interview.path("roundNo").asInt()).isEqualTo(1);
        assertThat(interview.path("status").asText()).isEqualTo("SCHEDULED");
        assertThat(interview.path("nextStep").asText()).isEqualTo("会议链接待招聘方发送");
        assertOriginalApplication();
        var stored = postings.findById(postingId).orElseThrow();
        assertThat(stored.getStage()).isEqualTo(PostingEnums.Stage.INTERVIEW);
        assertThat(stored.getNextActionAt()).isEqualTo(interviewAt);
        assertThat(interviews.findById(interview.path("id").asLong()).orElseThrow().getScheduledAt()).isEqualTo(interviewAt);
        var plans = ok("GET", "/dashboard/today", null).path("planItems");
        assertThat(StreamSupport.stream(plans.spliterator(), false)
                .filter(p -> p.path("postingId").asLong() == postingId).map(p -> p.path("kind").asText()).toList())
                .containsExactlyInAnyOrder("APPLICATION", "INTERVIEW");
        assertThat(application().path("status").asText()).isEqualTo("FEEDBACK_RECEIVED");
        assertThat(ok("GET", "/postings/" + postingId + "/events", null).size()).isEqualTo(2);
    }

    @Test
    void rejectionNeedsOnlyResultAndOptionalReasonAndEndsFeedbackReminder() throws Exception {
        ok("PUT", "/postings/" + postingId + "/stage", Map.of("toStage", "APPLIED", "nextAction", "询问进展",
                "nextActionAt", interviewAt.toString()));
        var result = ok("PUT", "/postings/" + postingId + "/result", Map.of("expectedStage", "APPLIED", "result", "REJECTED"));
        assertThat(result.path("stage").asText()).isEqualTo("REJECTED");
        assertOriginalApplication();
        var stored = postings.findById(postingId).orElseThrow();
        assertThat(stored.getNextAction()).isNull();
        assertThat(stored.getNextActionAt()).isNull();
        assertThat(interviews.findAllByJobPostingIdAndDeletedFalseOrderByScheduledAtAsc(postingId)).isEmpty();
        assertThat(application().path("status").asText()).isEqualTo("ENDED");
        assertThat(ok("GET", "/postings/" + postingId + "/events", null).toString()).contains("初筛不通过");
    }

    @Test
    void missingTimeStaleStageUnappliedAndDuplicateScheduleCannotPartiallyWrite() throws Exception {
        var before = ok("GET", "/postings/" + postingId, null);
        assertThat(request("POST", "/postings/" + postingId + "/interview-schedule",
                Map.of("expectedStage", "APPLIED", "type", "TECHNICAL", "format", "ONLINE")).statusCode()).isEqualTo(400);
        assertThat(request("POST", "/postings/" + postingId + "/interview-schedule", schedule("INTERVIEW")).statusCode()).isEqualTo(409);
        assertThat(request("PUT", "/postings/" + postingId + "/result", Map.of("expectedStage", "APPLIED", "result", "OFFER")).statusCode()).isEqualTo(409);
        assertThat(ok("GET", "/postings/" + postingId, null)).isEqualTo(before);
        assertThat(interviews.findAllByJobPostingIdAndDeletedFalseOrderByScheduledAtAsc(postingId)).isEmpty();
        long unapplied = createPosting();
        assertThat(request("POST", "/postings/" + unapplied + "/interview-schedule", schedule("SCREENED")).statusCode()).isEqualTo(409);
        assertThat(request("PUT", "/postings/" + unapplied + "/result", Map.of("expectedStage", "SCREENED", "result", "REJECTED")).statusCode()).isEqualTo(409);
        ok("POST", "/postings/" + postingId + "/interview-schedule", schedule("APPLIED"));
        var saved = ok("GET", "/postings/" + postingId, null);
        var events = ok("GET", "/postings/" + postingId + "/events", null);
        assertThat(request("POST", "/postings/" + postingId + "/interview-schedule", schedule("INTERVIEW")).statusCode()).isEqualTo(409);
        assertThat(request("PUT", "/postings/" + postingId + "/result", Map.of("expectedStage", "APPLIED", "result", "REJECTED")).statusCode()).isEqualTo(409);
        assertThat(ok("GET", "/postings/" + postingId, null)).isEqualTo(saved);
        assertThat(ok("GET", "/postings/" + postingId + "/events", null)).isEqualTo(events);
        assertThat(interviews.findAllByJobPostingIdAndDeletedFalseOrderByScheduledAtAsc(postingId)).hasSize(1);
    }

    @Test
    void nextRoundIsAutomaticAndOfferResultsKeepOriginalApplicationAndArchivedResume() throws Exception {
        var first = ok("POST", "/postings/" + postingId + "/interview-schedule", schedule("APPLIED"));
        ok("PUT", "/interviews/" + first.path("id").asLong(), Map.of("roundNo", 1, "type", "TECHNICAL", "format", "ONLINE",
                "scheduledAt", interviewAt.toString(), "status", "COMPLETED"));
        var second = ok("POST", "/postings/" + postingId + "/interview-schedule", schedule("INTERVIEW"));
        assertThat(second.path("roundNo").asInt()).isEqualTo(2);
        ok("PUT", "/interviews/" + second.path("id").asLong(), Map.of("roundNo", 2, "type", "TECHNICAL", "format", "ONLINE",
                "scheduledAt", interviewAt.toString(), "status", "COMPLETED"));
        ok("POST", "/resume-versions/" + resumeId + "/archive", Map.of());
        ok("PUT", "/postings/" + postingId + "/result", Map.of("expectedStage", "INTERVIEW", "result", "OFFER"));
        ok("PUT", "/postings/" + postingId + "/result", Map.of("expectedStage", "OFFER", "result", "ACCEPTED"));
        assertOriginalApplication();
        assertThat(postings.findById(postingId).orElseThrow().getStage()).isEqualTo(PostingEnums.Stage.ACCEPTED);
        assertThat(request("POST", "/postings/" + postingId + "/interview-schedule", schedule("ACCEPTED")).statusCode()).isEqualTo(409);
    }
    @Test
    void correctingApplicationDatePreservesStageResumeAndEventsAndRejectsStaleOrFutureWrites() throws Exception {
        var eventsBefore = ok("GET", "/postings/" + postingId + "/events", null);
        var corrected = appliedAt.minusDays(6);
        var result = ok("PUT", "/postings/" + postingId + "/application-date",
                Map.of("expectedAppliedAt", appliedAt.toString(), "appliedAt", corrected.toString()));
        assertThat(result.path("appliedAt").asText()).startsWith(corrected.toString());
        assertThat(postings.findById(postingId).orElseThrow().getAppliedAt()).isEqualTo(corrected);
        assertThat(result.path("stage").asText()).isEqualTo("APPLIED");
        assertThat(result.path("resumeVersionId").asLong()).isEqualTo(resumeId);
        assertThat(ok("GET", "/postings/" + postingId + "/events", null)).isEqualTo(eventsBefore);
        assertThat(request("PUT", "/postings/" + postingId + "/application-date",
                Map.of("expectedAppliedAt", appliedAt.toString(), "appliedAt", appliedAt.toString())).statusCode()).isEqualTo(409);
        assertThat(request("PUT", "/postings/" + postingId + "/application-date",
                Map.of("expectedAppliedAt", corrected.toString(), "appliedAt", LocalDateTime.now().plusDays(1).toString())).statusCode()).isEqualTo(409);
        assertThat(application().path("scheduledAt").asText()).startsWith(corrected.toString());
    }

    @Test
    void completedInterviewClearsOnlyItsOwnTodoAndEditingClosedHistoryCannotReopenPosting() throws Exception {
        var first = ok("POST", "/postings/" + postingId + "/interview-schedule", schedule("APPLIED"));
        long id = first.path("id").asLong();
        var data = Map.of("roundNo", 1, "type", "TECHNICAL", "format", "ONLINE",
                "scheduledAt", interviewAt.toString(), "status", "COMPLETED", "feedback", "技术面已完成");
        ok("PUT", "/interviews/" + id, data);
        assertThat(postings.findById(postingId).orElseThrow().getNextActionAt()).isNull();
        var second = ok("POST", "/postings/" + postingId + "/interview-schedule", schedule("INTERVIEW"));
        assertThat(second.path("roundNo").asInt()).isEqualTo(2);
        ok("PUT", "/interviews/" + id, data);
        assertThat(postings.findById(postingId).orElseThrow().getNextAction()).isEqualTo("参加第 2 轮面试");
        ok("PUT", "/postings/" + postingId + "/result", Map.of("expectedStage", "INTERVIEW", "result", "REJECTED"));
        ok("PUT", "/interviews/" + id, Map.of("roundNo", 1, "type", "TECHNICAL", "format", "ONSITE",
                "scheduledAt", interviewAt.minusDays(1).toString(), "status", "SCHEDULED"));
        var stored = postings.findById(postingId).orElseThrow();
        assertThat(stored.getStage()).isEqualTo(PostingEnums.Stage.REJECTED);
        assertThat(stored.getNextActionAt()).isNull();
        assertThat(stored.getAppliedAt()).isEqualTo(appliedAt);
    }

    @Test
    void editingMilestoneChangesOnlyItsTimeAndNoteAndChecksOwnershipAndVersion() throws Exception {
        ok("PUT", "/postings/" + postingId + "/result", Map.of("expectedStage", "APPLIED", "result", "REJECTED"));
        var event = ok("GET", "/postings/" + postingId + "/events", null).get(0);
        String endpoint = "/postings/" + postingId + "/events/" + event.path("id").asLong();
        var changes = Map.of("expectedOccurredAt", event.path("occurredAt").asText(),
                "occurredAt", appliedAt.plusDays(1).toString(), "note", "招聘方拒绝");
        ok("PUT", endpoint, changes);
        assertThat(StreamSupport.stream(ok("GET", "/postings/" + postingId + "/events", null).spliterator(), false)
                .filter(e -> e.path("id").asLong() == event.path("id").asLong()).findFirst().orElseThrow()
                .path("note").asText()).isEqualTo("招聘方拒绝");
        assertThat(postings.findById(postingId).orElseThrow().getStage()).isEqualTo(PostingEnums.Stage.REJECTED);
        assertThat(request("PUT", endpoint, changes).statusCode()).isEqualTo(409);
        long other = createPosting();
        assertThat(request("PUT", "/postings/" + other + "/events/" + event.path("id").asLong(), changes).statusCode()).isEqualTo(404);
    }

}
