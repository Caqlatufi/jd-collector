package com.jd.posting.ctrl;

import com.jd.posting.model.PostingDtos;
import com.jd.posting.model.PostingEnums;
import com.jd.posting.service.PostingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import com.jd.common.rest.RestPageResultResponse;
import com.jd.common.rest.RestResultResponse;

import java.util.List;

@RestController
@RequestMapping("/api/postings")
@RequiredArgsConstructor
public class PostingController {

    private final PostingService service;

    @GetMapping
    public RestPageResultResponse<PostingDtos.Response> search(
            @RequestParam(defaultValue = "") String keyword,
            @RequestParam(required = false) List<String> direction,
            @RequestParam(required = false) List<PostingEnums.Tier> tier,
            @RequestParam(required = false) List<PostingEnums.Stage> stage,
            @RequestParam(required = false) Long companyId,
            @RequestParam(required = false) Long resumeVersionId,
            @RequestParam(defaultValue = "SCORE") PostingEnums.SortBy sortBy,
            @RequestParam(defaultValue = "1") int number,
            @RequestParam(defaultValue = "20") int size
    ) {
        return RestPageResultResponse.of(service.search(keyword, direction, tier, stage, companyId, resumeVersionId, sortBy, number, size));
    }

    @GetMapping("/{id}")
    public RestResultResponse<PostingDtos.Response> get(@PathVariable Long id) {
        return RestResultResponse.of(service.get(id));
    }

    @GetMapping("/source")
    public RestResultResponse<List<PostingDtos.Response>> findSource(@RequestParam String url) {
        return RestResultResponse.of(service.findSource(url));
    }

    @PostMapping
    public RestResultResponse<PostingDtos.Response> create(@Valid @RequestBody PostingDtos.SaveRequest request) {
        return RestResultResponse.of(service.create(request));
    }

    @PutMapping("/{id}")
    public RestResultResponse<PostingDtos.Response> update(
            @PathVariable Long id,
            @Valid @RequestBody PostingDtos.SaveRequest request
    ) {
        return RestResultResponse.of(service.update(id, request));
    }

    @PutMapping("/{id}/archive")
    public RestResultResponse<Boolean> archive(@PathVariable Long id) {
        service.archive(id);
        return RestResultResponse.of(true);
    }

    @PutMapping("/{id}/commute")
    public RestResultResponse<PostingDtos.Response> updateCommute(
            @PathVariable Long id,
            @Valid @RequestBody PostingDtos.CommuteRequest request
    ) {
        return RestResultResponse.of(service.updateCommute(id, request));
    }

    @PutMapping("/{id}/boss-competition")
    public RestResultResponse<PostingDtos.Response> updateBossCompetition(
            @PathVariable Long id,
            @Valid @RequestBody PostingDtos.BossCompetitionRequest request
    ) {
        return RestResultResponse.of(service.updateBossCompetition(id, request));
    }

    @PutMapping("/{id}/source-url")
    public RestResultResponse<PostingDtos.Response> updateSourceUrl(
            @PathVariable Long id,
            @Valid @RequestBody PostingDtos.SourceUrlRequest request
    ) {
        return RestResultResponse.of(service.updateSourceUrl(id, request));
    }
}
