package com.jd.company.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

public final class CompanyAddressDtos {
    private CompanyAddressDtos() { }

    public record SaveRequest(
            @NotBlank @Size(max = 120) String expectedCompanyName,
            @NotBlank @Size(max = 255) String address,
            @NotBlank @Size(max = 2048) String sourceUrl,
            @NotBlank @Size(max = 2000) String evidenceText,
            @NotBlank @Pattern(regexp = "[0-9a-f-]{36}") String taskId,
            @Size(max = 1000) String expectedPostingUrl,
            @Size(max = 255) String expectedLocation
    ) { }

    public record Response(Long id, Long companyId, Long postingId, String address, String sourceType,
                           String sourceUrl, String evidenceText, String taskId, LocalDateTime createdAt) { }
}
