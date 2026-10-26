package com.jd.pipeline.model;

import com.jd.posting.model.PostingEnums;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

public final class PipelineDtos {

    private PipelineDtos() {
    }

    public record StageChangeRequest(
            @NotNull(message = "目标阶段不能为空") PostingEnums.Stage toStage,
            Long resumeVersionId,
            LocalDateTime occurredAt,
            LocalDateTime appliedAt,
            @Size(max = 500, message = "下一步动作不能超过500个字符") String nextAction,
            LocalDateTime nextActionAt,
            @Size(max = 1000, message = "阶段备注不能超过1000个字符") String note
    ) {
    }

    public record ContactStageRequest(
            @NotNull(message = "目标阶段不能为空") PostingEnums.Stage toStage,
            @NotNull(message = "当前阶段不能为空，请刷新后重试") PostingEnums.Stage expectedStage
    ) {
    }

    public record ResultRequest(
            @NotNull(message = "当前阶段不能为空，请刷新后重试") PostingEnums.Stage expectedStage,
            @NotNull(message = "请选择反馈结果") PostingEnums.Stage result,
            @Size(max = 1000, message = "反馈备注不能超过1000个字符") String note
    ) {
    }

    public record EventResponse(
            Long id,
            PostingEnums.Stage fromStage,
            PostingEnums.Stage toStage,
            LocalDateTime occurredAt,
            String note
    ) {
    }

    public record ApplicationDateRequest(
            @NotNull LocalDateTime expectedAppliedAt,
            @NotNull LocalDateTime appliedAt
    ) {
    }

    public record EventUpdateRequest(
            @NotNull LocalDateTime expectedOccurredAt,
            @NotNull LocalDateTime occurredAt,
            @Size(max = 1000) String note
    ) {
    }
}
