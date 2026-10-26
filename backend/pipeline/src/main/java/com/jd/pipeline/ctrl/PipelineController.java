package com.jd.pipeline.ctrl;

import com.jd.pipeline.model.PipelineDtos;
import com.jd.pipeline.service.PipelineService;
import com.jd.posting.model.PostingDtos;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.jd.common.rest.RestResultResponse;

import java.util.List;

@RestController
@RequestMapping("/api/postings/{postingId}")
@RequiredArgsConstructor
public class PipelineController {

    private final PipelineService service;

    @PutMapping("/contact-stage")
    public RestResultResponse<PostingDtos.Response> changeContactStage(
            @PathVariable Long postingId,
            @Valid @RequestBody PipelineDtos.ContactStageRequest request
    ) {
        return RestResultResponse.of(service.changeContactStage(postingId, request));
    }

    @PutMapping("/stage")
    public RestResultResponse<PostingDtos.Response> changeStage(
            @PathVariable Long postingId,
            @Valid @RequestBody PipelineDtos.StageChangeRequest request
    ) {
        return RestResultResponse.of(service.changeStage(postingId, request));
    }

    @PutMapping("/result")
    public RestResultResponse<PostingDtos.Response> recordResult(
            @PathVariable Long postingId,
            @Valid @RequestBody PipelineDtos.ResultRequest request
    ) {
        return RestResultResponse.of(service.recordResult(postingId, request));
    }

    @GetMapping("/events")
    public RestResultResponse<List<PipelineDtos.EventResponse>> events(@PathVariable Long postingId) {
        return RestResultResponse.of(service.events(postingId));
    }

    @PutMapping("/application-date")
    public RestResultResponse<PostingDtos.Response> updateApplicationDate(
            @PathVariable Long postingId,
            @Valid @RequestBody PipelineDtos.ApplicationDateRequest request
    ) {
        return RestResultResponse.of(service.updateApplicationDate(postingId, request));
    }

    @PutMapping("/events/{eventId}")
    public RestResultResponse<List<PipelineDtos.EventResponse>> updateEvent(
            @PathVariable Long postingId, @PathVariable Long eventId,
            @Valid @RequestBody PipelineDtos.EventUpdateRequest request
    ) {
        return RestResultResponse.of(service.updateEvent(postingId, eventId, request));
    }
}
