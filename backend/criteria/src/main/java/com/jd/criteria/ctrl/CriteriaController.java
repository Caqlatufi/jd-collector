package com.jd.criteria.ctrl;

import com.jd.criteria.model.CriteriaDtos;
import com.jd.criteria.service.CriteriaService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import com.jd.common.rest.RestResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.jd.common.rest.RestResultResponse;

@RestController
@RequestMapping("/api/criteria")
@RequiredArgsConstructor
public class CriteriaController {
    private final CriteriaService service;

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<RestResponse> invalidJson() {
        return ResponseEntity.badRequest().body(RestResponse.error(40001, "门槛请求格式或确认状态无效。"));
    }

    @GetMapping
    public RestResultResponse<CriteriaDtos.Response> get() {
        return RestResultResponse.of(service.read());
    }

    @PutMapping
    public RestResultResponse<CriteriaDtos.Response> save(
            @Valid @RequestBody CriteriaDtos.SaveRequest request) {
        return RestResultResponse.of(service.save(request));
    }
}
