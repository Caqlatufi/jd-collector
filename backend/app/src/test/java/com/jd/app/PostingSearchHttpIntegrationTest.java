package com.jd.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jd.posting.model.PostingEnums;
import com.jd.posting.repo.JobPostingRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class PostingSearchHttpIntegrationTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired JobPostingRepository postings;
    private final HttpClient client = HttpClient.newHttpClient();

    private HttpResponse<String> request(String method, String path, Object body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/jd-collector/api" + path));
        if (body == null) builder.method(method, HttpRequest.BodyPublishers.noBody());
        else builder.header("Content-Type", "application/json")
                .method(method, HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        var response = client.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        assertThat(response.statusCode()).withFailMessage("HTTP %s: %s", response.statusCode(), response.body()).isEqualTo(200);
        return response;
    }

    private JsonNode json(String method, String path, Object body) throws Exception {
        return mapper.readTree(request(method, path, body).body());
    }

    private Map<String, Object> companyBody(String name) {
        return Map.of("name", name, "businessType", "UNKNOWN", "productOwnership", "UNKNOWN");
    }

    private long createPosting(long companyId, String title, String rawJd) throws Exception {
        return json("POST", "/postings", Map.of("companyId", companyId, "title", title,
                "direction", "JAVA_BACKEND", "source", "OTHER", "rawJd", rawJd,
                "matchScore", 30, "companyScore", 15, "freshnessScore", 10, "commuteScore", 10, "salaryScore", 10))
                .path("result").path("id").asLong();
    }

    private String search(String keyword) {
        return "/postings?keyword=" + URLEncoder.encode(keyword, StandardCharsets.UTF_8);
    }

    @Test
    void companyOnlyMatchesSupportPaginationStageFilteringAndExportWithoutArchivedRows() throws Exception {
        String token = "Example-" + UUID.randomUUID();
        long companyId = json("POST", "/companies", companyBody("搜索公司-" + token))
                .path("result").path("id").asLong();
        long first = createPosting(companyId, "平台开发", "Java服务开发");
        long second = createPosting(companyId, "数据开发", "SQL任务开发");
        long archived = createPosting(companyId, "归档岗位", "保留历史正文");
        json("PUT", "/postings/" + archived + "/archive", null);
        var posting = postings.findById(second).orElseThrow();
        posting.setStage(PostingEnums.Stage.MESSAGE_SENT);
        postings.saveAndFlush(posting);
        var before = mapper.valueToTree(postings.findById(first).orElseThrow());

        for (String sort : new String[]{"SCORE", "BOSS_COMPETITION"}) {
            String path = search("  " + token.toUpperCase(java.util.Locale.ROOT) + "  ") + "&size=1&sortBy=" + sort;
            var pageOne = json("GET", path + "&number=1", null);
            var pageTwo = json("GET", path + "&number=2", null);
            assertThat(pageOne.path("page").path("totalElements").asInt()).isEqualTo(2);
            assertThat(pageOne.path("result").size()).isEqualTo(1);
            assertThat(pageTwo.path("result").size()).isEqualTo(1);
            assertThat(java.util.Set.of(pageOne.path("result").get(0).path("id").asLong(),
                    pageTwo.path("result").get(0).path("id").asLong())).containsExactlyInAnyOrder(first, second);
        }
        var filtered = json("GET", search(token) + "&stage=MESSAGE_SENT", null).path("result");
        assertThat(filtered.size()).isEqualTo(1);
        assertThat(filtered.get(0).path("id").asLong()).isEqualTo(second);
        var csv = request("GET", "/postings/export.csv?keyword=" + URLEncoder.encode(token, StandardCharsets.UTF_8), null).body();
        assertThat(csv).contains("平台开发", "数据开发").doesNotContain("归档岗位");
        JsonNode after = mapper.valueToTree(postings.findById(first).orElseThrow());
        assertThat(after).isEqualTo(before);
    }

    @Test
    void titleAndBodyStillMatchAndCompanyRenameUsesTheCurrentName() throws Exception {
        String token = UUID.randomUUID().toString();
        long companyId = json("POST", "/companies", companyBody("旧公司-" + token))
                .path("result").path("id").asLong();
        long postingId = createPosting(companyId, "岗位-" + token, "正文-" + token);
        for (String keyword : new String[]{"旧公司-" + token, "岗位-" + token, "正文-" + token}) {
            var rows = json("GET", search(keyword), null).path("result");
            assertThat(rows.size()).isEqualTo(1);
            assertThat(rows.get(0).path("id").asLong()).isEqualTo(postingId);
        }
        json("PUT", "/companies/" + companyId, companyBody("新公司-" + token));
        assertThat(json("GET", search("旧公司-" + token), null).path("result")).isEmpty();
        assertThat(json("GET", search("新公司-" + token), null).path("result").get(0).path("id").asLong()).isEqualTo(postingId);
    }
}
