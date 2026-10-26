package com.jd.interview.service;

import com.jd.common.exception.BusinessException;
import com.jd.common.exception.ErrorCode;
import com.jd.company.service.CompanyService;
import com.jd.pipeline.event.model.StageEvent;
import com.jd.pipeline.event.repo.StageEventRepository;
import com.jd.interview.model.Interview;
import com.jd.interview.model.InterviewDtos;
import com.jd.interview.model.InterviewEnums;
import com.jd.interview.repo.InterviewRepository;
import com.jd.posting.model.JobPosting;
import com.jd.posting.model.PostingEnums;
import com.jd.posting.repo.JobPostingRepository;
import com.jd.posting.service.PostingService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

@RequiredArgsConstructor
public class InterviewService {

    private static final Set<PostingEnums.Stage> INTERVIEWABLE_STAGES = EnumSet.of(
            PostingEnums.Stage.APPLIED,
            PostingEnums.Stage.HR_SCREEN,
            PostingEnums.Stage.WRITTEN_TEST,
            PostingEnums.Stage.INTERVIEW,
            PostingEnums.Stage.OFFER
    );

    private final InterviewRepository repository;
    private final PostingService postingService;
    private final JobPostingRepository postingRepository;
    private final StageEventRepository eventRepository;
    private final CompanyService companyService;

    @Transactional(readOnly = true)
    public List<InterviewDtos.Response> list(LocalDateTime from, LocalDateTime to, InterviewEnums.Status status, Long postingId) {
        List<Interview> interviews = from != null && to != null
                ? repository.findAllByDeletedFalseAndScheduledAtBetweenOrderByScheduledAtAsc(from, to)
                : repository.findAllByDeletedFalseOrderByScheduledAtAsc();
        return interviews.stream()
                .filter(item -> status == null || item.getStatus() == status)
                .filter(item -> postingId == null || item.getJobPostingId().equals(postingId))
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public InterviewDtos.Response create(Long postingId, InterviewDtos.SaveRequest request) {
        JobPosting posting = postingService.getEntityForUpdate(postingId);
        return createForPosting(posting, request);
    }

    @Transactional
    public InterviewDtos.Response scheduleNext(Long postingId, InterviewDtos.ScheduleRequest request) {
        JobPosting posting = postingService.getEntityForUpdate(postingId);
        if (posting.getStage() != request.expectedStage()) {
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "岗位进度已变化，请刷新后重试");
        }
        if (posting.getStage() == PostingEnums.Stage.OFFER) {
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "该岗位已收到Offer，请记录Offer结果");
        }
        List<Interview> previous = repository.findAllByJobPostingIdAndDeletedFalseOrderByScheduledAtAsc(postingId);
        if (previous.stream().anyMatch(i -> i.getStatus() == InterviewEnums.Status.SCHEDULED)) {
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "已有待进行的面试，请在时间表点击面试节点改期或补充结果");
        }
        int round = previous.stream().mapToInt(Interview::getRoundNo).max().orElse(0) + 1;
        return createForPosting(posting, new InterviewDtos.SaveRequest(round, request.type(), request.format(),
                request.scheduledAt(), InterviewEnums.Status.SCHEDULED, null, null, null, request.note()));
    }

    private InterviewDtos.Response createForPosting(JobPosting posting, InterviewDtos.SaveRequest request) {
        if (posting.getAppliedAt() == null || !INTERVIEWABLE_STAGES.contains(posting.getStage())) {
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "请先在JD列表记录实际投递，再安排面试");
        }
        Interview interview = new Interview();
        interview.setJobPostingId(posting.getId());
        apply(interview, request);
        interview = repository.save(interview);
        synchronizePostingForScheduledInterview(posting, interview);
        return toResponse(interview);
    }

    @Transactional
    public InterviewDtos.Response update(Long id, InterviewDtos.SaveRequest request) {
        Interview interview = getEntity(id);
        JobPosting posting = postingService.getEntityForUpdate(interview.getJobPostingId());
        LocalDateTime previousAt = interview.getScheduledAt();
        boolean ownsNextAction = ("参加第 " + interview.getRoundNo() + " 轮面试").equals(posting.getNextAction())
                && previousAt.equals(posting.getNextActionAt());
        apply(interview, request);
        interview = repository.save(interview);
        // 修改已结束流程的历史面试不能重新激活岗位；旧轮次编辑不能覆盖新一轮安排。
        if (INTERVIEWABLE_STAGES.contains(posting.getStage())) {
            boolean hasOtherPending = repository.findAllByJobPostingIdAndDeletedFalseOrderByScheduledAtAsc(posting.getId())
                    .stream().anyMatch(i -> !i.getId().equals(id) && i.getStatus() == InterviewEnums.Status.SCHEDULED);
            if (interview.getStatus() == InterviewEnums.Status.SCHEDULED && hasOtherPending) {
                throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "已有其他待进行的面试，请先更新该轮结果");
            }
            if (interview.getStatus() == InterviewEnums.Status.SCHEDULED && posting.getStage() != PostingEnums.Stage.OFFER) {
                synchronizePostingForScheduledInterview(posting, interview);
            } else if (ownsNextAction) {
                posting.setNextAction(null);
                posting.setNextActionAt(null);
                postingRepository.save(posting);
            }
        }
        return toResponse(interview);
    }

    public Interview getEntity(Long id) {
        return repository.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, "面试记录不存在"));
    }

    public InterviewDtos.Response toResponse(Interview interview) {
        JobPosting posting = postingService.getEntity(interview.getJobPostingId());
        String companyName = companyService.getEntity(posting.getCompanyId()).getName();
        return new InterviewDtos.Response(
                interview.getId(), interview.getJobPostingId(), posting.getTitle(), companyName,
                interview.getRoundNo(), interview.getType(), interview.getFormat(), interview.getScheduledAt(),
                interview.getStatus(), interview.getInterviewer(), interview.getQuestions(), interview.getFeedback(),
                interview.getNextStep(), interview.getCreatedAt(), interview.getUpdatedAt()
        );
    }

    private void synchronizePostingForScheduledInterview(JobPosting posting, Interview interview) {
        PostingEnums.Stage target = interview.getType() == InterviewEnums.Type.HR
                ? PostingEnums.Stage.HR_SCREEN : PostingEnums.Stage.INTERVIEW;
        if (posting.getStage() != target) {
            StageEvent event = new StageEvent();
            event.setJobPostingId(posting.getId());
            event.setFromStage(posting.getStage());
            event.setToStage(target);
            event.setOccurredAt(LocalDateTime.now());
            event.setNote("创建第 " + interview.getRoundNo() + " 轮面试日程");
            eventRepository.save(event);
            posting.setStage(target);
        }
        posting.setNextAction("参加第 " + interview.getRoundNo() + " 轮面试");
        posting.setNextActionAt(interview.getScheduledAt());
        postingRepository.save(posting);
    }

    private void apply(Interview interview, InterviewDtos.SaveRequest request) {
        interview.setRoundNo(request.roundNo());
        interview.setType(request.type());
        interview.setFormat(request.format());
        interview.setScheduledAt(request.scheduledAt());
        interview.setStatus(request.status());
        interview.setInterviewer(trimToNull(request.interviewer()));
        interview.setQuestions(trimToNull(request.questions()));
        interview.setFeedback(trimToNull(request.feedback()));
        interview.setNextStep(trimToNull(request.nextStep()));
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
