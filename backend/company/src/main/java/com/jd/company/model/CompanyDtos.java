package com.jd.company.model;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.DecimalMax;

import java.time.LocalDateTime;
import java.util.List;

public final class CompanyDtos {

    private CompanyDtos() {
    }

    public record SaveRequest(
            @NotBlank(message = "公司名称不能为空") @Size(max = 120, message = "公司名称不能超过120个字符") String name,
            @Size(max = 120, message = "公司简称不能超过120个字符") String alias,
            @Size(max = 2048, message = "官网投递渠道链接不能超过2048个字符") String officialApplicationUrl,
            @NotNull(message = "业务类型不能为空") CompanyTypes.BusinessType businessType,
            @NotNull(message = "产品所有权不能为空") CompanyTypes.ProductOwnership productOwnership,
            @Size(max = 255, message = "办公地址不能超过255个字符") String address,
            @Min(value = 0, message = "通勤时间不能小于0") @Max(value = 300, message = "通勤时间不能超过300分钟") Integer commuteMinutes,
            @Min(value = 0, message = "公司质量评分不能小于0") @Max(value = 20, message = "公司质量评分不能超过20") Integer qualityScore,
            String notes,
            Boolean active,
            @Size(max = 50, message = "工作地点不能超过50个") List<@NotNull @Valid WorkLocation> workLocations
    ) {
    }

    public record Response(
            Long id,
            String name,
            String alias,
            String officialApplicationUrl,
            CompanyTypes.BusinessType businessType,
            CompanyTypes.ProductOwnership productOwnership,
            String address,
            Integer commuteMinutes,
            Integer qualityScore,
            String notes,
            Boolean active,
            LocalDateTime createdAt,
            LocalDateTime updatedAt,
            List<WorkLocation> workLocations
    ) {
    }

    public record WorkLocation(
            @Size(max = 120, message = "地点名称不能超过120个字符") String label,
            @NotBlank(message = "工作地点地址不能为空") @Size(max = 255, message = "工作地点地址不能超过255个字符") String address,
            @DecimalMin(value = "-180", message = "经度超出范围") @DecimalMax(value = "180", message = "经度超出范围") Double longitude,
            @DecimalMin(value = "-90", message = "纬度超出范围") @DecimalMax(value = "90", message = "纬度超出范围") Double latitude
    ) {
    }

    public record PostingLocation(Long postingId, Long companyId, String address) {
    }
}
