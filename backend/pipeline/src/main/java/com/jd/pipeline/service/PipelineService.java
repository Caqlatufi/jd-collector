package com.jd.pipeline.service;

import com.jd.common.exception.BusinessException;
import com.jd.common.exception.ErrorCode;
import com.jd.pipeline.event.model.StageEvent;
import com.jd.pipeline.event.repo.StageEventRepository;
import com.jd.pipeline.model.PipelineDtos;
import com.jd.posting.model.JobPosting;
import com.jd.posting.model.PostingDtos;
import com.jd.posting.model.PostingEnums;
import com.jd.posting.repo.JobPostingRepository;
import com.jd.posting.service.PostingService;
import com.jd.resume.model.ResumeVersion;
import com.jd.resume.service.ResumeVersionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

@RequiredArgsConstructor
public class PipelineService {

    private static final Set<PostingEnums.Stage> PRE_APPLICATION_STAGES = EnumSet.of(
            PostingEnums.Stage.COLLECTED, PostingEnums.Stage.SCREENED, PostingEnums.Stage.TO_CONTACT,
            PostingEnums.Stage.MESSAGE_SENT, PostingEnums.Stage.WAITING_COMMUNICATION,
            PostingEnums.Stage.CONTACT_NOT_SUITABLE, PostingEnums.Stage.READY_TO_APPLY
    );

    private static final Set<PostingEnums.Stage> TERMINAL_STAGES = EnumSet.of(
            PostingEnums.Stage.ACCEPTED,
            PostingEnums.Stage.REJECTED,
            PostingEnums.Stage.WITHDRAWN,
            PostingEnums.Stage.CLOSED
    );

    private static final Set<PostingEnums.Stage> APPLICATION_STAGES = EnumSet.of(
            PostingEnums.Stage.APPLIED,
            PostingEnums.Stage.HR_SCREEN,
            PostingEnums.Stage.WRITTEN_TEST,
            PostingEnums.Stage.INTERVIEW,
            PostingEnums.Stage.OFFER,
            PostingEnums.Stage.ACCEPTED,
            PostingEnums.Stage.REJECTED,
            PostingEnums.Stage.WITHDRAWN
    );

    private final PostingService postingService;
    private final JobPostingRepository postingRepository;
    private final StageEventRepository eventRepository;
    private final ResumeVersionService resumeVersionService;

    @Transactional
    public PostingDtos.Response changeStage(Long postingId, PipelineDtos.StageChangeRequest request) {
        JobPosting posting = postingService.getEntityForUpdate(postingId);
        if (PRE_APPLICATION_STAGES.contains(request.toStage()) && hasApplied(posting)) {
            throw appliedConflict();
        }
        return applyStageChange(posting, request);
    }

    @Transactional
    public PostingDtos.Response recordResult(Long postingId, PipelineDtos.ResultRequest request) {
        JobPosting posting = postingService.getEntityForUpdate(postingId);
        if (posting.getStage() != request.expectedStage()) {
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "岗位进度已变化，请刷新后重试");
        }
        boolean screening = EnumSet.of(PostingEnums.Stage.APPLIED, PostingEnums.Stage.HR_SCREEN,
                PostingEnums.Stage.WRITTEN_TEST).contains(posting.getStage());
        boolean allowed = request.result() == PostingEnums.Stage.REJECTED
                && (screening || posting.getStage() == PostingEnums.Stage.INTERVIEW)
                || request.result() == PostingEnums.Stage.OFFER && posting.getStage() == PostingEnums.Stage.INTERVIEW
                || EnumSet.of(PostingEnums.Stage.ACCEPTED, PostingEnums.Stage.WITHDRAWN).contains(request.result())
                && posting.getStage() == PostingEnums.Stage.OFFER;
        if (posting.getAppliedAt() == null || !allowed) {
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "当前阶段不能记录此反馈，请刷新后核对岗位进度");
        }
        String label = request.result() == PostingEnums.Stage.REJECTED ? screening ? "初筛不通过" : "面试未通过"
                : request.result() == PostingEnums.Stage.OFFER ? "收到Offer"
                : request.result() == PostingEnums.Stage.ACCEPTED ? "接受Offer" : "放弃Offer";
        String note = label + (request.note() == null || request.note().isBlank() ? "" : "：" + request.note().trim());
        if (note.length() > 1000) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, "反馈备注过长，请缩短后重试");
        }
        return applyStageChange(posting, new PipelineDtos.StageChangeRequest(request.result(), null, null, null,
                null, null, note));
    }

    @Transactional
    public PostingDtos.Response changeContactStage(Long postingId, PipelineDtos.ContactStageRequest request) {
        if (!PRE_APPLICATION_STAGES.contains(request.toStage()) && request.toStage() != PostingEnums.Stage.CLOSED) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, "这里只能修改投递前的沟通阶段");
        }
        JobPosting posting = postingService.getEntityForUpdate(postingId);
        if (hasApplied(posting)) throw appliedConflict();
        if (posting.getStage() != request.expectedStage()) {
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "岗位进度已变化，请刷新后重试");
        }
        if (posting.getStage() == request.toStage()) return postingService.toResponse(posting);
        // Preserve existing facts and follow-up data; changing contact progress never records an application.
        return applyStageChange(posting, new PipelineDtos.StageChangeRequest(request.toStage(), null, null, null,
                posting.getNextAction(), posting.getNextActionAt(), "投递前沟通进度调整"));
    }

    private boolean hasApplied(JobPosting posting) {
        return posting.getAppliedAt() != null || APPLICATION_STAGES.contains(posting.getStage());
    }

    private BusinessException appliedConflict() {
        return new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "该岗位已投递，沟通阶段只读，请在 Pipeline 中跟进");
    }

    private PostingDtos.Response applyStageChange(JobPosting posting, PipelineDtos.StageChangeRequest request) {
        Long postingId = posting.getId();
        PostingEnums.Stage fromStage = posting.getStage();
        PostingEnums.Stage toStage = request.toStage();

        if (posting.getTier() == PostingEnums.Tier.SKIP && posting.getAppliedAt() == null
                && (toStage == PostingEnums.Stage.TO_CONTACT || toStage == PostingEnums.Stage.READY_TO_APPLY
                || APPLICATION_STAGES.contains(toStage))) {
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "跳过岗位不能进入投递流程");
        }

        Long resumeId = request.resumeVersionId() == null ? posting.getResumeVersionId() : request.resumeVersionId();
        LocalDateTime appliedAt = request.appliedAt() == null ? posting.getAppliedAt() : request.appliedAt();
        if (APPLICATION_STAGES.contains(toStage)) {
            if (resumeId == null) {
                throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "进入已投递及后续阶段前必须选择简历版本");
            }
            ResumeVersion resume = resumeVersionService.getEntity(resumeId);
            if ((!Boolean.TRUE.equals(resume.getActive()) || Boolean.TRUE.equals(resume.getArchived()))
                    && !resumeId.equals(posting.getResumeVersionId())) {
                throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "停用或归档的简历版本不能用于新投递");
            }
            if (appliedAt == null) {
                throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "首次投递时间不能为空");
            }
        }

        boolean hasNextAction = request.nextAction() != null && !request.nextAction().isBlank();
        boolean hasNextActionAt = request.nextActionAt() != null;
        if (!TERMINAL_STAGES.contains(toStage) && hasNextAction != hasNextActionAt) {
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "下一步动作和时间必须一起填写，暂无待办时可以都留空");
        }

        posting.setStage(toStage);
        posting.setResumeVersionId(resumeId);
        posting.setAppliedAt(appliedAt);
        posting.setNextAction(TERMINAL_STAGES.contains(toStage) ? null : trimToNull(request.nextAction()));
        posting.setNextActionAt(TERMINAL_STAGES.contains(toStage) ? null : request.nextActionAt());
        postingRepository.save(posting);

        StageEvent event = new StageEvent();
        event.setJobPostingId(postingId);
        event.setFromStage(fromStage);
        event.setToStage(toStage);
        event.setOccurredAt(request.occurredAt() == null ? LocalDateTime.now() : request.occurredAt());
        event.setNote(trimToNull(request.note()));
        eventRepository.save(event);
        return postingService.toResponse(posting);
    }

    @Transactional(readOnly = true)
    public List<PipelineDtos.EventResponse> events(Long postingId) {
        postingService.getEntity(postingId);
        return eventRepository.findAllByJobPostingIdAndDeletedFalseOrderByOccurredAtDesc(postingId).stream()
                .map(event -> new PipelineDtos.EventResponse(
                        event.getId(), event.getFromStage(), event.getToStage(), event.getOccurredAt(), event.getNote()
                ))
                .toList();
    }

    @Transactional
    public PostingDtos.Response updateApplicationDate(Long postingId, PipelineDtos.ApplicationDateRequest request) {
        JobPosting posting = postingService.getEntityForUpdate(postingId);
        if (posting.getAppliedAt() == null || !posting.getAppliedAt().equals(request.expectedAppliedAt())) {
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "投递记录已变化，请刷新后重试");
        }
        LocalDateTime firstProgress = eventRepository.findAllByJobPostingIdAndDeletedFalseOrderByOccurredAtDesc(postingId)
                .stream().filter(e -> e.getToStage() != e.getFromStage()
                        && e.getToStage() != PostingEnums.Stage.APPLIED
                        && (APPLICATION_STAGES.contains(e.getToStage()) || TERMINAL_STAGES.contains(e.getToStage())))
                .map(StageEvent::getOccurredAt).min(LocalDateTime::compareTo).orElse(null);
        if (request.appliedAt().isAfter(LocalDateTime.now())
                || firstProgress != null && request.appliedAt().isAfter(firstProgress)) {
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "投递时间不能晚于当前时间或后续进度");
        }
        posting.setAppliedAt(request.appliedAt());
        postingRepository.save(posting);
        return postingService.toResponse(posting);
    }

    @Transactional
    public List<PipelineDtos.EventResponse> updateEvent(Long postingId, Long eventId, PipelineDtos.EventUpdateRequest request) {
        JobPosting posting = postingService.getEntityForUpdate(postingId);
        StageEvent event = eventRepository.findById(eventId)
                .filter(e -> !Boolean.TRUE.equals(e.getDeleted()) && e.getJobPostingId().equals(postingId))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, "进度记录不存在"));
        if (!event.getOccurredAt().equals(request.expectedOccurredAt())) {
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "进度记录已变化，请刷新后重试");
        }
        if (posting.getAppliedAt() == null || request.occurredAt().isBefore(posting.getAppliedAt())
                || request.occurredAt().isAfter(LocalDateTime.now())) {
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "进度时间应在投递之后且不晚于现在");
        }
        event.setOccurredAt(request.occurredAt());
        event.setNote(trimToNull(request.note()));
        eventRepository.save(event);
        return events(postingId);
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
