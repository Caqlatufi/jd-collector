package com.jd.resume.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

public final class ResumeDtos {

    private ResumeDtos() {
    }

    public record SaveRequest(
            @NotBlank(message = "简历版本名称不能为空") @Size(max = 120) String name,
            @NotNull(message = "简历类型不能为空") ResumeType type,
            @NotBlank(message = "版本标签不能为空") @Size(max = 50) String versionLabel,
            @NotBlank(message = "简历 Markdown 不能为空") String contentMarkdown,
            @Size(max = 40) String templateKey,
            @Size(max = 500) @Pattern(regexp = "^$|^/.*", message = "照片必须使用站内绝对路径") String photoUrl,
            Boolean active,
            String notes
    ) {
    }

    public record SummaryResponse(
            Long id,
            String name,
            ResumeType type,
            String versionLabel,
            String templateKey,
            String photoUrl,
            Boolean active,
            boolean archived,
            String notes,
            long blockCount,
            boolean contentReady,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {
    }

    public record DetailResponse(
            Long id,
            String name,
            ResumeType type,
            String versionLabel,
            String contentMarkdown,
            String templateKey,
            String photoUrl,
            Boolean active,
            boolean archived,
            String notes,
            long blockCount,
            boolean contentReady,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {
    }

    public record BlockResponse(
            Long id,
            String sectionKey,
            String heading,
            Integer headingLevel,
            Integer chunkIndex,
            Integer sortOrder,
            String contentMarkdown,
            String contentPlainText,
            Integer characterCount,
            String contentHash
    ) {
    }
}
