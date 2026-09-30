package com.jd.company.ctrl;

import com.jd.company.model.CompanyDtos;
import com.jd.company.service.CompanyService;
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

@RestController
@RequestMapping("/api/companies")
@RequiredArgsConstructor
public class CompanyController {

    private final CompanyService service;

    @GetMapping
    public RestPageResultResponse<CompanyDtos.Response> search(
            @RequestParam(defaultValue = "") String keyword,
            @RequestParam(defaultValue = "1") int number,
            @RequestParam(defaultValue = "20") int size
    ) {
        return RestPageResultResponse.of(service.search(keyword, number, size));
    }

    @GetMapping("/{id}")
    public RestResultResponse<CompanyDtos.Response> get(@PathVariable Long id) {
        return RestResultResponse.of(service.get(id));
    }

    @PostMapping
    public RestResultResponse<CompanyDtos.Response> create(@Valid @RequestBody CompanyDtos.SaveRequest request) {
        return RestResultResponse.of(service.create(request));
    }

    @PutMapping("/{id}")
    public RestResultResponse<CompanyDtos.Response> update(
            @PathVariable Long id,
            @Valid @RequestBody CompanyDtos.SaveRequest request
    ) {
        return RestResultResponse.of(service.update(id, request));
    }
}
