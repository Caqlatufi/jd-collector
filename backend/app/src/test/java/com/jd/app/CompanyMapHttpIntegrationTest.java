package com.jd.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jd.posting.model.JobPosting;
import com.jd.posting.model.PostingEnums;
import com.jd.posting.repo.JobPostingRepository;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class CompanyMapHttpIntegrationTest {
    static HttpServer geocoder;
    static final AtomicInteger calls = new AtomicInteger();
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired JobPostingRepository postings;
    final HttpClient client = HttpClient.newHttpClient();

    @DynamicPropertySource
    static void geocoder(DynamicPropertyRegistry registry) throws Exception {
        geocoder = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        geocoder.createContext("/api/", exchange -> {
            calls.incrementAndGet();
            String json = """
                    {"features":[
                      {"properties":{"state":"北京市","name":"地图测试大厦"},"geometry":{"coordinates":[116.4,39.9]}},
                      {"properties":{"state":"上海市","name":"无关楼宇"},"geometry":{"coordinates":[121.45,31.2]}},
                      {"properties":{"state":"上海市","name":"地图测试大厦"},"geometry":{"coordinates":[121.437,31.19]}}
                    ]}
                    """;
            byte[] body = json.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (var stream = exchange.getResponseBody()) { stream.write(body); }
        });
        geocoder.start();
        registry.add("jd-collector.company.geocoder-url", () -> "http://127.0.0.1:" + geocoder.getAddress().getPort() + "/api/");
    }

    @AfterAll
    static void close() { if (geocoder != null) geocoder.stop(0); }

    HttpResponse<String> request(String method, String path, Object body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/jd-collector/api" + path));
        if (body == null) builder.method(method, HttpRequest.BodyPublishers.noBody());
        else builder.header("Content-Type", "application/json")
                .method(method, HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    JsonNode result(HttpResponse<String> response) throws Exception {
        assertThat(response.statusCode()).withFailMessage("HTTP %s: %s", response.statusCode(), response.body()).isEqualTo(200);
        return mapper.readTree(response.body()).path("result");
    }

    Map<String, Object> company() {
        return new HashMap<>(Map.of("name", "多地点测试-" + UUID.randomUUID(),
                "businessType", "UNKNOWN", "productOwnership", "UNKNOWN", "address", "旧地址"));
    }

    @Test
    void multipleLocationsPersistAndLegacyUpdatesPreserveThemWhileInvalidInputRollsBack() throws Exception {
        var body = company();
        var locations = List.of(
                Map.of("label", "徐汇办公点", "address", "上海市徐汇区宜山路", "longitude", 121.437, "latitude", 31.19),
                Map.of("label", "浦东办公点", "address", "上海市浦东新区张江"));
        body.put("workLocations", locations);
        long id = result(request("POST", "/companies", body)).path("id").asLong();
        assertThat(result(request("GET", "/companies/" + id, null)).path("workLocations").size()).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from jd_company_work_location where company_id = ?", Integer.class, id)).isEqualTo(2);
        body.remove("workLocations");
        assertThat(result(request("PUT", "/companies/" + id, body)).path("workLocations").size()).isEqualTo(2);
        for (var invalid : List.of(Map.of("address", "上海", "longitude", 121.4),
                Map.of("address", "上海", "longitude", 181, "latitude", 31), Map.of("address", " "))) {
            body.put("workLocations", List.of(invalid));
            assertThat(request("PUT", "/companies/" + id, body).statusCode()).isEqualTo(400);
            assertThat(jdbc.queryForObject("select count(*) from jd_company_work_location where company_id = ?", Integer.class, id)).isEqualTo(2);
        }
        body.put("workLocations", List.of());
        assertThat(result(request("PUT", "/companies/" + id, body)).path("workLocations").size()).isZero();
        assertThat(jdbc.queryForObject("select count(*) from jd_company_work_location where company_id = ?", Integer.class, id)).isZero();
    }

    @Test
    void postingMapIncludesEveryDistinctOfficeAndExcludesDeletedPostings() throws Exception {
        long companyId = result(request("POST", "/companies", company())).path("id").asLong();
        for (int i = 0; i < 3; i++) {
            var posting = new JobPosting();
            posting.setCompanyId(companyId);
            posting.setTitle("地图地点 " + i);
            posting.setDirection("JAVA_BACKEND");
            posting.setSource(PostingEnums.Source.OTHER);
            posting.setRawJd("地图测试");
            posting.setLocation(i == 0 ? "上海市徐汇区宜山路" : "上海市浦东新区张江");
            posting.setMatchScore(0); posting.setCompanyScore(0); posting.setFreshnessScore(0);
            posting.setCommuteScore(0); posting.setSalaryScore(0); posting.setTotalScore(0);
            posting.setTier(PostingEnums.Tier.B); posting.setRecommendation(PostingEnums.Recommendation.CONTACT_FIRST);
            posting.setStage(PostingEnums.Stage.SCREENED);
            posting.setDeleted(i == 2);
            postings.saveAndFlush(posting);
        }
        var rows = result(request("GET", "/postings/work-locations", null));
        var companyRows = new java.util.ArrayList<JsonNode>();
        rows.forEach(row -> { if (row.path("companyId").asLong() == companyId) companyRows.add(row); });
        assertThat(companyRows).hasSize(2);
        assertThat(companyRows.stream().map(row -> row.path("address").asText())).containsExactly("上海市徐汇区宜山路", "上海市浦东新区张江");
    }

    @Test
    void geocoderRejectsUnrelatedAndOutsideMatchesAndCachesVerifiedNameMatches() throws Exception {
        String address = "上海徐汇区地图测试大厦" + UUID.randomUUID();
        int before = calls.get();
        var position = result(request("POST", "/companies/location-positions", Map.of("address", address)));
        assertThat(position.path("longitude").asDouble()).isEqualTo(121.437);
        assertThat(position.path("matchedName").asText()).isEqualTo("地图测试大厦");
        assertThat(calls.get()).isEqualTo(before + 1);
        result(request("POST", "/companies/location-positions", Map.of("address", address)));
        assertThat(calls.get()).isEqualTo(before + 1);
        assertThat(jdbc.queryForObject("select longitude from jd_company_location_cache where address = ?", Double.class, address)).isEqualTo(121.437);
        String unmatched = "上海徐汇区完全不匹配大厦";
        assertThat(result(request("POST", "/companies/location-positions", Map.of("address", unmatched))).hasNonNull("longitude")).isFalse();
        int after = calls.get();
        result(request("POST", "/companies/location-positions", Map.of("address", unmatched)));
        assertThat(calls.get()).isEqualTo(after);
    }
}
