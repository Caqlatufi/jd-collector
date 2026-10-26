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
import java.util.Locale;
import java.net.URI;
import java.net.URISyntaxException;

@RequiredArgsConstructor
public class PostingService {

    // 同分按ID倒序，避免修改备注改变排序，也保证分页顺序稳定。
    private static final Sort SCORE_ORDER = Sort.by(Sort.Direction.DESC, "totalScore", "id");

    private final JobPostingRepository repository;
    private final CompanyService companyService;
    private final ResumeVersionRepository resumeVersionRepository;
    private final PostingDirectionService directionService;
    private final com.jd.company.service.CompanyAddressDiscoveryService addressDiscoveries;

    @Transactional
    public com.jd.company.model.CompanyAddressDtos.Response saveDiscoveredAddress(Long id,
            com.jd.company.model.CompanyAddressDtos.SaveRequest request) {
        var posting = repository.findByIdForUpdate(id).orElseThrow(() ->
                new BusinessException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, "JD不存在"));
        if (!java.util.Objects.equals(posting.getSourceUrl(), request.expectedPostingUrl())
                || !java.util.Objects.equals(request.sourceUrl(), request.expectedPostingUrl()))
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "JD链接已变化，请重新核对岗位地址");
        if (!java.util.Objects.equals(posting.getLocation(), request.expectedLocation())
                && !java.util.Objects.equals(posting.getLocation(), request.address()))
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "JD地址已被修改，请重新核对");
        var result = addressDiscoveries.record(posting.getCompanyId(), posting.getId(), request);
        posting.setLocation(result.address());
        repository.save(posting);
        return result;
    }

    @Transactional(readOnly = true)
    public Page<PostingDtos.Response> search(
            String keyword,
            Collection<String> directions,
            Collection<PostingEnums.Tier> tiers,
            Collection<PostingEnums.Stage> stages,
            Long companyId,
            Long resumeVersionId,
            PostingEnums.SortBy sortBy,
            int number,
            int size
    ) {
        PageRequest pageable = PageRequest.of(Math.max(0, number - 1), Math.min(Math.max(size, 1), 100),
                sortBy == PostingEnums.SortBy.BOSS_COMPETITION ? Sort.unsorted() : SCORE_ORDER);
        return repository.findAll(orderedSpecification(
                        specification(keyword, directions, tiers, stages, companyId, resumeVersionId), sortBy), pageable)
                .map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public List<PostingDtos.Response> exportRows(
            String keyword,
            Collection<String> directions,
            Collection<PostingEnums.Tier> tiers,
            Collection<PostingEnums.Stage> stages,
            Long companyId,
            PostingEnums.SortBy sortBy
    ) {
        return repository.findAll(orderedSpecification(
                        specification(keyword, directions, tiers, stages, companyId, null), sortBy),
                        sortBy == PostingEnums.SortBy.BOSS_COMPETITION ? Sort.unsorted() : SCORE_ORDER)
                .stream().map(this::toResponse).toList();
    }

    private Specification<JobPosting> orderedSpecification(
            Specification<JobPosting> filters, PostingEnums.SortBy sortBy
    ) {
        if (sortBy != PostingEnums.SortBy.BOSS_COMPETITION) return filters;
        return (root, query, builder) -> {
            Predicate predicate = filters.toPredicate(root, query, builder);
            // 排序发生在分页之前；计数查询不需要 ORDER BY。
            if (query.getResultType() != Long.class && query.getResultType() != long.class) {
                Predicate available = builder.and(
                        builder.equal(root.get("bossCompetitionStatus"), PostingEnums.BossCompetitionStatus.AVAILABLE),
                        builder.isNotNull(root.get("bossSurpassedPercent")),
                        builder.greaterThan(root.<Integer>get("bossRank"), 0),
                        builder.greaterThan(root.<Integer>get("bossCompetitorCount"), 0));
                var percentage = builder.<Double>selectCase()
                        .when(available, builder.toDouble(root.get("bossSurpassedPercent"))).otherwise(-1.0);
                var rank = builder.<Double>selectCase()
                        .when(available, builder.toDouble(root.get("bossRank"))).otherwise(1.0);
                var count = builder.<Double>selectCase()
                        .when(available, builder.toDouble(root.get("bossCompetitorCount"))).otherwise(1.0);
                query.orderBy(builder.desc(percentage), builder.asc(builder.quot(rank, count)),
                        builder.desc(root.get("totalScore")), builder.desc(root.get("id")));
            }
            return predicate;
        };
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
        JobPosting posting = getEntityForUpdate(id);
        apply(posting, request);
        return toResponse(repository.save(posting));
    }

    @Transactional
    public void archive(Long id) {
        JobPosting posting = getEntityForUpdate(id);
        posting.setDeleted(true);
        repository.save(posting);
    }

    @Transactional
    public PostingDtos.Response updateSourceUrl(Long id, PostingDtos.SourceUrlRequest request) {
        String url = request.sourceUrl().trim();
        try {
            URI parsed = new URI(url);
            if (!"https".equalsIgnoreCase(parsed.getScheme()) || parsed.getHost() == null || parsed.getUserInfo() != null) {
                throw new URISyntaxException(url, "Invalid JD URL");
            }
        } catch (URISyntaxException exception) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, "请填写完整的 HTTPS 岗位链接");
        }
        JobPosting posting = getEntityForUpdate(id);
        String previous = posting.getSourceUrl() == null ? "" : posting.getSourceUrl().trim();
        if (!previous.equals(request.expectedSourceUrl().trim())) {
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "岗位链接已更新，请刷新后重试");
        }
        if (findSource(url).stream().anyMatch(existing -> !existing.id().equals(id))) {
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "该链接已用于其他 JD，请核对岗位");
        }
        if (!url.equals(previous)) clearBossCompetition(posting);
        posting.setSourceUrl(url);
        return toResponse(repository.save(posting));
    }

    @Transactional
    public PostingDtos.Response updateBossCompetition(Long id, PostingDtos.BossCompetitionRequest request) {
        JobPosting posting = getEntityForUpdate(id);
        String sourceUrl = posting.getSourceUrl() == null ? "" : posting.getSourceUrl().trim();
        if (!sourceUrl.equals(request.expectedSourceUrl().trim())) {
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "岗位链接已更新，请重新打开岗位采集竞争力");
        }
        if (!isBossJobUrl(sourceUrl)) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, "竞争力报告仅适用于 BOSS 岗位直链");
        }
        boolean available = request.status() == PostingEnums.BossCompetitionStatus.AVAILABLE;
        if (available && (request.rank() == null || request.competitorCount() == null
                || request.surpassedPercent() == null || request.rank() > request.competitorCount())) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, "请填写完整竞争力数据，排名不能超过总人数");
        }
        if (!available && (request.rank() != null || request.competitorCount() != null
                || request.surpassedPercent() != null || trimToNull(request.note()) == null)) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, "无报告或已关闭时请仅记录原因，不填写竞争力数值");
        }
        posting.setBossRank(request.rank());
        posting.setBossCompetitorCount(request.competitorCount());
        posting.setBossSurpassedPercent(request.surpassedPercent());
        posting.setBossCompetitionCheckedAt(request.checkedAt());
        posting.setBossCompetitionStatus(request.status());
        posting.setBossCompetitionNote(trimToNull(request.note()));
        posting.setBossCompetitionEvidencePath(request.evidencePath().trim());
        return toResponse(repository.save(posting));
    }

    private boolean isBossJobUrl(String url) {
        try {
            URI parsed = new URI(url);
            String host = parsed.getHost();
            return "https".equalsIgnoreCase(parsed.getScheme()) && parsed.getUserInfo() == null
                    && parsed.getPort() == -1 && ("www.zhipin.com".equalsIgnoreCase(host) || "zhipin.com".equalsIgnoreCase(host))
                    && parsed.getPath() != null && parsed.getPath().matches("/job_detail/[^/]+\\.html");
        } catch (URISyntaxException exception) {
            return false;
        }
    }

    private void clearBossCompetition(JobPosting posting) {
        posting.setBossRank(null);
        posting.setBossCompetitorCount(null);
        posting.setBossSurpassedPercent(null);
        posting.setBossCompetitionCheckedAt(null);
        posting.setBossCompetitionStatus(null);
        posting.setBossCompetitionNote(null);
        posting.setBossCompetitionEvidencePath(null);
    }

    @Transactional
    public PostingDtos.Response updateCommute(Long id, PostingDtos.CommuteRequest request) {
        if (request.minMinutes() > request.maxMinutes()) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, "时间下限不能大于上限");
        }
        JobPosting posting = getEntityForUpdate(id);
        String previous = posting.getRiskNotes() == null ? "" : posting.getRiskNotes();
        if (!previous.equals(request.expectedRiskNotes())) {
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "通勤或风险备注已更新，请刷新后重新填写");
        }
        String note = trimToNull(request.note());
        String range = request.minMinutes().equals(request.maxMinutes()) ? request.minMinutes().toString()
                : request.minMinutes() + "–" + request.maxMinutes();
        int score = commuteScore(request.maxMinutes());
        String supplement = "【通勤估算】" + range + " 分钟（手动填写）\n【通勤备注】"
                + (note == null ? "" : note)
                + "\n【通勤评分】" + score + "/15（按时间上限" + request.maxMinutes() + "分钟计算）";
        posting.setRiskNotes(supplement + (previous.isEmpty() ? "" : "\n\n" + previous));
        recalculateCommuteScore(posting, score);
        return toResponse(repository.save(posting));
    }

    // 手动提交的范围按上限计分，避免跨越一小时的范围按较短端计为合格。
    private int commuteScore(int maxMinutes) {
        if (maxMinutes <= 30) return 15;
        if (maxMinutes <= 45) return 12;
        if (maxMinutes <= 60) return 10;
        return 0;
    }

    private void recalculateCommuteScore(JobPosting posting, int score) {
        boolean blocking = Boolean.TRUE.equals(posting.getBlockingRisk());
        PostingEnums.Tier previousDefault = defaultTier(posting.getTotalScore(), blocking);
        boolean hasOverride = trimToNull(posting.getManualOverrideReason()) != null;
        boolean tierOverridden = hasOverride && posting.getTier() != previousDefault;
        boolean recommendationOverridden = hasOverride
                && posting.getRecommendation() != defaultRecommendation(previousDefault);

        int total = posting.getMatchScore() + posting.getCompanyScore() + posting.getFreshnessScore()
                + score + posting.getSalaryScore();
        PostingEnums.Tier nextDefault = defaultTier(total, blocking);
        posting.setCommuteScore(score);
        posting.setTotalScore(total);
        if (blocking || !tierOverridden) posting.setTier(nextDefault);
        if (blocking || !recommendationOverridden) {
            posting.setRecommendation(defaultRecommendation(nextDefault));
        }
        if (posting.getTier() == nextDefault
                && posting.getRecommendation() == defaultRecommendation(nextDefault)) {
            posting.setManualOverrideReason(null);
        }
    }

    public JobPosting getEntity(Long id) {
        return repository.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, "岗位不存在"));
    }

    // Call only within a write transaction, shared by editing and stage transitions.
    public JobPosting getEntityForUpdate(Long id) {
        return repository.findByIdForUpdate(id)
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
                posting.getSource(), posting.getSourceUrl(), posting.getBossRank(), posting.getBossCompetitorCount(),
                posting.getBossSurpassedPercent(), posting.getBossCompetitionCheckedAt(),
                posting.getBossCompetitionStatus(), posting.getBossCompetitionNote(), posting.getRawJd(), posting.getLocation(),
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
        posting.setDirection(directionService.resolve(request.direction(), request.newDirection()));
        posting.setSource(request.source());
        String sourceUrl = trimToNull(request.sourceUrl());
        if (!java.util.Objects.equals(posting.getSourceUrl(), sourceUrl)) clearBossCompetition(posting);
        posting.setSourceUrl(sourceUrl);
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
            Collection<String> directions,
            Collection<PostingEnums.Tier> tiers,
            Collection<PostingEnums.Stage> stages,
            Long companyId,
            Long resumeVersionId
    ) {
        return (root, query, builder) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(builder.isFalse(root.get("deleted")));
            if (keyword != null && !keyword.isBlank()) {
                String pattern = "%" + keyword.trim().toLowerCase(Locale.ROOT) + "%";
                var companies = query.subquery(Long.class);
                var company = companies.from(Company.class);
                companies.select(company.get("id")).where(
                        builder.isFalse(company.get("deleted")),
                        builder.like(builder.lower(company.get("name")), pattern));
                predicates.add(builder.or(
                        builder.like(builder.lower(root.get("title")), pattern),
                        builder.like(builder.lower(root.get("rawJd")), pattern),
                        root.get("companyId").in(companies)
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
