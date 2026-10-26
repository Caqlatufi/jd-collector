package com.jd.dashboard.service;

import com.jd.company.service.CompanyService;
import com.jd.dashboard.model.DashboardDtos;
import com.jd.pipeline.event.model.StageEvent;
import com.jd.pipeline.event.repo.StageEventRepository;
import com.jd.interview.model.Interview;
import com.jd.interview.model.InterviewEnums;
import com.jd.interview.repo.InterviewRepository;
import com.jd.posting.model.JobPosting;
import com.jd.posting.model.PostingEnums;
import com.jd.posting.repo.JobPostingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RequiredArgsConstructor
public class DashboardService {

    private static final Set<PostingEnums.Stage> TERMINAL_STAGES = EnumSet.of(
            PostingEnums.Stage.ACCEPTED,
            PostingEnums.Stage.REJECTED,
            PostingEnums.Stage.WITHDRAWN,
            PostingEnums.Stage.CLOSED
    );

    private static final Set<PostingEnums.Stage> ACTIVE_APPLICATION_STAGES = EnumSet.of(
            PostingEnums.Stage.APPLIED,
            PostingEnums.Stage.HR_SCREEN,
            PostingEnums.Stage.WRITTEN_TEST,
            PostingEnums.Stage.INTERVIEW,
            PostingEnums.Stage.OFFER
    );

    private static final Set<PostingEnums.Stage> FEEDBACK_STAGES = EnumSet.of(
            PostingEnums.Stage.HR_SCREEN, PostingEnums.Stage.WRITTEN_TEST, PostingEnums.Stage.INTERVIEW,
            PostingEnums.Stage.OFFER, PostingEnums.Stage.ACCEPTED, PostingEnums.Stage.REJECTED
    );

    private final JobPostingRepository postingRepository;
    private final InterviewRepository interviewRepository;
    private final StageEventRepository eventRepository;
    private final CompanyService companyService;
    private final Clock clock;

    @Transactional(readOnly = true)
    public DashboardDtos.TodayResponse today() {
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDate today = now.toLocalDate();
        LocalDateTime start = today.atStartOfDay();
        LocalDateTime end = today.atTime(LocalTime.MAX);
        LocalDateTime sevenDayEnd = today.plusDays(7).atTime(LocalTime.MAX);
        List<JobPosting> postings = postingRepository.findAllByDeletedFalseOrderByUpdatedAtDesc();

        List<DashboardDtos.ActionItem> todayActions = postings.stream()
                .filter(this::isActiveWithNextAction)
                .filter(item -> !item.getNextActionAt().isBefore(start) && !item.getNextActionAt().isAfter(end))
                .map(this::toAction)
                .toList();
        List<DashboardDtos.ActionItem> overdueActions = postings.stream()
                .filter(this::isActiveWithNextAction)
                .filter(item -> item.getNextActionAt().isBefore(start))
                .map(this::toAction)
                .toList();

        List<DashboardDtos.InterviewItem> interviews = interviewRepository
                .findAllByDeletedFalseAndScheduledAtBetweenOrderByScheduledAtAsc(start, sevenDayEnd).stream()
                .filter(item -> item.getStatus() == InterviewEnums.Status.SCHEDULED)
                .filter(item -> postings.stream().anyMatch(p -> p.getId().equals(item.getJobPostingId()) && !TERMINAL_STAGES.contains(p.getStage())))
                .map(this::toInterview)
                .toList();

        Map<PostingEnums.Stage, Long> stageCounts = new EnumMap<>(PostingEnums.Stage.class);
        Arrays.stream(PostingEnums.Stage.values()).forEach(stage -> stageCounts.put(stage, 0L));
        postings.forEach(item -> stageCounts.compute(item.getStage(), (key, count) -> count == null ? 1L : count + 1));

        Map<PostingEnums.Tier, Long> tierCounts = new EnumMap<>(PostingEnums.Tier.class);
        Arrays.stream(PostingEnums.Tier.values()).forEach(tier -> tierCounts.put(tier, 0L));
        postings.forEach(item -> tierCounts.compute(item.getTier(), (key, count) -> count == null ? 1L : count + 1));

        return new DashboardDtos.TodayResponse(
                todayActions,
                overdueActions,
                interviews,
                stageCounts,
                tierCounts,
                conversion(postings),
                now,
                planItems(postings, now)
        );
    }

    private List<DashboardDtos.PlanItem> planItems(List<JobPosting> postings, LocalDateTime now) {
        Map<Long, JobPosting> allPostings = postings.stream()
                .collect(Collectors.toMap(JobPosting::getId, Function.identity()));
        Map<Long, JobPosting> active = postings.stream()
                .filter(p -> ACTIVE_APPLICATION_STAGES.contains(p.getStage()) && p.getTier() != PostingEnums.Tier.SKIP)
                .collect(Collectors.toMap(JobPosting::getId, Function.identity()));
        List<DashboardDtos.PlanItem> items = new ArrayList<>();
        List<Interview> allInterviews = interviewRepository.findAllByDeletedFalseOrderByScheduledAtAsc();
        List<StageEvent> events = eventRepository.findAllByDeletedFalse();
        Set<Long> feedbackIds = events.stream()
                .filter(e -> FEEDBACK_STAGES.contains(e.getToStage()) || FEEDBACK_STAGES.contains(e.getFromStage()))
                .map(StageEvent::getJobPostingId).collect(Collectors.toSet());
        allInterviews.forEach(i -> feedbackIds.add(i.getJobPostingId()));
        for (JobPosting p : postings) {
            // 投递事实独立于评分和手填下一步；已结束岗位保留历史标记，但不再催反馈。
            if (p.getAppliedAt() == null) continue;
            LocalDateTime dueAt = p.getAppliedAt().plusDays(14);
            boolean feedback = FEEDBACK_STAGES.contains(p.getStage()) || feedbackIds.contains(p.getId());
            String state = TERMINAL_STAGES.contains(p.getStage())
                    ? p.getStage() == PostingEnums.Stage.ACCEPTED ? "COMPLETED" : "ENDED"
                    : feedback ? "FEEDBACK_RECEIVED" : now.isAfter(dueAt) ? "TIMED_OUT" : "WAITING_FEEDBACK";
            items.add(new DashboardDtos.PlanItem("application-" + p.getId(), p.getId(), null,
                    companyService.getEntity(p.getCompanyId()).getName(), p.getTitle(), p.getTier(),
                    "APPLICATION", "已投递", "点击节点推进进度或修改记录；超过14天无反馈自动显示超时，收到反馈后恢复实际进度。",
                    p.getAppliedAt(), state, dueAt, Math.max(0, ChronoUnit.DAYS.between(p.getAppliedAt(), now))));
        }
        for (JobPosting p : active.values()) {
            boolean hasAction = p.getNextAction() != null && !p.getNextAction().isBlank();
            if (!hasAction && p.getNextActionAt() == null) continue;
            // 面试模块会同步“参加第N轮面试”到下一步；只展示面试本体，避免重复及已完成/取消后的伪超期。
            boolean generatedByInterview = allInterviews.stream().anyMatch(i -> i.getJobPostingId().equals(p.getId())
                    && ("参加第 " + i.getRoundNo() + " 轮面试").equals(p.getNextAction())
                    && i.getScheduledAt().equals(p.getNextActionAt()));
            if (generatedByInterview) continue;
            String state = !hasAction || p.getNextActionAt() == null ? "UNSCHEDULED"
                    : p.getNextActionAt().isBefore(now) ? "OVERDUE" : "PLANNED";
            items.add(new DashboardDtos.PlanItem("action-" + p.getId(), p.getId(), null,
                    companyService.getEntity(p.getCompanyId()).getName(), p.getTitle(), p.getTier(),
                    "FOLLOW_UP", hasAction ? p.getNextAction() : "待补下一步动作", "在 Pipeline 更新下一步或推进阶段；超期仅作提醒，不自动改变业务阶段。",
                    p.getNextActionAt(), state, null, null));
        }
        for (Interview i : allInterviews) {
            JobPosting p = allPostings.get(i.getJobPostingId());
            if (p == null) continue;
            String state = i.getStatus() == InterviewEnums.Status.CANCELLED ? "CANCELLED"
                    : i.getStatus() == InterviewEnums.Status.COMPLETED ? "COMPLETED"
                    : i.getStatus() == InterviewEnums.Status.NO_SHOW ? "NO_SHOW"
                    : TERMINAL_STAGES.contains(p.getStage()) ? "ENDED"
                    : i.getScheduledAt().isBefore(now) ? "OVERDUE" : "PLANNED";
            items.add(new DashboardDtos.PlanItem("interview-" + i.getId(), p.getId(), i.getId(),
                    companyService.getEntity(p.getCompanyId()).getName(), p.getTitle(), p.getTier(),
                    "INTERVIEW", "第 " + i.getRoundNo() + " 轮面试", interviewTypeName(i.getType()) + " · " + switch (i.getFormat()) {case ONLINE -> "线上"; case ONSITE -> "现场"; case PHONE -> "电话";}
                    + (i.getNextStep() == null ? "" : " · " + i.getNextStep()), i.getScheduledAt(), state, null, null));
        }
        for (StageEvent event : events) {
            JobPosting p = allPostings.get(event.getJobPostingId());
            if (p == null || p.getAppliedAt() == null || event.getOccurredAt().isBefore(p.getAppliedAt())) continue;
            if (event.getToStage() == PostingEnums.Stage.APPLIED || event.getToStage() == event.getFromStage()) continue;
            if (!ACTIVE_APPLICATION_STAGES.contains(event.getToStage()) && !TERMINAL_STAGES.contains(event.getToStage())) continue;
            // 创建面试日程的系统事件由面试本体表达，不把创建时间误当作实际面试时间。
            if (event.getNote() != null && event.getNote().matches("创建第 [0-9]+ 轮面试日程")) continue;
            items.add(new DashboardDtos.PlanItem("stage-" + event.getId(), p.getId(), null,
                    companyService.getEntity(p.getCompanyId()).getName(), p.getTitle(), p.getTier(),
                    "STAGE", stageName(event.getToStage()), event.getNote(), event.getOccurredAt(),
                    TERMINAL_STAGES.contains(event.getToStage()) && event.getToStage() != PostingEnums.Stage.ACCEPTED
                            ? "ENDED" : "COMPLETED", null, null));
        }
        items.sort(Comparator.comparing(DashboardDtos.PlanItem::scheduledAt,
                Comparator.nullsLast(Comparator.naturalOrder())).thenComparing(DashboardDtos.PlanItem::id));
        return items;
    }

    private String stageName(PostingEnums.Stage stage) {
        return switch (stage) {
            case HR_SCREEN -> "HR沟通";
            case WRITTEN_TEST -> "笔试";
            case INTERVIEW -> "面试阶段";
            case OFFER -> "Offer";
            case ACCEPTED -> "已接受";
            case REJECTED -> "被拒";
            case WITHDRAWN -> "主动终止";
            case CLOSED -> "已关闭";
            default -> stage.name();
        };
    }

    private String interviewTypeName(InterviewEnums.Type type) {
        return switch (type) {
            case HR -> "HR沟通";
            case TECHNICAL -> "技术面试";
            case MANAGER -> "主管面试";
            case FINAL -> "终面";
            case OTHER -> "其他面试";
        };
    }

    private DashboardDtos.Conversion conversion(List<JobPosting> postings) {
        Set<Long> postingIds = postings.stream().map(JobPosting::getId).collect(Collectors.toSet());
        List<StageEvent> events = eventRepository.findAllByDeletedFalse().stream()
                .filter(e -> postingIds.contains(e.getJobPostingId())).toList();
        Set<Long> hr = idsFor(events, PostingEnums.Stage.HR_SCREEN);
        Set<Long> interview = idsFor(events, PostingEnums.Stage.INTERVIEW);
        Set<Long> offer = idsFor(events, PostingEnums.Stage.OFFER);
        long collected = postings.size();
        long applied = postings.stream().filter(item -> item.getAppliedAt() != null).count();
        long hrCount = hr.size();
        long interviewCount = interview.size();
        long offerCount = offer.size();
        return new DashboardDtos.Conversion(
                collected,
                applied,
                hrCount,
                interviewCount,
                offerCount,
                ratio(applied, collected),
                ratio(interviewCount, applied),
                ratio(offerCount, interviewCount)
        );
    }

    private Set<Long> idsFor(List<StageEvent> events, PostingEnums.Stage stage) {
        Set<Long> result = new HashSet<>();
        events.stream().filter(event -> event.getToStage() == stage).forEach(event -> result.add(event.getJobPostingId()));
        return result;
    }

    private double ratio(long numerator, long denominator) {
        return denominator == 0 ? 0 : Math.round((numerator * 10000.0) / denominator) / 100.0;
    }

    private boolean isActiveWithNextAction(JobPosting posting) {
        return ACTIVE_APPLICATION_STAGES.contains(posting.getStage()) && posting.getNextActionAt() != null;
    }

    private DashboardDtos.ActionItem toAction(JobPosting posting) {
        return new DashboardDtos.ActionItem(
                posting.getId(), companyService.getEntity(posting.getCompanyId()).getName(), posting.getTitle(),
                posting.getTier(), posting.getStage(), posting.getNextAction(), posting.getNextActionAt()
        );
    }

    private DashboardDtos.InterviewItem toInterview(Interview interview) {
        JobPosting posting = postingRepository.findByIdAndDeletedFalse(interview.getJobPostingId()).orElseThrow();
        return new DashboardDtos.InterviewItem(
                interview.getId(), posting.getId(), companyService.getEntity(posting.getCompanyId()).getName(),
                posting.getTitle(), interview.getRoundNo(), interview.getType(), interview.getFormat(),
                interview.getScheduledAt()
        );
    }
}
