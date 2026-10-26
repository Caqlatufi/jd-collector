package com.jd.interview.ctrl;

import com.jd.interview.model.InterviewDtos;
import com.jd.interview.model.InterviewEnums;
import com.jd.interview.service.InterviewService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import com.jd.common.rest.RestResultResponse;

import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class InterviewController {

    private final InterviewService service;

    @GetMapping("/interviews")
    public RestResultResponse<List<InterviewDtos.Response>> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(required = false) InterviewEnums.Status status,
            @RequestParam(required = false) Long postingId
    ) {
        return RestResultResponse.of(service.list(from, to, status, postingId));
    }

    @PostMapping("/postings/{postingId}/interviews")
    public RestResultResponse<InterviewDtos.Response> create(
            @PathVariable Long postingId,
            @Valid @RequestBody InterviewDtos.SaveRequest request
    ) {
        return RestResultResponse.of(service.create(postingId, request));
    }

    @PostMapping("/postings/{postingId}/interview-schedule")
    public RestResultResponse<InterviewDtos.Response> schedule(
            @PathVariable Long postingId,
            @Valid @RequestBody InterviewDtos.ScheduleRequest request
    ) {
        return RestResultResponse.of(service.scheduleNext(postingId, request));
    }

    @PutMapping("/interviews/{id}")
    public RestResultResponse<InterviewDtos.Response> update(
            @PathVariable Long id,
            @Valid @RequestBody InterviewDtos.SaveRequest request
    ) {
        return RestResultResponse.of(service.update(id, request));
    }
}
