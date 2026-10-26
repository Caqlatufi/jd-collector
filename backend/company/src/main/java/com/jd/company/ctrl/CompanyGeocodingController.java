package com.jd.company.ctrl;

import com.jd.common.rest.RestResultResponse;
import com.jd.company.service.CompanyGeocodingService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/companies/location-positions")
@RequiredArgsConstructor
public class CompanyGeocodingController {
    private final CompanyGeocodingService service;

    public record ResolveRequest(@NotBlank @Size(max = 255) String address) {
    }

    @GetMapping
    public RestResultResponse<List<CompanyGeocodingService.Position>> cached() {
        return RestResultResponse.of(service.cached());
    }

    @PostMapping
    public RestResultResponse<CompanyGeocodingService.Position> resolve(@Valid @RequestBody ResolveRequest request) {
        return RestResultResponse.of(service.resolve(request.address()));
    }
}
