package com.jd.recognition.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jd.common.exception.BusinessException;
import com.jd.common.exception.ErrorCode;
import org.springframework.http.HttpStatus;

import java.net.URI;
import java.util.Set;

public class PostingImportService extends FileTaskQueueService {
    public PostingImportService(ObjectMapper mapper, String projectRoot, String directory, boolean enabled,
            String node, String codex, String model, String effort, int timeout, String apiBase) {
        super(mapper, projectRoot, directory, "runtime/jd-imports", "ops/jd-import/worker.mjs", "jd-import:",
                enabled, node, codex, model, effort, timeout, apiBase);
    }

    public JsonNode create(String sourceUrl) {
        var seed = mapper.createObjectNode();
        seed.put("sourceUrl", normalizeUrl(sourceUrl));
        return enqueue(seed, "sourceUrl");
    }

    public static String normalizeUrl(String value) {
        try {
            if (value == null || value.length() > 1000) throw new IllegalArgumentException();
            URI uri = URI.create(value.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
                    || uri.getUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443)) {
                throw new IllegalArgumentException();
            }
            if (Set.of("www.zhipin.com", "zhipin.com").contains(uri.getHost().toLowerCase())
                    && uri.getRawPath().matches("/job_detail/[a-zA-Z0-9_~-]{1,100}\\.html")) {
                return "https://www.zhipin.com" + uri.getRawPath();
            }
            String query = uri.getRawQuery() == null ? null : java.util.Arrays.stream(uri.getRawQuery().split("&"))
                    .filter(part -> !part.toLowerCase().startsWith("utm_"))
                    .collect(java.util.stream.Collectors.joining("&"));
            String path = uri.getRawPath().isEmpty() ? "/" : uri.getRawPath();
            return "https://" + uri.getHost().toLowerCase() + path
                    + (query == null || query.isEmpty() ? "" : "?" + query)
                    + (uri.getRawFragment() == null ? "" : "#" + uri.getRawFragment());
        } catch (RuntimeException e) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST,
                    "请填写完整的 HTTPS 岗位详情链接");
        }
    }

}
