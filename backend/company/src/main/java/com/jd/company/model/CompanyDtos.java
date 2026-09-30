package com.jd.company.model;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

public final class CompanyDtos {

    private CompanyDtos() {
    }

    public record SaveRequest(
            @NotBlank(message = "公司名称不能为空") @Size(max = 120, message = "公司名称不能超过120个字符") String name,
            @Size(max = 120, message = "公司简称不能超过120个字符") String alias,
            @NotNull(message = "业务类型不能为空") CompanyTypes.BusinessType businessType,
            @NotNull(message = "产品所有权不能为空") CompanyTypes.ProductOwnership productOwnership,
            @Size(max = 255, message = "办公地址不能超过255个字符") String address,
            @Min(value = 0, message = "通勤时间不能小于0") @Max(value = 300, message = "通勤时间不能超过300分钟") Integer commuteMinutes,
            @Min(value = 0, message = "公司质量评分不能小于0") @Max(value = 20, message = "公司质量评分不能超过20") Integer qualityScore,
            String notes,
            Boolean active
    ) {
    }

    public record Response(
            Long id,
            String name,
            String alias,
            CompanyTypes.BusinessType businessType,
            CompanyTypes.ProductOwnership productOwnership,
            String address,
            Integer commuteMinutes,
            Integer qualityScore,
            String notes,
            Boolean active,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {
    }
}
