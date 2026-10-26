package com.jd.posting.service;

import com.jd.common.exception.BusinessException;
import com.jd.common.exception.ErrorCode;
import com.jd.posting.model.PostingDirection;
import com.jd.posting.model.PostingDirectionDtos.Option;
import com.jd.posting.model.PostingDirectionDtos.Proposal;
import com.jd.posting.repo.PostingDirectionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@RequiredArgsConstructor
public class PostingDirectionService {
    private static final List<Option> DEFAULTS = List.of(
            new Option("JAVA_BACKEND", "Java 后端", "以 Java/JVM 业务服务开发为核心职责"),
            new Option("PLATFORM_BACKEND", "平台后端", "以通用服务、基础平台、基础设施或后端平台工程为核心职责，不限语言"),
            new Option("AI_APPLICATION", "AI 应用", "以大模型、智能体、RAG 等 AI 业务应用开发为核心职责"),
            new Option("FULL_STACK", "全栈", "同时承担前端与后端应用开发"),
            new Option("AI_TOOLING", "AI 工具", "以 AI 开发工具、工程效率工具或工具链建设为核心职责"),
            new Option("TEST_PLATFORM", "测试平台开发", "以自动化测试平台、测试工具或质量工程平台开发为核心职责")
    );

    private final PostingDirectionRepository repository;

    @Transactional(readOnly = true)
    public List<Option> options() {
        List<Option> options = new ArrayList<>(DEFAULTS);
        repository.findAllByDeletedFalseOrderByIdAsc().forEach(row ->
                options.add(new Option(row.getCode(), row.getLabel(), row.getDescription())));
        return options;
    }

    // Joins the posting transaction: a failed JD must not leave an unused category.
    @Transactional(propagation = Propagation.MANDATORY)
    public String resolve(String code, Proposal proposal) {
        if (code != null && !code.isBlank()) {
            if (proposal != null) throw invalid("岗位方向与新增分类不能同时填写");
            return options().stream().filter(option -> option.value().equals(code))
                    .findFirst().orElseThrow(() -> invalid("岗位方向不存在，请读取最新分类；新增分类须提供名称、定义和理由")).value();
        }
        if (proposal == null) throw invalid("岗位方向不能为空；不匹配时请提供新增分类");
        String label = clean(proposal.label());
        String key = key(label);
        if (key.isBlank() || label.length() > 60 || proposal.description() == null || proposal.description().isBlank()
                || proposal.description().length() > 400 || proposal.reason() == null || proposal.reason().isBlank()
                || proposal.reason().length() > 500) throw invalid("新增岗位分类须提供有效名称、定义及现有分类不适用的理由");
        var existing = options().stream().filter(option -> key(option.label()).equals(key)
                || key(option.value()).equals(key)).findFirst();
        if (existing.isPresent()) return existing.get().value();
        PostingDirection row = new PostingDirection();
        row.setCode("DIR_" + UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8)).toString().replace("-", ""));
        row.setLabel(label);
        row.setNormalizedLabel(key);
        row.setDescription(proposal.description().trim());
        row.setReason(proposal.reason().trim());
        try {
            return repository.saveAndFlush(row).getCode();
        } catch (DataIntegrityViolationException error) {
            // Another import may have created the same category. Roll back and let the graph reuse it.
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "岗位分类已由其他任务创建，请读取最新分类后重试");
        }
    }

    private String clean(String value) {
        return value == null ? "" : Normalizer.normalize(value, Normalizer.Form.NFKC).strip().replaceAll("(?U)\\s+", " ");
    }

    private String key(String value) {
        return clean(value).replaceAll("(?U)\\s+", "").toLowerCase(Locale.ROOT);
    }

    private BusinessException invalid(String message) {
        return new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, message);
    }
}
