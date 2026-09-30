package com.jd.recognition.ctrl;

import com.fasterxml.jackson.databind.JsonNode;
import com.jd.recognition.service.RecognitionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.jd.common.rest.RestResultResponse;

import java.util.List;

@RestController
@RequestMapping("/api/recognition")
@RequiredArgsConstructor
public class RecognitionController {
    private final RecognitionService service;

    @GetMapping("/config")
    public RestResultResponse<JsonNode> configuration() {
        return RestResultResponse.of(service.configuration());
    }

    @GetMapping("/tasks")
    public RestResultResponse<List<JsonNode>> list() {
        return RestResultResponse.of(service.list());
    }

    @GetMapping("/tasks/{id}")
    public RestResultResponse<JsonNode> detail(@PathVariable String id) {
        return RestResultResponse.of(service.detail(id));
    }

    @PostMapping("/tasks/{id}/retry")
    public RestResultResponse<JsonNode> retry(@PathVariable String id) {
        return RestResultResponse.of(service.retry(id));
    }
}
