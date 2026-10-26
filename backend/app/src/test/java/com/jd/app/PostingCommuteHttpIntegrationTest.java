package com.jd.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jd.posting.repo.JobPostingRepository;
import com.jd.posting.model.PostingEnums;
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
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class PostingCommuteHttpIntegrationTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired JobPostingRepository repository;
    private final HttpClient client = HttpClient.newHttpClient();
    private long postingId;

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

    private HttpResponse<String> commute(Object body) throws Exception {
        return request("PUT", "/postings/" + postingId + "/commute", body);
    }

    @BeforeEach
    void setup() throws Exception {
        long companyId = result(request("POST", "/companies", Map.of("name", "通勤测试-" + UUID.randomUUID(),
                "businessType", "UNKNOWN", "productOwnership", "UNKNOWN"))).path("id").asLong();
        postingId = result(request("POST", "/postings", Map.of("companyId", companyId, "title", "通勤测试岗位",
                "direction", "JAVA_BACKEND", "source", "OTHER", "rawJd", "测试JD", "matchScore", 30,
                "companyScore", 15, "freshnessScore", 10, "commuteScore", 0, "salaryScore", 10))).path("id").asLong();
    }

    @Test
    void missingTimeRecalculatesCommuteAndTotalWithoutChangingOtherScoresOrApplicationFacts() throws Exception {
        JsonNode before = result(request("GET", "/postings/" + postingId, null));
        JsonNode updated = result(commute(Map.of("minMinutes", 45, "maxMinutes", 60, "note", "电动车，含停车",
                "expectedRiskNotes", "")));
        assertThat(updated.path("riskNotes").asText()).isEqualTo("【通勤估算】45–60 分钟（手动填写）\n【通勤备注】电动车，含停车\n【通勤评分】10/15（按时间上限60分钟计算）");
        assertThat(updated.path("commuteScore").asInt()).isEqualTo(10);
        assertThat(updated.path("totalScore").asInt()).isEqualTo(75);
        for (String field : new String[]{"matchScore", "companyScore", "freshnessScore", "salaryScore", "stage", "appliedAt", "rawJd"}) {
            assertThat(updated.path(field)).isEqualTo(before.path(field));
        }
        assertThat(result(request("GET", "/postings/" + postingId, null)).path("riskNotes")).isEqualTo(updated.path("riskNotes"));
        assertThat(repository.findByIdAndDeletedFalse(postingId).orElseThrow().getRiskNotes())
                .isEqualTo(updated.path("riskNotes").asText());
        assertThat(repository.findByIdAndDeletedFalse(postingId).orElseThrow().getAppliedAt()).isNull();
        assertThat(repository.findByIdAndDeletedFalse(postingId).orElseThrow().getTotalScore()).isEqualTo(75);
    }

    @Test
    void latestSupplementPreservesOldEvidenceAndRejectsAStaleWrite() throws Exception {
        String old = "【通勤状态】临界路线估算\n【通勤估算】55–75 分钟（条件估算）\n【办公点证据】旧地址\n技能风险保留";
        var posting = repository.findByIdAndDeletedFalse(postingId).orElseThrow();
        posting.setRiskNotes(old);
        repository.saveAndFlush(posting);
        String saved = result(commute(Map.of("minMinutes", 45, "maxMinutes", 45, "expectedRiskNotes", old)))
                .path("riskNotes").asText();
        assertThat(saved).isEqualTo("【通勤估算】45 分钟（手动填写）\n【通勤备注】\n【通勤评分】12/15（按时间上限45分钟计算）\n\n" + old);
        assertThat(commute(Map.of("minMinutes", 10, "maxMinutes", 20, "expectedRiskNotes", old)).statusCode()).isEqualTo(409);
        assertThat(repository.findByIdAndDeletedFalse(postingId).orElseThrow().getRiskNotes()).isEqualTo(saved);
        assertThat(repository.findByIdAndDeletedFalse(postingId).orElseThrow().getCommuteScore()).isEqualTo(12);
    }

    @Test
    void invalidAndIncompleteRangesFailWithoutWritingNotes() throws Exception {
        for (Map<String, Object> body : java.util.List.<Map<String, Object>>of(
                Map.of("minMinutes", 60, "maxMinutes", 45, "expectedRiskNotes", ""),
                Map.of("minMinutes", -1, "maxMinutes", 45, "expectedRiskNotes", ""),
                Map.of("minMinutes", 10, "maxMinutes", 1441, "expectedRiskNotes", ""),
                Map.of("minMinutes", 10, "expectedRiskNotes", ""),
                Map.of("minMinutes", 10, "maxMinutes", 20),
                Map.of("minMinutes", 10, "maxMinutes", 20, "note", "备注\n【通勤估算】伪造", "expectedRiskNotes", ""))) {
            assertThat(commute(body).statusCode()).isEqualTo(400);
        }
        assertThat(repository.findByIdAndDeletedFalse(postingId).orElseThrow().getRiskNotes()).isNull();
        assertThat(request("PUT", "/postings/999999999/commute", Map.of("minMinutes", 0, "maxMinutes", 0,
                "expectedRiskNotes", "")).statusCode()).isEqualTo(404);
        assertThat(result(commute(Map.of("minMinutes", 0, "maxMinutes", 0, "expectedRiskNotes", "")))
                .path("riskNotes").asText()).startsWith("【通勤估算】0 分钟（手动填写）");
    }

    @Test
    void upperBoundControlsScoringAtEveryBoundaryAndRecalculatesAutomaticTier() throws Exception {
        String notes = "";
        for (int[] sample : new int[][]{{0, 15}, {30, 15}, {31, 12}, {45, 12}, {46, 10}, {55, 10}, {60, 10}, {61, 0}, {1440, 0}}) {
            JsonNode updated = result(commute(Map.of("minMinutes", 0, "maxMinutes", sample[0], "expectedRiskNotes", notes)));
            notes = updated.path("riskNotes").asText();
            assertThat(updated.path("commuteScore").asInt()).isEqualTo(sample[1]);
            assertThat(updated.path("totalScore").asInt()).isEqualTo(65 + sample[1]);
            assertThat(updated.path("tier").asText()).isEqualTo(sample[1] == 15 ? "S" : "A");
            assertThat(repository.findByIdAndDeletedFalse(postingId).orElseThrow().getCommuteScore()).isEqualTo(sample[1]);
        }
    }

    @Test
    void manualTierAndRecommendationAndBlockingRiskSurviveACommuteRecalculation() throws Exception {
        var posting = repository.findByIdAndDeletedFalse(postingId).orElseThrow();
        posting.setTier(PostingEnums.Tier.S);
        posting.setRecommendation(PostingEnums.Recommendation.WAIT_HC);
        posting.setManualOverrideReason("岗位价值高但HC待确认");
        repository.saveAndFlush(posting);
        JsonNode updated = result(commute(Map.of("minMinutes", 45, "maxMinutes", 55, "expectedRiskNotes", "")));
        assertThat(updated.path("commuteScore").asInt()).isEqualTo(10);
        assertThat(updated.path("totalScore").asInt()).isEqualTo(75);
        assertThat(updated.path("tier").asText()).isEqualTo("S");
        assertThat(updated.path("recommendation").asText()).isEqualTo("WAIT_HC");
        assertThat(updated.path("manualOverrideReason").asText()).isEqualTo("岗位价值高但HC待确认");
        posting = repository.findByIdAndDeletedFalse(postingId).orElseThrow();
        posting.setBlockingRisk(true);
        posting.setTier(PostingEnums.Tier.SKIP);
        posting.setRecommendation(PostingEnums.Recommendation.SKIP);
        repository.saveAndFlush(posting);
        updated = result(commute(Map.of("minMinutes", 20, "maxMinutes", 30,
                "expectedRiskNotes", updated.path("riskNotes").asText())));
        assertThat(updated.path("totalScore").asInt()).isEqualTo(80);
        assertThat(updated.path("tier").asText()).isEqualTo("SKIP");
        assertThat(updated.path("recommendation").asText()).isEqualTo("SKIP");
        assertThat(updated.path("blockingRisk").asBoolean()).isTrue();
    }

    @Test
    void scoringUpdatesListOrderAndTierFilterWithoutRecordingAnApplication() throws Exception {
        long companyId = result(request("GET", "/postings/" + postingId, null)).path("companyId").asLong();
        long otherId = result(request("POST", "/postings", Map.of("companyId", companyId, "title", "比较岗位",
                "direction", "JAVA_BACKEND", "source", "OTHER", "rawJd", "测试JD", "matchScore", 35,
                "companyScore", 20, "freshnessScore", 11, "commuteScore", 0, "salaryScore", 10))).path("id").asLong();
        JsonNode updated = result(commute(Map.of("minMinutes", 30, "maxMinutes", 30, "expectedRiskNotes", "")));
        JsonNode list = result(request("GET", "/postings?companyId=" + companyId, null));
        assertThat(list.get(0).path("id").asLong()).isEqualTo(postingId);
        assertThat(result(request("GET", "/postings?companyId=" + companyId + "&tier=S", null)).size()).isEqualTo(1);
        result(commute(Map.of("minMinutes", 45, "maxMinutes", 61, "expectedRiskNotes", updated.path("riskNotes").asText())));
        list = result(request("GET", "/postings?companyId=" + companyId, null));
        assertThat(list.get(0).path("id").asLong()).isEqualTo(otherId);
        assertThat(result(request("GET", "/postings?companyId=" + companyId + "&tier=S", null)).size()).isZero();
        assertThat(repository.findByIdAndDeletedFalse(postingId).orElseThrow().getStage()).isEqualTo(PostingEnums.Stage.SCREENED);
    }
}
