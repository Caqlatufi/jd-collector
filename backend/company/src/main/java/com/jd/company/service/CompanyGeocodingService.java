package com.jd.company.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jd.common.exception.BusinessException;
import com.jd.common.exception.ErrorCode;
import com.jd.company.model.CompanyLocationCache;
import com.jd.company.repo.CompanyLocationCacheRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.regex.Pattern;

@RequiredArgsConstructor
public class CompanyGeocodingService {
    private static final Pattern PREFIX = Pattern.compile("^(?:上海市?)?[·\\s-]*(?:黄浦区|徐汇区|长宁区|静安区|普陀区|虹口区|杨浦区|闵行区|宝山区|嘉定区|浦东新区|金山区|松江区|青浦区|奉贤区|崇明区)?[·\\s-]*");
    private static final Pattern BUILDING = Pattern.compile("^(.+?(?:大厦|广场|中心|产业园|科技园|大楼|孵化器))");
    private final CompanyLocationCacheRepository repository;
    private final ObjectMapper mapper;
    private final String endpoint;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private long lastRequest;

    public record Position(String address, Double longitude, Double latitude, String matchedName) {
    }

    public List<Position> cached() {
        return repository.findAll().stream().map(this::position).toList();
    }

    // One local user, one request at a time; results (including empty matches) are cached.
    // No database transaction is held while waiting for the public geocoder.
    public synchronized Position resolve(String input) {
        String address = input.trim();
        var existing = repository.findByAddress(address);
        if (existing.isPresent() && (existing.get().getLongitude() != null
                || existing.get().getUpdatedAt().isAfter(LocalDateTime.now().minusDays(7)))) {
            return position(existing.get());
        }
        String detail = PREFIX.matcher(address.replaceAll("[（(][^）)]*[）)]", "")).replaceFirst("");
        var building = BUILDING.matcher(detail);
        String term = building.find() ? building.group(1) : detail.replaceAll("\\d+(?:楼|层|室|F|f).*$", "");
        term = term.replaceAll("[·\\s]+", "").trim();
        var cache = existing.orElseGet(CompanyLocationCache::new);
        cache.setAddress(address);
        cache.setUpdatedAt(LocalDateTime.now());
        if (term.length() < 3 || term.matches(".*(?:待核实|待确认|待核验|上海|杭州|深圳|北京|未知).*")) {
            return position(repository.save(cache));
        }
        try {
            long pause = 1100 - (System.currentTimeMillis() - lastRequest);
            if (pause > 0) Thread.sleep(pause);
            lastRequest = System.currentTimeMillis();
            String url = endpoint + (endpoint.contains("?") ? "&" : "?")
                    + "q=" + URLEncoder.encode("上海 " + term, StandardCharsets.UTF_8)
                    + "&limit=4&lat=31.2&lon=121.45&bbox=120.8,30.65,122.2,31.95";
            var response = client.send(HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(8)).header("User-Agent", "JDCollector/0.1 (personal workplace map)")
                    .GET().build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() != 200) throw new IllegalStateException("Geocoder unavailable");
            for (JsonNode feature : mapper.readTree(response.body()).path("features")) {
                JsonNode props = feature.path("properties");
                String name = props.path("name").asText("");
                String compactName = name.replaceAll("[·\\s]", "");
                String state = props.path("state").asText("");
                String street = props.path("street").asText("");
                String house = props.path("housenumber").asText("");
                boolean nameMatches = compactName.length() >= 4 && term.contains(compactName)
                        && !compactName.endsWith("街道") && !compactName.endsWith("区");
                boolean addressMatches = !street.isBlank() && !house.isBlank()
                        && term.contains(street) && term.contains(house);
                JsonNode coordinates = feature.path("geometry").path("coordinates");
                if (!state.contains("上海") || !(nameMatches || addressMatches) || coordinates.size() != 2) continue;
                double lon = coordinates.get(0).asDouble(Double.NaN);
                double lat = coordinates.get(1).asDouble(Double.NaN);
                if (!Double.isFinite(lon) || !Double.isFinite(lat) || lon < 120.8 || lon > 122.2 || lat < 30.65 || lat > 31.95) continue;
                cache.setLongitude(lon);
                cache.setLatitude(lat);
                cache.setMatchedName(name.isBlank() ? street + house : name);
                break;
            }
            return position(repository.save(cache));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (Exception exception) {
            throw unavailable();
        }
    }

    private Position position(CompanyLocationCache cache) {
        return new Position(cache.getAddress(), cache.getLongitude(), cache.getLatitude(), cache.getMatchedName());
    }

    private BusinessException unavailable() {
        return new BusinessException(ErrorCode.BUSINESS_ERROR, HttpStatus.BAD_GATEWAY, "地址匹配暂不可用，可继续查看区域分布，稍后重试");
    }
}
