package com.jd.resume.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jd.common.exception.ApplicationExceptionHandler;
import com.jd.resume.ctrl.ResumeStarterController;
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
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = ResumeStarterHttpTest.TestApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "jd-collector.resume.legacy-photo-route=/resume/legacy-fixture.png")
class ResumeStarterHttpTest {
    @TempDir static Path directory;
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    private final HttpClient client = HttpClient.newHttpClient();

    @SpringBootConfiguration
    @EnableAutoConfiguration(exclude = {DataSourceAutoConfiguration.class, HibernateJpaAutoConfiguration.class})
    @Import({ResumeStarterController.class, ApplicationExceptionHandler.class})
    static class TestApplication {
        @Bean
        ResumeStarterService resumeStarterService() {
            return new ResumeStarterService(directory.resolve("starter.md"), directory.resolve("photo.png"), false);
        }
    }

    @BeforeEach
    void reset() throws Exception {
        Files.deleteIfExists(directory.resolve("starter.md"));
        Files.deleteIfExists(directory.resolve("photo.png"));
    }

    private HttpResponse<byte[]> get(String route) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + route)).build(),
                HttpResponse.BodyHandlers.ofByteArray());
    }

    @Test
    void emptyInstallationUsesAnonymousExampleWithoutCreatingPrivateFiles() throws Exception {
        var response = get("/api/resume-starter");
        assertThat(response.statusCode()).isEqualTo(200);
        var result = mapper.readTree(response.body()).path("result");
        assertThat(result.path("contentMarkdown").asText()).startsWith("# 姓名");
        assertThat(result.hasNonNull("photoUrl")).isFalse();
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(Files.exists(directory.resolve("starter.md"))).isFalse();
        assertThat(get("/resume/photo.png").statusCode()).isEqualTo(404);
    }

    @Test
    void localTemplateUpdatesImmediatelyAndPhotoAliasPreservesExistingVersions() throws Exception {
        Files.writeString(directory.resolve("starter.md"), "# 夹具候选人\n\n## 技术能力\n\nJava");
        byte[] image = java.util.Base64.getDecoder().decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=");
        Files.write(directory.resolve("photo.png"), image);
        var result = mapper.readTree(get("/api/resume-starter").body()).path("result");
        assertThat(result.path("contentMarkdown").asText()).contains("夹具候选人");
        assertThat(result.path("photoUrl").asText()).isEqualTo("/resume/photo.png");
        for (String route : new String[]{"/resume/photo.png", "/resume/legacy-fixture.png"}) {
            var photo = get(route);
            assertThat(photo.statusCode()).isEqualTo(200);
            assertThat(photo.body()).isEqualTo(image);
            assertThat(photo.headers().firstValue("Content-Type")).contains("image/png");
        }
        Files.writeString(directory.resolve("starter.md"), "# 修订夹具\n\n## 技术能力\n\nSQL");
        assertThat(mapper.readTree(get("/api/resume-starter").body()).path("result").path("contentMarkdown").asText())
                .contains("修订夹具");
    }

    @Test
    void explicitMissingTemplateFailsWithoutSilentlyUsingExample() {
        var service = new ResumeStarterService(directory.resolve("missing.md").toString(),
                directory.resolve("missing.png").toString());
        org.assertj.core.api.Assertions.assertThatThrownBy(service::read)
                .isInstanceOf(com.jd.common.exception.BusinessException.class);
    }
}
