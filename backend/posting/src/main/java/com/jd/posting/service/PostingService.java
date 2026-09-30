package com.jd.posting.service;

import com.jd.common.exception.BusinessException;
import com.jd.common.exception.ErrorCode;
import com.jd.company.model.Company;
import com.jd.company.service.CompanyService;
import com.jd.posting.model.JobPosting;
import com.jd.posting.model.PostingDtos;
import com.jd.posting.model.PostingEnums;
import com.jd.posting.repo.JobPostingRepository;
import com.jd.resume.model.ResumeVersion;
import com.jd.resume.repo.ResumeVersionRepository;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

@RequiredArgsConstructor
public class PostingService {

    // 同分按ID倒序，避免修改备注改变排序，也保证分页顺序稳定。
    private static final Sort SCORE_ORDER = Sort.by(Sort.Direction.DESC, "totalScore", "id");

    private final JobPostingRepository repository;
    private final CompanyService companyService;
    private final ResumeVersionRepository resumeVersionRepository;

    @Transactional(readOnly = true)
    public Page<PostingDtos.Response> search(
            String keyword,
            Collection<PostingEnums.Direction> directions,
            Collection<PostingEnums.Tier> tiers,
            Collection<PostingEnums.Stage> stages,
            Long companyId,
            Long resumeVersionId,
            int number,
            int size
    ) {
        PageRequest pageable = PageRequest.of(Math.max(0, number - 1), Math.min(Math.max(size, 1), 100),
                SCORE_ORDER);
        return repository.findAll(specification(keyword, directions, tiers, stages, companyId, resumeVersionId), pageable)
                .map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public List<PostingDtos.Response> exportRows(
            String keyword,
            Collection<PostingEnums.Direction> directions,
            Collection<PostingEnums.Tier> tiers,
            Collection<PostingEnums.Stage> stages,
            Long companyId
    ) {
        return repository.findAll(specification(keyword, directions, tiers, stages, companyId, null),
                        SCORE_ORDER)
                .stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public PostingDtos.Response get(Long id) {
        return toResponse(getEntity(id));
    }

    @Transactional
    public PostingDtos.Response create(PostingDtos.SaveRequest request) {
        if (!findSource(request.sourceUrl()).isEmpty()) {
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "该来源链接已有JD，请核对已有记录，不要重复收集。");
        }
        JobPosting posting = new JobPosting();
        apply(posting, request);
        posting.setStage(PostingEnums.Stage.SCREENED);
        posting = repository.save(posting);
        return toResponse(posting);
    }

    @Transactional(readOnly = true)
    public List<PostingDtos.Response> findSource(String url) {
        if (url == null || url.isBlank()) return List.of();
        return repository.findAll((root, query, builder) -> builder.and(
                builder.isFalse(root.get("deleted")), builder.equal(root.get("sourceUrl"), url.trim())))
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public PostingDtos.Response update(Long id, PostingDtos.SaveRequest request) {
        JobPosting posting = getEntity(id);
        apply(posting, request);
        return toResponse(repository.save(posting));
    }

    public JobPosting getEntity(Long id) {
        return repository.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, "岗位不存在"));
    }

    public PostingDtos.Response toResponse(JobPosting posting) {
        Company company = companyService.getEntity(posting.getCompanyId());
        String resumeName = null;
        if (posting.getResumeVersionId() != null) {
            resumeName = resumeVersionRepository.findByIdAndDeletedFalse(posting.getResumeVersionId())
                    .map(ResumeVersion::getName)
                    .orElse("已停用/缺失版本");
        }
        return new PostingDtos.Response(
                posting.getId(), posting.getCompanyId(), company.getName(), posting.getTitle(), posting.getDirection(),
                posting.getSource(), posting.getSourceUrl(), posting.getRawJd(), posting.getLocation(),
                posting.getSalaryMinK(), posting.getSalaryMaxK(), posting.getSalaryMonths(),
                posting.getExperienceMin(), posting.getExperienceMax(), posting.getPublishedAt(),
                posting.getRecruiterActiveAt(), posting.getOfficialSynchronized(), posting.getRequiredSkills(),
                posting.getBonusSkills(), posting.getMatchPoints(), posting.getSkillGaps(), posting.getRiskNotes(),
                posting.getBlockingRisk(), posting.getMatchScore(), posting.getCompanyScore(),
                posting.getFreshnessScore(), posting.getCommuteScore(), posting.getSalaryScore(),
                posting.getTotalScore(), posting.getTier(), posting.getRecommendation(),
                posting.getManualOverrideReason(), posting.getStage(), posting.getResumeVersionId(), resumeName,
                posting.getAppliedAt(), posting.getNextAction(), posting.getNextActionAt(),
                posting.getCreatedAt(), posting.getUpdatedAt()
        );
    }

    private void apply(JobPosting posting, PostingDtos.SaveRequest request) {
        companyService.getEntity(request.companyId());
        validateRanges(request);

        posting.setCompanyId(request.companyId());
        posting.setTitle(request.title().trim());
        posting.setDirection(request.direction());
        posting.setSource(request.source());
        posting.setSourceUrl(trimToNull(request.sourceUrl()));
        posting.setRawJd(request.rawJd().trim());
        posting.setLocation(trimToNull(request.location()));
        posting.setSalaryMinK(request.salaryMinK());
        posting.setSalaryMaxK(request.salaryMaxK());
        posting.setSalaryMonths(request.salaryMonths());
        posting.setExperienceMin(request.experienceMin());
        posting.setExperienceMax(request.experienceMax());
        posting.setPublishedAt(request.publishedAt());
        posting.setRecruiterActiveAt(request.recruiterActiveAt());
        posting.setOfficialSynchronized(request.officialSynchronized());
        posting.setRequiredSkills(trimToNull(request.requiredSkills()));
        posting.setBonusSkills(trimToNull(request.bonusSkills()));
        posting.setMatchPoints(trimToNull(request.matchPoints()));
        posting.setSkillGaps(trimToNull(request.skillGaps()));
        posting.setRiskNotes(trimToNull(request.riskNotes()));
        posting.setBlockingRisk(Boolean.TRUE.equals(request.blockingRisk()));
        posting.setMatchScore(request.matchScore());
        posting.setCompanyScore(request.companyScore());
        posting.setFreshnessScore(request.freshnessScore());
        posting.setCommuteScore(request.commuteScore());
        posting.setSalaryScore(request.salaryScore());

        int total = request.matchScore() + request.companyScore() + request.freshnessScore()
                + request.commuteScore() + request.salaryScore();
        PostingEnums.Tier defaultTier = defaultTier(total, posting.getBlockingRisk());
        PostingEnums.Recommendation defaultRecommendation = defaultRecommendation(defaultTier);
        boolean overridden = (request.tier() != null && request.tier() != defaultTier)
                || (request.recommendation() != null && request.recommendation() != defaultRecommendation);
        if (overridden && (request.manualOverrideReason() == null || request.manualOverrideReason().isBlank())) {
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "人工覆盖等级或建议动作时必须填写原因");
        }

        posting.setTotalScore(total);
        posting.setTier(Boolean.TRUE.equals(posting.getBlockingRisk()) ? PostingEnums.Tier.SKIP
                : request.tier() == null ? defaultTier : request.tier());
        posting.setRecommendation(Boolean.TRUE.equals(posting.getBlockingRisk()) ? PostingEnums.Recommendation.SKIP
                : request.recommendation() == null ? defaultRecommendation : request.recommendation());
        posting.setManualOverrideReason(overridden ? request.manualOverrideReason().trim() : null);
    }

    private void validateRanges(PostingDtos.SaveRequest request) {
        if (request.salaryMinK() != null && request.salaryMaxK() != null
                && request.salaryMinK() > request.salaryMaxK()) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, "薪资下限不能高于上限");
        }
        if (request.experienceMin() != null && request.experienceMax() != null
                && request.experienceMin() > request.experienceMax()) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, "最低经验年限不能高于最高经验年限");
        }
    }

    private PostingEnums.Tier defaultTier(int total, boolean blockingRisk) {
        if (blockingRisk || total < 50) {
            return PostingEnums.Tier.SKIP;
        }
        if (total >= 80) {
            return PostingEnums.Tier.S;
        }
        if (total >= 65) {
            return PostingEnums.Tier.A;
        }
        return PostingEnums.Tier.B;
    }

    private PostingEnums.Recommendation defaultRecommendation(PostingEnums.Tier tier) {
        return tier == PostingEnums.Tier.SKIP ? PostingEnums.Recommendation.SKIP
                : PostingEnums.Recommendation.DIRECT_APPLY;
    }

    private Specification<JobPosting> specification(
            String keyword,
            Collection<PostingEnums.Direction> directions,
            Collection<PostingEnums.Tier> tiers,
            Collection<PostingEnums.Stage> stages,
            Long companyId,
            Long resumeVersionId
    ) {
        return (root, query, builder) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(builder.isFalse(root.get("deleted")));
            if (keyword != null && !keyword.isBlank()) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(builder.or(
                        builder.like(builder.lower(root.get("title")), pattern),
                        builder.like(builder.lower(root.get("rawJd")), pattern)
                ));
            }
            if (directions != null && !directions.isEmpty()) {
                predicates.add(root.get("direction").in(directions));
            }
            if (tiers != null && !tiers.isEmpty()) {
                predicates.add(root.get("tier").in(tiers));
            }
            if (stages != null && !stages.isEmpty()) {
                predicates.add(root.get("stage").in(stages));
            }
            if (companyId != null) {
                predicates.add(builder.equal(root.get("companyId"), companyId));
            }
            if (resumeVersionId != null) {
                predicates.add(builder.equal(root.get("resumeVersionId"), resumeVersionId));
            }
            return builder.and(predicates.toArray(Predicate[]::new));
        };
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
