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
class PostingSourceUrlHttpIntegrationTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired JobPostingRepository repository;
    private final HttpClient client = HttpClient.newHttpClient();
    private long postingId;
    private long companyId;

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

    private long createPosting() throws Exception {
        return result(request("POST", "/postings", Map.of("companyId", companyId, "title", "手动补链岗位",
                "direction", "JAVA_BACKEND", "source", "BOSS", "rawJd", "完整测试正文", "matchScore", 30,
                "companyScore", 15, "freshnessScore", 10, "commuteScore", 10, "salaryScore", 10))).path("id").asLong();
    }

    private HttpResponse<String> saveLink(long id, String url, String expected) throws Exception {
        return request("PUT", "/postings/" + id + "/source-url", Map.of("sourceUrl", url, "expectedSourceUrl", expected));
    }

    @BeforeEach
    void setup() throws Exception {
        companyId = result(request("POST", "/companies", Map.of("name", "补链测试-" + UUID.randomUUID(),
                "businessType", "UNKNOWN", "productOwnership", "UNKNOWN"))).path("id").asLong();
        postingId = createPosting();
    }

    @Test
    void fillingALinkPersistsOnlyTheUrlIncludingQueryParametersAndPreservesApplicationFacts() throws Exception {
        var posting = repository.findByIdAndDeletedFalse(postingId).orElseThrow();
        posting.setStage(PostingEnums.Stage.APPLIED);
        posting.setAppliedAt(LocalDateTime.of(2026, 10, 8, 10, 0));
        posting.setRiskNotes("完整原风险备注");
        repository.saveAndFlush(posting);
        JsonNode before = result(request("GET", "/postings/" + postingId, null));
        String url = "https://www.zhipin.com/job_detail/manual-test.html?from=search&track=kept#description";
        JsonNode updated = result(saveLink(postingId, "  " + url + "  ", ""));
        assertThat(updated.path("sourceUrl").asText()).isEqualTo(url);
        before.fieldNames().forEachRemaining(field -> {
            if (!List.of("sourceUrl", "updatedAt").contains(field)) {
                assertThat(updated.path(field)).as(field).isEqualTo(before.path(field));
            }
        });
        assertThat(result(request("GET", "/postings/" + postingId, null)).path("sourceUrl").asText()).isEqualTo(url);
        assertThat(repository.findByIdAndDeletedFalse(postingId).orElseThrow().getSourceUrl()).isEqualTo(url);
        assertThat(repository.findByIdAndDeletedFalse(postingId).orElseThrow().getStage()).isEqualTo(PostingEnums.Stage.APPLIED);
    }

    @Test
    void invalidOrIncompleteLinksAreRejectedWithoutChangingThePosting() throws Exception {
        for (String url : List.of("", "javascript:alert(1)", "http://example.com/job", "example.com/job",
                "https://", "https://user:password@example.com/job", "https://example.com/a b", "https://example.com/\njob",
                "https://example.com/" + "a".repeat(1000))) {
            assertThat(saveLink(postingId, url, "").statusCode()).isEqualTo(400);
        }
        assertThat(request("PUT", "/postings/" + postingId + "/source-url",
                Map.of("sourceUrl", "https://example.com/job")).statusCode()).isEqualTo(400);
        assertThat(repository.findByIdAndDeletedFalse(postingId).orElseThrow().getSourceUrl()).isNull();
        assertThat(saveLink(999999999, "https://example.com/job", "").statusCode()).isEqualTo(404);
    }

    @Test
    void staleAndDuplicateLinksAreRejectedAndTheSavedUrlCanBeReadBySource() throws Exception {
        String url = "https://www.zhipin.com/job_detail/source-test.html";
        result(saveLink(postingId, url, ""));
        assertThat(saveLink(postingId, "https://example.com/new", "").statusCode()).isEqualTo(409);
        long otherId = createPosting();
        assertThat(saveLink(otherId, url, "").statusCode()).isEqualTo(409);
        assertThat(repository.findByIdAndDeletedFalse(otherId).orElseThrow().getSourceUrl()).isNull();
        assertThat(repository.findByIdAndDeletedFalse(postingId).orElseThrow().getSourceUrl()).isEqualTo(url);
        assertThat(result(request("GET", "/postings/source?url=" + java.net.URLEncoder.encode(url,
                java.nio.charset.StandardCharsets.UTF_8), null)).get(0).path("id").asLong()).isEqualTo(postingId);
    }
}
