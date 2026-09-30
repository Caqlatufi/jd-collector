package com.jd.resume.service;

import com.jd.common.exception.BusinessException;
import com.jd.common.exception.ErrorCode;
import com.jd.resume.model.ResumeDtos;
import com.jd.resume.model.ResumeType;
import com.jd.resume.model.ResumeVersion;
import com.jd.resume.repo.ResumeVersionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.regex.Pattern;

@RequiredArgsConstructor
public class ResumeVersionService {

    private static final Pattern H1 = Pattern.compile("(?m)^#\\s+\\S.+$");
    private static final Pattern H2 = Pattern.compile("(?m)^##\\s+\\S.+$");
    private static final String DEFAULT_TEMPLATE = "CLASSIC_BLUE";
    private static final String INTERNAL_MARKDOWN_PATH = "internal://markdown";

    private final ResumeVersionRepository repository;
    private final ResumeBlockService blockService;

    @Transactional(readOnly = true)
    public List<ResumeDtos.SummaryResponse> list(Boolean active, ResumeType type) {
        return repository.findAllByDeletedFalseOrderByUpdatedAtDesc().stream()
                .filter(item -> !Boolean.TRUE.equals(item.getArchived()))
                .filter(item -> active == null || active.equals(item.getActive()))
                .filter(item -> type == null || type == item.getType())
                .map(this::toSummary)
                .toList();
    }

    @Transactional(readOnly = true)
    public ResumeDtos.DetailResponse get(Long id) {
        return toDetail(getEntity(id));
    }

    @Transactional(readOnly = true)
    public List<ResumeDtos.BlockResponse> blocks(Long id) {
        getEntity(id);
        return blockService.list(id);
    }

    @Transactional
    public ResumeDtos.DetailResponse create(ResumeDtos.SaveRequest request) {
        ResumeVersion version = new ResumeVersion();
        apply(version, request);
        ensureSingleMaster(version);
        version = repository.saveAndFlush(version);
        blockService.replace(version.getId(), version.getContentMarkdown());
        return toDetail(version);
    }

    @Transactional
    public ResumeDtos.DetailResponse update(Long id, ResumeDtos.SaveRequest request) {
        ResumeVersion version = getEntity(id);
        apply(version, request);
        ensureSingleMaster(version);
        version = repository.saveAndFlush(version);
        blockService.replace(version.getId(), version.getContentMarkdown());
        return toDetail(version);
    }

    public ResumeVersion getEntity(Long id) {
        return repository.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, "简历版本不存在"));
    }

    @Transactional
    public ResumeDtos.DetailResponse archive(Long id) {
        ResumeVersion version = getEntity(id);
        version.setArchived(true);
        return toDetail(repository.saveAndFlush(version));
    }

    @Transactional
    public void delete(Long id) {
        ResumeVersion version = getEntity(id);
        version.setActive(false);
        version.setDeleted(true);
        repository.saveAndFlush(version);
    }

    private void ensureSingleMaster(ResumeVersion version) {
        if (version.getType() != ResumeType.MASTER || !Boolean.TRUE.equals(version.getActive())) {
            return;
        }
        repository.findAllByTypeAndActiveTrueAndDeletedFalse(ResumeType.MASTER).stream()
                .filter(existing -> !existing.getId().equals(version.getId()))
                .forEach(existing -> {
                    existing.setActive(false);
                    repository.save(existing);
                });
    }

    private void apply(ResumeVersion version, ResumeDtos.SaveRequest request) {
        String markdown = request.contentMarkdown().trim().replace("\r\n", "\n").replace('\r', '\n');
        if (!H1.matcher(markdown).find() || !H2.matcher(markdown).find()) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST,
                    "简历 Markdown 必须包含姓名一级标题和至少一个二级内容标题");
        }
        String templateKey = trimToNull(request.templateKey());
        if (templateKey != null && !DEFAULT_TEMPLATE.equals(templateKey)) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, "暂不支持该简历模板");
        }
        version.setName(request.name().trim());
        version.setType(request.type());
        version.setVersionLabel(request.versionLabel().trim());
        version.setContentMarkdown(markdown);
        version.setTemplateKey(templateKey == null ? DEFAULT_TEMPLATE : templateKey);
        version.setPhotoUrl(trimToNull(request.photoUrl()));
        version.setRelativePath(INTERNAL_MARKDOWN_PATH);
        version.setActive(request.active() == null || request.active());
        version.setNotes(trimToNull(request.notes()));
    }

    private ResumeDtos.SummaryResponse toSummary(ResumeVersion version) {
        return new ResumeDtos.SummaryResponse(
                version.getId(), version.getName(), version.getType(), version.getVersionLabel(),
                defaultTemplate(version), version.getPhotoUrl(), version.getActive(), Boolean.TRUE.equals(version.getArchived()), version.getNotes(),
                blockService.count(version.getId()), hasContent(version), version.getCreatedAt(), version.getUpdatedAt());
    }

    private ResumeDtos.DetailResponse toDetail(ResumeVersion version) {
        return new ResumeDtos.DetailResponse(
                version.getId(), version.getName(), version.getType(), version.getVersionLabel(),
                version.getContentMarkdown(), defaultTemplate(version), version.getPhotoUrl(),
                version.getActive(), Boolean.TRUE.equals(version.getArchived()), version.getNotes(), blockService.count(version.getId()), hasContent(version),
                version.getCreatedAt(), version.getUpdatedAt());
    }

    private String defaultTemplate(ResumeVersion version) {
        return version.getTemplateKey() == null ? DEFAULT_TEMPLATE : version.getTemplateKey();
    }

    private boolean hasContent(ResumeVersion version) {
        return version.getContentMarkdown() != null && !version.getContentMarkdown().isBlank();
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
