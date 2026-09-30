package com.jd.criteria;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jd.common.exception.ApplicationExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = CriteriaHttpTest.TestApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class CriteriaHttpTest {
    @SpringBootConfiguration
    @EnableAutoConfiguration(exclude = {DataSourceAutoConfiguration.class, HibernateJpaAutoConfiguration.class})
    @Import({CriteriaConfig.class, ApplicationExceptionHandler.class})
    static class TestApplication {
    }

    @TempDir static Path directory;
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    private final HttpClient client = HttpClient.newHttpClient();
    private static final String FIXTURE = """
            {"schemaVersion":1,"title":"JD门槛","description":"测试","sections":[
              {"id":"salary","title":"薪资","notes":["未知不是排除"],"fields":[
                {"id":"salary-1","label":"最低月薪","value":null,"hint":"税前","kind":"待确定","status":"PENDING"}
              ]}
            ]}
            """;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("jd-collector.criteria-file", () -> directory.resolve("criteria.json").toString());
    }

    private Path file() {
        return directory.resolve("criteria.json");
    }

    @BeforeEach
    void resetFixture() throws Exception {
        Files.writeString(file(), FIXTURE);
    }

    private HttpResponse<String> request(String body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/criteria"));
        if (body != null) builder.header("Content-Type", "application/json")
                .PUT(HttpRequest.BodyPublishers.ofString(body));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private JsonNode get() throws Exception {
        var response = request(null);
        assertThat(response.statusCode()).isEqualTo(200);
        return mapper.readTree(response.body()).path("result");
    }

    private String payload(String revision, String id, String value, String status) throws Exception {
        return mapper.writeValueAsString(Map.of("revision", revision, "answers",
                List.of(Map.of("id", id, "value", value, "kind", "硬门槛", "status", status))));
    }

    @Test
    void savesChineseAnswersPersistsAndBacksUpWithoutChangingMetadata() throws Exception {
        String version = get().path("revision").asText();
        var saved = request(payload(version, "salary-1", "税前固定 18K", "CONFIRMED"));
        assertThat(saved.statusCode()).isEqualTo(200);
        assertThat(get().path("revision").asText()).isNotEqualTo(version);
        var field = get().at("/document/sections/0/fields/0");
        assertThat(field.path("value").asText()).isEqualTo("税前固定 18K");
        assertThat(field.path("status").asText()).isEqualTo("CONFIRMED");
        assertThat(field.path("label").asText()).isEqualTo("最低月薪");
        assertThat(mapper.readTree(Files.readString(file())).at("/sections/0/fields/0/value").asText())
                .isEqualTo("税前固定 18K");
        assertThat(Files.readString(directory.resolve("backups/criteria/" + version + ".json"))).isEqualTo(FIXTURE);
    }

    @Test
    void refusesStaleRevisionAfterExternalEdit() throws Exception {
        String version = get().path("revision").asText();
        Files.writeString(file(), FIXTURE.replace("税前", "仅保证现金"));
        String external = Files.readString(file());
        assertThat(request(payload(version, "salary-1", "18K", "CONFIRMED")).statusCode()).isEqualTo(409);
        assertThat(Files.readString(file())).isEqualTo(external);
    }

    @Test
    void permitsPartialUnconfirmedAndNormalizesBlankToNull() throws Exception {
        String version = get().path("revision").asText();
        assertThat(request(payload(version, "salary-1", "  ", "PENDING")).statusCode()).isEqualTo(200);
        assertThat(get().at("/document/sections/0/fields/0/value").isNull()).isTrue();
    }

    @Test
    void rejectsInvalidAnswersWithoutModifyingFile() throws Exception {
        String version = get().path("revision").asText();
        for (String body : List.of(
                payload(version, "unknown", "18K", "CONFIRMED"),
                payload(version, "salary-1", "", "CONFIRMED"),
                payload(version, "salary-1", "18K", "WRONG"),
                payload(version, "salary-1", "a".repeat(10001), "PENDING"),
                "{\"revision\":\"" + version + "\",\"answers\":[]}")) {
            assertThat(request(body).statusCode()).isEqualTo(400);
            assertThat(Files.readString(file())).isEqualTo(FIXTURE);
        }
        var duplicated = mapper.readTree(payload(version, "salary-1", "18K", "CONFIRMED"));
        ((com.fasterxml.jackson.databind.node.ArrayNode) duplicated.path("answers"))
                .add(duplicated.path("answers").get(0).deepCopy());
        assertThat(request(mapper.writeValueAsString(duplicated)).statusCode()).isEqualTo(400);
        assertThat(Files.readString(file())).isEqualTo(FIXTURE);
    }

    @Test
    void missingOrMalformedFileDoesNotCreateDefaults() throws Exception {
        Files.delete(file());
        assertThat(request(null).statusCode()).isEqualTo(500);
        assertThat(Files.exists(file())).isFalse();
        for (String invalid : List.of("{broken", FIXTURE.replace("\"schemaVersion\":1", "\"schemaVersion\":2"))) {
            Files.writeString(file(), invalid);
            assertThat(request(null).statusCode()).isEqualTo(500);
            assertThat(Files.readString(file())).isEqualTo(invalid);
        }
    }

    @Test
    void failedBackupDoesNotOverwriteOriginal() throws Exception {
        Path isolated = Files.createDirectory(directory.resolve("blocked-backup"));
        Path target = isolated.resolve("criteria.json");
        Files.writeString(target, FIXTURE);
        Files.writeString(isolated.resolve("backups"), "不是目录");
        var service = new com.jd.criteria.service.CriteriaService(mapper, target);
        var before = service.read();
        var answer = new com.jd.criteria.model.CriteriaDtos.Answer("salary-1", "18K", "硬门槛",
                com.jd.criteria.model.CriteriaDtos.Status.CONFIRMED);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.save(
                new com.jd.criteria.model.CriteriaDtos.SaveRequest(before.revision(), List.of(answer))))
                .isInstanceOf(com.jd.common.exception.BusinessException.class);
        assertThat(Files.readString(target)).isEqualTo(FIXTURE);
    }
}
