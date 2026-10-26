package com.jd.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class CompanyAddressHttpIntegrationTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    final HttpClient client = HttpClient.newHttpClient();
    static final Path DIRECTORY = directory();

    static Path directory() {
        try { return Files.createTempDirectory("company-address-http-"); }
        catch (Exception error) { throw new IllegalStateException(error); }
    }

    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        registry.add("jd-collector.company-address.work-directory", DIRECTORY::toString);
        registry.add("spring.datasource.url", () -> "jdbc:h2:mem:company_address_test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE;DATABASE_TO_LOWER=TRUE");
    }

    private HttpResponse<String> request(String method, String path, Object body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/jd-collector/api" + path))
                .header("Content-Type", "application/json");
        builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
    private JsonNode result(String method, String path, Object body) throws Exception {
        var response = request(method, path, body);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return mapper.readTree(response.body()).path("result");
    }
    private long company(String name) throws Exception {
        return result("POST", "/companies", Map.of("name", name, "businessType", "UNKNOWN", "productOwnership", "UNKNOWN",
                "qualityScore", 10, "address", "上海", "notes", "原有资料", "active", true)).path("id").asLong();
    }
    private Map<String, Object> evidence(String name, String url) {
        return new HashMap<>(Map.of("expectedCompanyName", name, "address", "上海市徐汇区虹梅路1801号",
                "sourceUrl", url, "evidenceText", name + "上海办公地点：虹梅路1801号；截图c1", "taskId", UUID.randomUUID().toString()));
    }

    @Test void queueIsDurableDeduplicatedAndRejectsInvalidCompanyAndRunningRetry() throws Exception {
        String name = "地址队列公司-" + UUID.randomUUID();
        long id = company(name);
        var first = result("POST", "/company-address-tasks", Map.of("companyId", id));
        assertThat(first.path("status").asText()).isEqualTo("QUEUED");
        String task = first.path("taskId").asText();
        assertThat(result("POST", "/company-address-tasks", Map.of("companyId", id)).path("taskId").asText()).isEqualTo(task);
        assertThat(result("GET", "/company-address-tasks/" + task, null).path("companyName").asText()).isEqualTo(name);
        assertThat(Files.isRegularFile(DIRECTORY.resolve("jobs").resolve(task).resolve("task.json"))).isTrue();
        assertThat(request("POST", "/company-address-tasks/" + task + "/retry", null).statusCode()).isEqualTo(409);
        assertThat(request("POST", "/company-address-tasks", Map.of("companyId", -1)).statusCode()).isEqualTo(400);
        assertThat(request("POST", "/company-address-tasks", Map.of("companyId", 999999)).statusCode()).isEqualTo(404);
    }

    @Test void companyReferenceIsIdempotentAndDoesNotOverwriteCompanyOrJd() throws Exception {
        String name = "公司地址证据-" + UUID.randomUUID();
        long id = company(name);
        var before = result("GET", "/companies/" + id, null);
        var input = evidence(name, "https://cn.bing.com/search?q=fixture");
        var saved = result("POST", "/companies/" + id + "/address-discoveries", input);
        assertThat(saved.path("sourceType").asText()).isEqualTo("COMPANY");
        assertThat(saved.path("postingId").isNull() || saved.path("postingId").isMissingNode()).isTrue();
        assertThat(result("POST", "/companies/" + id + "/address-discoveries", input).path("id")).isEqualTo(saved.path("id"));
        assertThat(jdbc.queryForObject("select count(*) from jd_company_address_discovery where company_id = ?", Integer.class, id)).isEqualTo(1);
        assertThat(result("GET", "/companies/" + id, null)).isEqualTo(before);
        input.put("address", "上海·闵行区");
        assertThat(request("POST", "/companies/" + id + "/address-discoveries", input).statusCode()).isEqualTo(400);
        input.put("address", "北京市朝阳区建国路1号");
        assertThat(request("POST", "/companies/" + id + "/address-discoveries", input).statusCode()).isEqualTo(400);
        input.put("address", "上海市徐汇区虹梅路1801号");
        input.put("expectedCompanyName", "其他公司");
        assertThat(request("POST", "/companies/" + id + "/address-discoveries", input).statusCode()).isEqualTo(409);
    }

    @Test void jdAddressUpdatesOnlyLocationAndEvidenceWithSourceAndConcurrencyChecks() throws Exception {
        String name = "岗位地址证据-" + UUID.randomUUID(), url = "https://careers.example.com/jobs/" + UUID.randomUUID();
        long company = company(name);
        var body = new HashMap<String, Object>(Map.of("companyId", company, "title", "地址验证工程师", "direction", "FULL_STACK",
                "source", "OTHER", "rawJd", "真实HTTP夹具正文", "matchScore", 25, "companyScore", 10, "freshnessScore", 0, "commuteScore", 0, "salaryScore", 0));
        body.put("sourceUrl", url); body.put("location", "上海");
        var before = result("POST", "/postings", body);
        long id = before.path("id").asLong();
        var input = evidence(name, url);
        input.put("expectedPostingUrl", url); input.put("expectedLocation", "上海");
        var saved = result("POST", "/postings/" + id + "/address-discoveries", input);
        assertThat(saved.path("sourceType").asText()).isEqualTo("JD");
        assertThat(saved.path("postingId").asLong()).isEqualTo(id);
        var after = result("GET", "/postings/" + id, null);
        assertThat(after.path("location").asText()).isEqualTo(input.get("address"));
        for (String field : new String[]{"rawJd", "totalScore", "tier", "stage", "riskNotes", "appliedAt", "sourceUrl"})
            assertThat(after.path(field)).as(field).isEqualTo(before.path(field));
        assertThat(jdbc.queryForObject("select location from jd_posting where id = ?", String.class, id)).isEqualTo(input.get("address"));
        input.put("address", "上海市浦东新区张江路100号");
        assertThat(request("POST", "/postings/" + id + "/address-discoveries", input).statusCode()).isEqualTo(409);
        input.put("sourceUrl", "https://unrelated.example.com/");
        assertThat(request("POST", "/postings/" + id + "/address-discoveries", input).statusCode()).isEqualTo(409);
    }
}
