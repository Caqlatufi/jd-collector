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
        JobPosting posting = postingService.getEntity(postingId);
        PostingEnums.Stage fromStage = posting.getStage();
        PostingEnums.Stage toStage = request.toStage();

        if (posting.getTier() == PostingEnums.Tier.SKIP
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

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
