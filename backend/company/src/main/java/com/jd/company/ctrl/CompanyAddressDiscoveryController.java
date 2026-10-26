package com.jd.company.ctrl;

import com.jd.common.rest.RestResultResponse;
import com.jd.company.model.CompanyAddressDtos;
import com.jd.company.service.CompanyAddressDiscoveryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/companies")
@RequiredArgsConstructor
public class CompanyAddressDiscoveryController {
    private final CompanyAddressDiscoveryService service;

    @GetMapping("/address-discoveries")
    public RestResultResponse<List<CompanyAddressDtos.Response>> list() { return RestResultResponse.of(service.list()); }

    @PostMapping("/{id}/address-discoveries")
    public RestResultResponse<CompanyAddressDtos.Response> save(@PathVariable Long id,
            @Valid @RequestBody CompanyAddressDtos.SaveRequest request) {
        return RestResultResponse.of(service.record(id, null, request));
    }
}
