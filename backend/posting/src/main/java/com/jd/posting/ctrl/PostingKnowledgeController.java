package com.jd.posting.ctrl;

import com.jd.posting.model.PostingEnums;
import com.jd.posting.model.PostingKnowledgeDtos;
import com.jd.posting.service.PostingKnowledgeService;
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
import com.jd.common.rest.RestResultResponse;

import java.util.List;

@RestController
@RequestMapping("/api/posting-knowledge")
@RequiredArgsConstructor
public class PostingKnowledgeController {

    private final PostingKnowledgeService service;

    @GetMapping("/postings")
    public RestResultResponse<List<PostingKnowledgeDtos.PostingOption>> options(
            @RequestParam(defaultValue = "") String keyword,
            @RequestParam(required = false) List<String> direction,
            @RequestParam(required = false) List<PostingEnums.Tier> tier,
            @RequestParam(required = false) List<PostingEnums.Stage> stage
    ) {
        return RestResultResponse.of(service.options(keyword, direction, tier, stage));
    }

    @GetMapping("/postings/{postingId}/terms")
    public RestResultResponse<PostingKnowledgeDtos.PostingTerms> getTerms(@PathVariable Long postingId) {
        return RestResultResponse.of(service.getTerms(postingId));
    }

    @PutMapping("/postings/{postingId}/terms")
    public RestResultResponse<PostingKnowledgeDtos.PostingTerms> replaceTerms(
            @PathVariable Long postingId,
            @Valid @RequestBody PostingKnowledgeDtos.ReplaceTermsRequest request
    ) {
        return RestResultResponse.of(service.replaceTerms(postingId, request));
    }

    @PostMapping("/graph")
    public RestResultResponse<PostingKnowledgeDtos.KnowledgeGraph> graph(
            @Valid @RequestBody PostingKnowledgeDtos.GraphRequest request
    ) {
        return RestResultResponse.of(service.graph(request));
    }
}
