package com.jd.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jd.company.repo.CompanyRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

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
class CompanyOfficialApplicationHttpIntegrationTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired CompanyRepository repository;
    private final HttpClient client = HttpClient.newHttpClient();

    private HttpResponse<String> request(String method, String path, Object body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/jd-collector/api/companies" + path));
        if (body == null) builder.method(method, HttpRequest.BodyPublishers.noBody());
        else builder.header("Content-Type", "application/json")
                .method(method, HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private JsonNode result(HttpResponse<String> response) throws Exception {
        assertThat(response.statusCode()).withFailMessage("HTTP %s: %s", response.statusCode(), response.body()).isEqualTo(200);
        return mapper.readTree(response.body()).path("result");
    }

    @Test
    void officialChannelPersistsAndSurvivesLegacyUpdatesWhileExplicitBlankClearsIt() throws Exception {
        Map<String, Object> body = new HashMap<>(Map.of("name", "官方渠道测试-" + UUID.randomUUID(),
                "businessType", "UNKNOWN", "productOwnership", "UNKNOWN", "notes", "已有研究证据",
                "officialApplicationUrl", "  https://careers.example.com/jobs?city=shanghai  "));
        JsonNode created = result(request("POST", "", body));
        long id = created.path("id").asLong();
        String url = "https://careers.example.com/jobs?city=shanghai";
        assertThat(created.path("officialApplicationUrl").asText()).isEqualTo(url);
        assertThat(repository.findByIdAndDeletedFalse(id).orElseThrow().getOfficialApplicationUrl()).isEqualTo(url);
        assertThat(result(request("GET", "/" + id, null)).path("officialApplicationUrl").asText()).isEqualTo(url);
        body.remove("officialApplicationUrl");
        assertThat(result(request("PUT", "/" + id, body)).path("officialApplicationUrl").asText()).isEqualTo(url);
        for (String invalid : new String[]{"javascript:alert(1)", "https://user:secret@example.com/", "not-a-url", "https:///missing-host", "https://example.com/" + "x".repeat(2048)}) {
            body.put("officialApplicationUrl", invalid);
            assertThat(request("PUT", "/" + id, body).statusCode()).isEqualTo(400);
            var company = repository.findByIdAndDeletedFalse(id).orElseThrow();
            assertThat(company.getOfficialApplicationUrl()).isEqualTo(url);
            assertThat(company.getNotes()).isEqualTo("已有研究证据");
        }
        body.put("officialApplicationUrl", "  ");
        assertThat(result(request("PUT", "/" + id, body)).path("officialApplicationUrl").asText("")).isEmpty();
        assertThat(repository.findByIdAndDeletedFalse(id).orElseThrow().getOfficialApplicationUrl()).isNull();
    }
}
