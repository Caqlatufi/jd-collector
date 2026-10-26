package com.jd.recognition.ctrl;

import com.fasterxml.jackson.databind.JsonNode;
import com.jd.common.rest.RestResultResponse;
import com.jd.recognition.service.PostingImportService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/posting-imports")
@RequiredArgsConstructor
public class PostingImportController {
    private final PostingImportService service;

    public record CreateRequest(@NotBlank @Size(max = 1000) String sourceUrl) {}

    @PostMapping
    public RestResultResponse<JsonNode> create(@Valid @RequestBody CreateRequest request) {
        return RestResultResponse.of(service.create(request.sourceUrl()));
    }

    @GetMapping
    public RestResultResponse<List<JsonNode>> list() {
        return RestResultResponse.of(service.list());
    }

    @GetMapping("/{id}")
    public RestResultResponse<JsonNode> detail(@PathVariable String id) {
        return RestResultResponse.of(service.detail(id));
    }

    @PostMapping("/{id}/retry")
    public RestResultResponse<JsonNode> retry(@PathVariable String id) {
        return RestResultResponse.of(service.retry(id));
    }
}
