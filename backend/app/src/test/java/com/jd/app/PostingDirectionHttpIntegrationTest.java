package com.jd.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@TestPropertySource(properties = "spring.datasource.url=jdbc:h2:mem:directions_test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE;DATABASE_TO_LOWER=TRUE")
class PostingDirectionHttpIntegrationTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    final HttpClient client = HttpClient.newHttpClient();

    private HttpResponse<String> request(String method, String path, Object body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/jd-collector/api" + path))
                .header("Content-Type", "application/json");
        builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private JsonNode result(String method, String path, Object body) throws Exception {
        var response = request(method, path, body);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return mapper.readTree(response.body()).path("result");
    }

    private Map<String, Object> posting() throws Exception {
        long companyId = result("POST", "/companies", Map.of("name", "分类测试公司-" + UUID.randomUUID(),
                "businessType", "UNKNOWN", "productOwnership", "UNKNOWN", "qualityScore", 10, "active", true)).path("id").asLong();
        return new HashMap<>(Map.of("companyId", companyId, "title", "数据工程师", "source", "OTHER",
                "rawJd", "数据管道和数据仓库建设", "matchScore", 20, "companyScore", 10,
                "freshnessScore", 0, "commuteScore", 0, "salaryScore", 0));
    }

    private Map<String, String> proposal(String label) {
        return Map.of("label", label, "description", "以数据管道和数据仓库建设为核心职责",
                "reason", "当前JD的核心职责是数仓建设，现有分类均不适用");
    }

    @Test
    void newCategoryPersistsWithJdAndWorksInFiltersKnowledgeAndExport() throws Exception {
        var body = posting();
        String label = "数据工程-" + UUID.randomUUID();
        body.put("newDirection", proposal(label));
        var saved = result("POST", "/postings", body);
        String code = saved.path("direction").asText();
        long id = saved.path("id").asLong();
        assertThat(code).startsWith("DIR_").hasSize(36);
        assertThat(saved.path("stage").asText()).isEqualTo("SCREENED");
        assertThat(result("GET", "/postings/" + id, null).path("direction").asText()).isEqualTo(code);
        assertThat(jdbc.queryForObject("select direction from jd_posting where id = ?", String.class, id)).isEqualTo(code);
        assertThat(jdbc.queryForObject("select label from jd_posting_direction where code = ?", String.class, code)).isEqualTo(label);
        assertThat(result("GET", "/posting-directions", null).toString()).contains(label, "JAVA_BACKEND");
        assertThat(result("GET", "/postings?direction=" + code, null).get(0).path("id").asLong()).isEqualTo(id);
        assertThat(result("GET", "/posting-knowledge/postings?direction=" + code, null).get(0).path("direction").asText()).isEqualTo(code);
        assertThat(request("GET", "/postings/export.csv?direction=" + code, null).body()).contains("数据工程师", code);
        body.remove("newDirection");
        body.put("direction", code);
        result("PUT", "/postings/" + id, body);
        body.remove("direction");
        body.put("newDirection", proposal("  " + label + "  "));
        assertThat(result("POST", "/postings", body).path("direction").asText()).isEqualTo(code);
        assertThat(jdbc.queryForObject("select count(*) from jd_posting_direction where code = ?", Integer.class, code)).isEqualTo(1);
    }

    @Test
    void defaultDirectionsAreReusedAndInvalidOrFailedSavesLeaveNoNewCategory() throws Exception {
        var body = posting();
        body.put("newDirection", proposal(" Ｊａｖａ 后端 "));
        assertThat(result("POST", "/postings", body).path("direction").asText()).isEqualTo("JAVA_BACKEND");
        long count = jdbc.queryForObject("select count(*) from jd_posting_direction", Long.class);
        for (String invalid : new String[]{"UNREGISTERED", "", "JAVA_BACKEND|FULL_STACK"}) {
            body.remove("newDirection");
            body.put("direction", invalid);
            assertThat(request("POST", "/postings", body).statusCode()).isEqualTo(400);
        }
        body.remove("direction");
        body.put("newDirection", proposal("回滚分类-" + UUID.randomUUID()));
        // This conflict happens after category resolution in apply(), so verifies transaction rollback.
        body.put("tier", "S");
        assertThat(request("POST", "/postings", body).statusCode()).isEqualTo(409);
        assertThat(jdbc.queryForObject("select count(*) from jd_posting_direction", Long.class)).isEqualTo(count);
        body.remove("tier");
        body.put("newDirection", Map.of("label", "无理由", "description", "测试"));
        assertThat(request("POST", "/postings", body).statusCode()).isEqualTo(400);
        assertThat(jdbc.queryForObject("select count(*) from jd_posting_direction", Long.class)).isEqualTo(count);
    }
}
