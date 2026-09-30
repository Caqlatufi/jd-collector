package com.jd.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jd.posting.model.PostingEnums;
import com.jd.posting.repo.JobPostingRepository;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
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
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class PostingSourceHttpIntegrationTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired JobPostingRepository repository;
    private final HttpClient client = HttpClient.newHttpClient();

    private HttpResponse<String> request(String path, String body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/jd-collector/api" + path));
        if (body != null) builder.header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    @ParameterizedTest(name = "{0} 截图复核候选真实HTTP入库、查重及无投递状态")
    @CsvSource({"BOSS,www.zhipin.com", "LIEPIN,www.liepin.com", "OTHER,jobs.51job.com", "OTHER,www.zhaopin.com"})
    void confirmedDraftIsStoredWithoutApplyingAndDuplicateSourceIsRejected(String source, String domain) throws Exception {
        var company = request("/companies", """
                {"name":"平台读取测试公司-%s","businessType":"UNKNOWN","productOwnership":"UNKNOWN"}
                """.formatted(domain));
        assertThat(company.statusCode()).isEqualTo(200);
        long companyId = mapper.readTree(company.body()).path("result").path("id").asLong();
        String url = "https://" + domain + "/job_detail/fixture-" + UUID.randomUUID() + ".html";
        String body = """
                {"companyId":%d,"title":"Java 应用工程师","direction":"JAVA_BACKEND",
                 "source":"%s","sourceUrl":"%s","rawJd":"负责平台应用开发；测试岗位正文",
                 "salaryMinK":20,"salaryMaxK":30,"salaryMonths":13,
                 "matchScore":30,"companyScore":15,"freshnessScore":10,"commuteScore":10,"salaryScore":10}
                """.formatted(companyId, source, url);
        var created = request("/postings", body);
        assertThat(created.statusCode()).isEqualTo(200);
        long id = mapper.readTree(created.body()).path("result").path("id").asLong();
        var stored = repository.findByIdAndDeletedFalse(id).orElseThrow();
        assertThat(stored.getSourceUrl()).isEqualTo(url);
        assertThat(stored.getRawJd()).isEqualTo("负责平台应用开发；测试岗位正文");
        assertThat(stored.getSource().name()).isEqualTo(source);
        assertThat(stored.getSalaryMinK()).isEqualTo(20);
        assertThat(stored.getSalaryMonths()).isEqualTo(13);
        var readBack = request("/postings/" + id, null);
        assertThat(readBack.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(readBack.body()).path("result").path("rawJd").asText()).isEqualTo(stored.getRawJd());
        assertThat(stored.getStage()).isEqualTo(PostingEnums.Stage.SCREENED);
        assertThat(stored.getAppliedAt()).isNull();
        assertThat(stored.getNextActionAt()).isNull();
        assertThat(stored.getNextAction()).isNull();
        var lookup = request("/postings/source?url=" + URLEncoder.encode(url, StandardCharsets.UTF_8), null);
        assertThat(lookup.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(lookup.body()).path("result").size()).isEqualTo(1);
        long count = repository.count();
        var duplicate = request("/postings", body);
        assertThat(duplicate.statusCode()).isEqualTo(409);
        assertThat(mapper.readTree(duplicate.body()).path("code").asInt()).isEqualTo(40901);
        assertThat(repository.count()).isEqualTo(count);
    }

    /** Opt-in replay of real screenshots + Astra results in H2; never connects to the personal database. */
    @ParameterizedTest(name = "{0} 真实截图识别结果→HTTP保存→查重→数据库回读")
    @CsvSource({"boss,BOSS", "liepin,LIEPIN", "job51,OTHER", "zhaopin,OTHER"})
    @EnabledIfEnvironmentVariable(named = "JD_VISION_CLOSURE_DIR", matches = ".+")
    void reviewedNativeEvidenceClosesThroughRealHttp(String platform, String source) throws Exception {
        Path directory = Path.of(System.getenv("JD_VISION_CLOSURE_DIR"));
        var task = mapper.readTree(Files.readString(directory.resolve(platform + "-task.json")));
        var result = mapper.readTree(Files.readString(directory.resolve(platform + "-result.json")));
        assertThat(task.path("model").asText()).isEqualTo("gpt-6-astra");
        assertThat(task.path("reasoningEffort").asText()).isEqualTo("medium");
        assertThat(result.path("taskId")).isEqualTo(task.path("taskId"));
        assertThat(result.path("pageKind").asText()).isEqualTo("DETAIL");
        assertThat(result.path("coverage").asText()).isEqualTo("COMPLETE");
        for (var capture : task.path("captures")) {
            byte[] png = Files.readAllBytes(Path.of(capture.path("filePath").asText()));
            assertThat(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(png)))
                    .isEqualTo(capture.path("sha256").asText());
        }
        var candidate = result.path("candidates").get(0);
        var companyBody = mapper.createObjectNode();
        companyBody.put("name", candidate.path("companyName").path("value").asText());
        companyBody.put("businessType", "UNKNOWN");
        companyBody.put("productOwnership", "UNKNOWN");
        var company = request("/companies", mapper.writeValueAsString(companyBody));
        assertThat(company.statusCode()).isEqualTo(200);
        var body = mapper.createObjectNode();
        body.put("companyId", mapper.readTree(company.body()).path("result").path("id").asLong());
        body.put("title", candidate.path("title").path("value").asText());
        body.put("direction", platform.equals("boss") ? "JAVA_BACKEND" : "FULL_STACK");
        body.put("source", source);
        body.put("sourceUrl", candidate.path("sourceUrl").asText());
        body.put("location", candidate.path("officeAddress").path("value").asText());
        var raw = new StringBuilder();
        for (var segment : candidate.path("descriptionSegments")) {
            assertThat(segment.path("certainty").asText()).isEqualTo("CLEAR");
            if (!raw.isEmpty()) raw.append("\n\n");
            raw.append(segment.path("value").asText());
        }
        body.put("rawJd", raw.toString());
        // Zero scores are test-only: this test does not approve commute or business eligibility.
        for (String score : new String[]{"matchScore", "companyScore", "freshnessScore", "commuteScore", "salaryScore"}) body.put(score, 0);
        String payload = mapper.writeValueAsString(body);
        var response = request("/postings", payload);
        assertThat(response.statusCode()).isEqualTo(200);
        long id = mapper.readTree(response.body()).path("result").path("id").asLong();
        var readBack = mapper.readTree(request("/postings/" + id, null).body()).path("result");
        assertThat(readBack.path("rawJd").asText()).isEqualTo(raw.toString());
        assertThat(readBack.path("companyName")).isEqualTo(candidate.path("companyName").path("value"));
        assertThat(readBack.path("title")).isEqualTo(body.path("title"));
        assertThat(readBack.path("sourceUrl")).isEqualTo(body.path("sourceUrl"));
        var stored = repository.findByIdAndDeletedFalse(id).orElseThrow();
        assertThat(stored.getRawJd()).isEqualTo(raw.toString());
        assertThat(stored.getStage()).isEqualTo(PostingEnums.Stage.SCREENED);
        assertThat(stored.getAppliedAt()).isNull();
        assertThat(stored.getNextActionAt()).isNull();
        assertThat(stored.getNextAction()).isNull();
        var lookup = request("/postings/source?url=" + URLEncoder.encode(body.path("sourceUrl").asText(), StandardCharsets.UTF_8), null);
        assertThat(mapper.readTree(lookup.body()).path("result").get(0).path("id").asLong()).isEqualTo(id);
        long count = repository.count();
        assertThat(request("/postings", payload).statusCode()).isEqualTo(409);
        assertThat(repository.count()).isEqualTo(count);
    }
}
