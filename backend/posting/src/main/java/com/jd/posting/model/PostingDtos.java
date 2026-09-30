package com.jd.posting.model;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalDateTime;

public final class PostingDtos {

    private PostingDtos() {
    }

    public record SaveRequest(
            @NotNull(message = "公司不能为空") Long companyId,
            @NotBlank(message = "岗位名称不能为空") @Size(max = 160, message = "岗位名称不能超过160个字符") String title,
            @NotNull(message = "岗位方向不能为空") PostingEnums.Direction direction,
            @NotNull(message = "岗位来源不能为空") PostingEnums.Source source,
            @Size(max = 1000, message = "来源链接不能超过1000个字符") String sourceUrl,
            @NotBlank(message = "JD 原文不能为空") String rawJd,
            @Size(max = 255, message = "岗位地点不能超过255个字符") String location,
            @Min(value = 0, message = "薪资下限不能小于0") Integer salaryMinK,
            @Min(value = 0, message = "薪资上限不能小于0") Integer salaryMaxK,
            @Min(value = 1, message = "薪资月数不能小于1") @Max(value = 24, message = "薪资月数不能超过24") Integer salaryMonths,
            @Min(value = 0, message = "最低经验年限不能小于0") Integer experienceMin,
            @Min(value = 0, message = "最高经验年限不能小于0") Integer experienceMax,
            LocalDate publishedAt,
            LocalDate recruiterActiveAt,
            Boolean officialSynchronized,
            String requiredSkills,
            String bonusSkills,
            String matchPoints,
            String skillGaps,
            String riskNotes,
            Boolean blockingRisk,
            @NotNull(message = "简历匹配度评分不能为空") @Min(value = 0, message = "简历匹配度不能小于0") @Max(value = 35, message = "简历匹配度不能超过35") Integer matchScore,
            @NotNull(message = "公司质量评分不能为空") @Min(value = 0, message = "公司质量评分不能小于0") @Max(value = 20, message = "公司质量评分不能超过20") Integer companyScore,
            @NotNull(message = "招聘新鲜度评分不能为空") @Min(value = 0, message = "招聘新鲜度不能小于0") @Max(value = 15, message = "招聘新鲜度不能超过15") Integer freshnessScore,
            @NotNull(message = "通勤评分不能为空") @Min(value = 0, message = "通勤评分不能小于0") @Max(value = 15, message = "通勤评分不能超过15") Integer commuteScore,
            @NotNull(message = "薪资评分不能为空") @Min(value = 0, message = "薪资评分不能小于0") @Max(value = 15, message = "薪资评分不能超过15") Integer salaryScore,
            PostingEnums.Tier tier,
            PostingEnums.Recommendation recommendation,
            @Size(max = 500, message = "人工覆盖原因不能超过500个字符") String manualOverrideReason
    ) {
    }

    public record Response(
            Long id,
            Long companyId,
            String companyName,
            String title,
            PostingEnums.Direction direction,
            PostingEnums.Source source,
            String sourceUrl,
            String rawJd,
            String location,
            Integer salaryMinK,
            Integer salaryMaxK,
            Integer salaryMonths,
            Integer experienceMin,
            Integer experienceMax,
            LocalDate publishedAt,
            LocalDate recruiterActiveAt,
            Boolean officialSynchronized,
            String requiredSkills,
            String bonusSkills,
            String matchPoints,
            String skillGaps,
            String riskNotes,
            Boolean blockingRisk,
            Integer matchScore,
            Integer companyScore,
            Integer freshnessScore,
            Integer commuteScore,
            Integer salaryScore,
            Integer totalScore,
            PostingEnums.Tier tier,
            PostingEnums.Recommendation recommendation,
            String manualOverrideReason,
            PostingEnums.Stage stage,
            Long resumeVersionId,
            String resumeVersionName,
            LocalDateTime appliedAt,
            String nextAction,
            LocalDateTime nextActionAt,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {
    }
}
