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

    public record EventResponse(
            Long id,
            PostingEnums.Stage fromStage,
            PostingEnums.Stage toStage,
            LocalDateTime occurredAt,
            String note
    ) {
    }
}
