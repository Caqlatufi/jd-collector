package com.jd.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.jd.posting.model.PostingEnums;
import com.jd.posting.repo.JobPostingRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class PostingBossCompetitionHttpIntegrationTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired JobPostingRepository repository;
    private final HttpClient client = HttpClient.newHttpClient();
    private long postingId;
    private String sourceUrl;

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

    private Map<String, Object> report() {
        return new HashMap<>(Map.of("expectedSourceUrl", sourceUrl, "status", "AVAILABLE", "rank", 1534,
                "competitorCount", 2143, "surpassedPercent", new BigDecimal("28.42"),
                "checkedAt", "2026-10-12T16:00:00", "evidencePath", "runtime/boss-competition/report.png"));
    }

    private HttpResponse<String> save(Map<String, Object> body) throws Exception {
        return request("PUT", "/postings/" + postingId + "/boss-competition", body);
    }

    @BeforeEach
    void setup() throws Exception {
        long companyId = result(request("POST", "/companies", Map.of("name", "竞争力测试-" + UUID.randomUUID(),
                "businessType", "UNKNOWN", "productOwnership", "UNKNOWN"))).path("id").asLong();
        sourceUrl = "https://www.zhipin.com/job_detail/" + UUID.randomUUID() + ".html?from=search";
        var body = new HashMap<String, Object>(Map.of("companyId", companyId, "title", "BOSS竞争力测试岗位",
                "direction", "FULL_STACK", "source", "BOSS", "rawJd", "完整原岗位正文", "matchScore", 30,
                "companyScore", 15, "freshnessScore", 10, "commuteScore", 10, "salaryScore", 10));
        body.put("sourceUrl", sourceUrl);
        postingId = result(request("POST", "/postings", body)).path("id").asLong();
    }

    @Test
    void reportPersistsAndRoundTripsWithoutChangingScoresDirectionOrApplicationFacts() throws Exception {
        var posting = repository.findByIdAndDeletedFalse(postingId).orElseThrow();
        posting.setStage(PostingEnums.Stage.APPLIED);
        posting.setAppliedAt(LocalDateTime.of(2026, 10, 10, 9, 0));
        repository.saveAndFlush(posting);
        JsonNode before = result(request("GET", "/postings/" + postingId, null));
        JsonNode updated = result(save(report()));
        assertThat(updated.path("bossRank").asInt()).isEqualTo(1534);
        assertThat(updated.path("bossCompetitorCount").asInt()).isEqualTo(2143);
        assertThat(updated.path("bossSurpassedPercent").decimalValue()).isEqualByComparingTo("28.42");
        before.fieldNames().forEachRemaining(field -> {
            if (!field.startsWith("boss") && !field.equals("updatedAt")) {
                assertThat(updated.path(field)).as(field).isEqualTo(before.path(field));
            }
        });
        var stored = repository.findByIdAndDeletedFalse(postingId).orElseThrow();
        assertThat(stored.getBossRank()).isEqualTo(1534);
        assertThat(stored.getBossSurpassedPercent()).isEqualByComparingTo("28.42");
        assertThat(stored.getBossCompetitionEvidencePath()).isEqualTo("runtime/boss-competition/report.png");
        JsonNode read = result(request("GET", "/postings/" + postingId, null));
        assertThat(read.path("bossCompetitionStatus").asText()).isEqualTo("AVAILABLE");
        assertThat(read.has("bossCompetitionEvidencePath")).isFalse();
        assertThat(result(request("GET", "/postings?keyword=BOSS竞争力测试岗位", null)).get(0)
                .path("bossRank").asInt()).isEqualTo(1534);
    }

    @Test
    void unavailableAndClosedReportsClearOldNumbersAndDoNotChangePostingStage() throws Exception {
        result(save(report()));
        for (String status : List.of("UNAVAILABLE", "CLOSED")) {
            JsonNode updated = result(save(new HashMap<>(Map.of("expectedSourceUrl", sourceUrl, "status", status,
                    "checkedAt", "2026-10-12T16:01:00", "note", "截图显示无报告或岗位已关闭",
                    "evidencePath", "runtime/boss-competition/status.png"))));
            assertThat(updated.hasNonNull("bossRank")).isFalse();
            assertThat(updated.hasNonNull("bossSurpassedPercent")).isFalse();
            assertThat(updated.path("stage").asText()).isEqualTo("SCREENED");
            assertThat(repository.findByIdAndDeletedFalse(postingId).orElseThrow().getBossCompetitionStatus().name())
                    .isEqualTo(status);
        }
    }

    @Test
    void invalidNumbersAndIncompleteReportsDoNotPartiallyOverwriteSavedEvidence() throws Exception {
        result(save(report()));
        List<Map<String, Object>> invalidChanges = List.of(Map.of("rank", 0), Map.of("rank", 2144),
                Map.of("competitorCount", 0), Map.of("surpassedPercent", -1), Map.of("surpassedPercent", 101),
                Map.of("surpassedPercent", 28.421), Map.of("evidencePath", ""), Map.of("status", "UNKNOWN"),
                Map.of("status", "CLOSED"));
        for (var change : invalidChanges) {
            var body = report();
            body.putAll(change);
            assertThat(save(body).statusCode()).as(change.toString()).isEqualTo(400);
        }
        for (String missing : List.of("rank", "competitorCount", "surpassedPercent", "checkedAt", "expectedSourceUrl")) {
            var body = report();
            body.remove(missing);
            assertThat(save(body).statusCode()).as(missing).isEqualTo(400);
        }
        var stored = repository.findByIdAndDeletedFalse(postingId).orElseThrow();
        assertThat(stored.getBossRank()).isEqualTo(1534);
        assertThat(stored.getBossCompetitionEvidencePath()).isEqualTo("runtime/boss-competition/report.png");
    }

    @Test
    void staleLinksAndNonBossJobLinksCannotReceiveReports() throws Exception {
        var stale = report();
        stale.put("expectedSourceUrl", sourceUrl + "&stale=true");
        assertThat(save(stale).statusCode()).isEqualTo(409);
        for (String url : List.of("https://example.com/job_detail/test.html", "https://www.zhipin.com/",
                "https://www.zhipin.com.evil.example/job_detail/test.html", "http://www.zhipin.com/job_detail/test.html")) {
            var posting = repository.findByIdAndDeletedFalse(postingId).orElseThrow();
            posting.setSourceUrl(url);
            repository.saveAndFlush(posting);
            var body = report();
            body.put("expectedSourceUrl", url);
            assertThat(save(body).statusCode()).isEqualTo(400);
            assertThat(repository.findByIdAndDeletedFalse(postingId).orElseThrow().getBossRank()).isNull();
        }
        assertThat(request("PUT", "/postings/999999999/boss-competition", report()).statusCode()).isEqualTo(404);
    }

    @Test
    void competitionOrderAppliesBeforePaginationAndKeepsZeroAheadOfMissingReports() throws Exception {
        JsonNode original = result(request("GET", "/postings/" + postingId, null));
        long companyId = original.path("companyId").asLong();
        long low = competitionFixture(original, "低竞争力高评分", 35, 4, 10, "60.00", PostingEnums.BossCompetitionStatus.AVAILABLE);
        long high = competitionFixture(original, "高竞争力低评分", 0, 1, 5, "80.00", PostingEnums.BossCompetitionStatus.AVAILABLE);
        long worseTie = competitionFixture(original, "同百分比靠后", 35, 51, 101, "50.00", PostingEnums.BossCompetitionStatus.AVAILABLE);
        long betterTie = competitionFixture(original, "同百分比靠前", 0, 50, 101, "50.00", PostingEnums.BossCompetitionStatus.AVAILABLE);
        long zero = competitionFixture(original, "零竞争力", 0, 101, 101, "0.00", PostingEnums.BossCompetitionStatus.AVAILABLE);
        long closed = competitionFixture(original, "关闭的历史数值", 35, 1, 100, "99.00", PostingEnums.BossCompetitionStatus.CLOSED);
        long unavailable = competitionFixture(original, "无报告的历史数值", 0, 1, 100, "99.00", PostingEnums.BossCompetitionStatus.UNAVAILABLE);
        List<Long> expected = List.of(high, low, betterTie, worseTie, zero, closed, postingId, unavailable);
        var actual = new java.util.ArrayList<Long>();
        for (int page = 1; page <= 4; page++) {
            var response = request("GET", "/postings?companyId=" + companyId
                    + "&sortBy=BOSS_COMPETITION&size=2&number=" + page, null);
            JsonNode rows = result(response);
            assertThat(mapper.readTree(response.body()).path("page").path("totalElements").asInt()).isEqualTo(8);
            assertThat(rows.size()).isEqualTo(2);
            rows.forEach(row -> actual.add(row.path("id").asLong()));
        }
        assertThat(actual).containsExactlyElementsOf(expected);
        JsonNode scoreOrder = result(request("GET", "/postings?companyId=" + companyId + "&sortBy=SCORE", null));
        JsonNode defaultOrder = result(request("GET", "/postings?companyId=" + companyId, null));
        assertThat(scoreOrder).isEqualTo(defaultOrder);
        assertThat(scoreOrder.get(0).path("id").asLong()).isEqualTo(closed);
        var export = request("GET", "/postings/export.csv?companyId=" + companyId + "&sortBy=BOSS_COMPETITION", null);
        assertThat(export.statusCode()).isEqualTo(200);
        assertThat(export.body().indexOf("高竞争力低评分")).isLessThan(export.body().indexOf("低竞争力高评分"));
        assertThat(export.body().indexOf("零竞争力")).isLessThan(export.body().indexOf("关闭的历史数值"));
    }

    private long competitionFixture(JsonNode original, String title, int matchScore, int rank, int count,
                                    String percent, PostingEnums.BossCompetitionStatus status) throws Exception {
        Map<String, Object> body = mapper.convertValue(original, new TypeReference<>() {});
        body.put("title", title);
        body.put("sourceUrl", "https://www.zhipin.com/job_detail/" + UUID.randomUUID() + ".html");
        body.put("matchScore", matchScore);
        body.remove("tier");
        body.remove("recommendation");
        long id = result(request("POST", "/postings", body)).path("id").asLong();
        var posting = repository.findByIdAndDeletedFalse(id).orElseThrow();
        posting.setBossRank(rank);
        posting.setBossCompetitorCount(count);
        posting.setBossSurpassedPercent(new BigDecimal(percent));
        posting.setBossCompetitionStatus(status);
        repository.saveAndFlush(posting);
        return id;
    }

    @Test
    void changingSourceUrlClearsTheReportWhileNormalEditingPreservesIt() throws Exception {
        result(save(report()));
        JsonNode original = result(request("GET", "/postings/" + postingId, null));
        Map<String, Object> edit = mapper.convertValue(original, new TypeReference<>() {});
        edit.put("title", "更新岗位名称");
        assertThat(result(request("PUT", "/postings/" + postingId, edit)).path("bossRank").asInt()).isEqualTo(1534);
        String nextUrl = "https://www.zhipin.com/job_detail/" + UUID.randomUUID() + ".html";
        result(request("PUT", "/postings/" + postingId + "/source-url",
                Map.of("sourceUrl", nextUrl, "expectedSourceUrl", sourceUrl)));
        var stored = repository.findByIdAndDeletedFalse(postingId).orElseThrow();
        assertThat(stored.getBossRank()).isNull();
        assertThat(stored.getBossCompetitionStatus()).isNull();
        assertThat(stored.getBossCompetitionEvidencePath()).isNull();
        assertThat(save(report()).statusCode()).isEqualTo(409);
    }
}
