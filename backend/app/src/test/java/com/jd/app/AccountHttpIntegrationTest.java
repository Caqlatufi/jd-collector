package com.jd.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jd.account.model.PlatformAccount;
import com.jd.account.model.RecruitmentPlatform;
import com.jd.account.repo.PlatformAccountRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class AccountHttpIntegrationTest {
    @LocalServerPort int port;
    @Autowired PlatformAccountRepository repository;
    @Autowired ObjectMapper mapper;
    private final HttpClient client = HttpClient.newHttpClient();

    private HttpResponse<String> request(String method, String path) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/jd-collector/api/accounts" + path))
                .header("Content-Type", "application/json")
                .method(method, method.equals("GET") ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString("{}"))
                .build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void allLegacyMutationsAreRetiredWithoutChangingHistoricalSecrets() throws Exception {
        for (var platform : RecruitmentPlatform.values()) {
            var row = repository.findByPlatform(platform).orElseGet(PlatformAccount::new);
            row.setPlatform(platform);
            row.setUsername("historical-fixture");
            row.setPasswordCipher("encrypted-fixture-password");
            row.setSessionCipher("encrypted-fixture-session");
            row.setSessionStatus("VERIFIED");
            row.setNotes("preserve-history");
            repository.saveAndFlush(row);
            for (String method : List.of("PUT", "POST", "DELETE")) {
                var response = request(method, "/" + platform);
                assertThat(response.statusCode()).isEqualTo(400);
                assertThat(mapper.readTree(response.body()).path("code").asInt()).isEqualTo(40002);
            }
            for (String action : List.of("open", "login", "capture", "verify", "close")) {
                assertThat(request("POST", "/" + platform + "/" + action).statusCode()).isEqualTo(400);
            }
            for (String action : List.of("session", "credentials")) {
                assertThat(request("DELETE", "/" + platform + "/" + action).statusCode()).isEqualTo(400);
            }
            var after = repository.findByPlatform(platform).orElseThrow();
            assertThat(after.getPasswordCipher()).isEqualTo("encrypted-fixture-password");
            assertThat(after.getSessionCipher()).isEqualTo("encrypted-fixture-session");
            assertThat(after.getUsername()).isEqualTo("historical-fixture");
            assertThat(after.getSessionStatus()).isEqualTo("VERIFIED");
            assertThat(after.getNotes()).isEqualTo("preserve-history");
        }
        var response = request("GET", "");
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        var rows = mapper.readTree(response.body()).path("result");
        assertThat(rows.size()).isEqualTo(4);
        assertThat(response.body()).doesNotContain("encrypted-fixture", "LAGOU", "passwordCipher", "sessionCipher");
        for (var row : rows) assertThat(row.path("browserOpen").asBoolean()).isFalse();
    }

    @Test
    void externalOriginStillCannotUseLegacyOperations() throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/jd-collector/api/accounts/BOSS/open"))
                .header("Origin", "https://example.org").POST(HttpRequest.BodyPublishers.noBody()).build();
        assertThat(client.send(request, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(403);
    }
}
