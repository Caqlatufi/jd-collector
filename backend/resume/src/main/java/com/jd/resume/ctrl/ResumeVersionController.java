package com.jd.resume.ctrl;

import com.jd.resume.model.ResumeDtos;
import com.jd.resume.model.ResumeType;
import com.jd.resume.service.ResumeVersionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
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
@RequestMapping("/api/resume-versions")
@RequiredArgsConstructor
public class ResumeVersionController {

    private final ResumeVersionService service;

    @GetMapping
    public RestResultResponse<List<ResumeDtos.SummaryResponse>> list(
            @RequestParam(required = false) Boolean active,
            @RequestParam(required = false) ResumeType type
    ) {
        return RestResultResponse.of(service.list(active, type));
    }

    @GetMapping("/{id}")
    public RestResultResponse<ResumeDtos.DetailResponse> get(@PathVariable Long id) {
        return RestResultResponse.of(service.get(id));
    }

    @GetMapping("/{id}/blocks")
    public RestResultResponse<List<ResumeDtos.BlockResponse>> blocks(@PathVariable Long id) {
        return RestResultResponse.of(service.blocks(id));
    }

    @PostMapping
    public RestResultResponse<ResumeDtos.DetailResponse> create(@Valid @RequestBody ResumeDtos.SaveRequest request) {
        return RestResultResponse.of(service.create(request));
    }

    @PostMapping("/{id}/archive")
    public RestResultResponse<ResumeDtos.DetailResponse> archive(@PathVariable Long id) {
        return RestResultResponse.of(service.archive(id));
    }

    @DeleteMapping("/{id}")
    public RestResultResponse<Boolean> delete(@PathVariable Long id) {
        service.delete(id);
        return RestResultResponse.of(true);
    }

    @PutMapping("/{id}")
    public RestResultResponse<ResumeDtos.DetailResponse> update(
            @PathVariable Long id,
            @Valid @RequestBody ResumeDtos.SaveRequest request
    ) {
        return RestResultResponse.of(service.update(id, request));
    }
}
