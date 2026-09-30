package com.jd.interview.model;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

public final class InterviewDtos {

    private InterviewDtos() {
    }

    public record SaveRequest(
            @NotNull(message = "面试轮次不能为空") @Min(value = 1, message = "面试轮次必须大于等于1") Integer roundNo,
            @NotNull(message = "面试类型不能为空") InterviewEnums.Type type,
            @NotNull(message = "面试形式不能为空") InterviewEnums.Format format,
            @NotNull(message = "面试时间不能为空") LocalDateTime scheduledAt,
            @NotNull(message = "面试状态不能为空") InterviewEnums.Status status,
            @Size(max = 120, message = "面试官信息不能超过120个字符") String interviewer,
            String questions,
            String feedback,
            @Size(max = 500, message = "下一步不能超过500个字符") String nextStep
    ) {
    }

    public record Response(
            Long id,
            Long jobPostingId,
            String jobTitle,
            String companyName,
            Integer roundNo,
            InterviewEnums.Type type,
            InterviewEnums.Format format,
            LocalDateTime scheduledAt,
            InterviewEnums.Status status,
            String interviewer,
            String questions,
            String feedback,
            String nextStep,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {
    }
}
