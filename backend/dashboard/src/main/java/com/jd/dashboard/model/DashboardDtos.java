package com.jd.dashboard.model;

import com.jd.interview.model.InterviewEnums;
import com.jd.posting.model.PostingEnums;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public final class DashboardDtos {

    private DashboardDtos() {
    }

    public record ActionItem(
            Long postingId,
            String companyName,
            String title,
            PostingEnums.Tier tier,
            PostingEnums.Stage stage,
            String nextAction,
            LocalDateTime nextActionAt
    ) {
    }

    public record InterviewItem(
            Long interviewId,
            Long postingId,
            String companyName,
            String jobTitle,
            Integer roundNo,
            InterviewEnums.Type type,
            InterviewEnums.Format format,
            LocalDateTime scheduledAt
    ) {
    }

    public record Conversion(
            long collected,
            long applied,
            long hrScreen,
            long interviewed,
            long offered,
            double applyRate,
            double interviewRate,
            double offerRate
    ) {
    }

    public record TodayResponse(
            List<ActionItem> todayActions,
            List<ActionItem> overdueActions,
            List<InterviewItem> nextSevenDayInterviews,
            Map<PostingEnums.Stage, Long> stageCounts,
            Map<PostingEnums.Tier, Long> tierCounts,
            Conversion conversion,
            LocalDateTime serverNow,
            List<PlanItem> planItems
    ) {
    }

    public record PlanItem(
            String id,
            Long postingId,
            Long interviewId,
            String companyName,
            String jobTitle,
            PostingEnums.Tier tier,
            String kind,
            String title,
            String description,
            LocalDateTime scheduledAt,
            String status,
            LocalDateTime feedbackDueAt,
            Long elapsedDays
    ) {
    }
}
