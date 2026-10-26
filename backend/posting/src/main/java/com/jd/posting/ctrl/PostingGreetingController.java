package com.jd.posting.ctrl;

import com.jd.common.rest.RestResultResponse;
import com.jd.posting.model.GreetingDtos;
import com.jd.posting.service.PostingGreetingService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.validation.annotation.Validated;

@RestController
@RequestMapping("/api/postings")
@RequiredArgsConstructor
@Validated
public class PostingGreetingController {
    private final PostingGreetingService service;

    @GetMapping("/{id}/greeting")
    public RestResultResponse<GreetingDtos.Response> latest(@PathVariable Long id,
            @RequestParam(required = false) @Positive Long resumeVersionId) {
        return RestResultResponse.of(service.latest(id, resumeVersionId));
    }

    @PostMapping("/{id}/greeting")
    public RestResultResponse<GreetingDtos.Response> generate(@PathVariable Long id,
                                                            @Valid @RequestBody GreetingDtos.Request request) {
        return RestResultResponse.of(service.generate(id, request.resumeVersionId()));
    }
}
