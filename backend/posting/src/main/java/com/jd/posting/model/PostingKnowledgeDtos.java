package com.jd.posting.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;
import java.util.List;

public final class PostingKnowledgeDtos {

    private PostingKnowledgeDtos() {
    }

    public record TermInput(
            @NotBlank(message = "知识词不能为空")
            @Size(max = 100, message = "知识词不能超过100个字符") String term,
            @NotNull(message = "知识词优先级不能为空") PostingKnowledgeEnums.Priority priority
    ) {
    }

    public record ReplaceTermsRequest(
            @NotBlank(message = "提取版本不能为空")
            @Size(max = 40, message = "提取版本不能超过40个字符") String extractorVersion,
            @NotNull(message = "知识词列表不能为空")
            @Size(max = 30, message = "每条JD最多保存30个知识词") List<@Valid TermInput> terms
    ) {
    }

    public record TermResponse(
            String term,
            String normalizedTerm,
            PostingKnowledgeEnums.Priority priority,
            int weight
    ) {
    }

    public record PostingTerms(
            Long postingId,
            boolean processed,
            String extractorVersion,
            String sourceHash,
            boolean stale,
            LocalDateTime updatedAt,
            List<TermResponse> terms
    ) {
    }

    public record PostingOption(
            Long postingId,
            String companyName,
            String title,
            String direction,
            PostingEnums.Tier tier,
            PostingEnums.Stage stage,
            boolean processed,
            int termCount,
            boolean stale
    ) {
    }

    public record GraphRequest(
            @Size(max = 500, message = "一次最多选择500条JD") List<@NotNull Long> postingIds,
            @Min(value = 1, message = "节点最小JD数不能小于1")
            @Max(value = 500, message = "节点最小JD数不能超过500") Integer minDocumentCount,
            @Min(value = 1, message = "边最小JD数不能小于1")
            @Max(value = 500, message = "边最小JD数不能超过500") Integer minEdgeDocumentCount,
            @Min(value = 10, message = "最大节点数不能小于10")
            @Max(value = 200, message = "最大节点数不能超过200") Integer maxNodes
    ) {
    }

    public record GraphNode(
            String id,
            String label,
            int documentCount,
            int weightedCount,
            int highCount,
            int mediumCount,
            int lowCount,
            List<Long> postingIds
    ) {
    }

    public record GraphEdge(
            String source,
            String target,
            int documentCount,
            int weightedCount,
            List<Long> postingIds
    ) {
    }

    public record KnowledgeGraph(
            int selectedPostingCount,
            int processedPostingCount,
            int taggedPostingCount,
            int stalePostingCount,
            List<Long> unprocessedPostingIds,
            List<Long> emptyPostingIds,
            List<Long> stalePostingIds,
            List<GraphNode> nodes,
            List<GraphEdge> edges
    ) {
    }
}
