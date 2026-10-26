package com.jd.posting.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jd.common.exception.BusinessException;
import com.jd.common.exception.ErrorCode;
import com.jd.posting.model.GreetingDtos;
import com.jd.posting.model.PostingGreeting;
import com.jd.posting.repo.PostingGreetingRepository;
import com.jd.resume.service.ResumeVersionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

import java.util.regex.Pattern;

@RequiredArgsConstructor
public class PostingGreetingService {
    private static final Pattern GREETING_STRUCTURE = Pattern.compile(
            "\\A[^\\r\\n]+\\n\\n任职资格：\\n(?:[1-9]\\d*\\. [^\\r\\n]+\\n)+"
                    + "(?:\\n加分项：\\n(?:[1-9]\\d*\\. [^\\r\\n]+\\n)+)?\\n[^\\r\\n]+\\z");
    private static final Pattern MATCH_ITEM = Pattern.compile("(?m)^[1-9]\\d*\\. ");
    private final PostingService postings;
    private final ResumeVersionService resumes;
    private final GreetingGenerator generator;
    private final PostingGreetingRepository repository;
    private final ObjectMapper mapper;

    public GreetingDtos.Response latest(Long postingId, Long resumeId) {
        postings.get(postingId);
        var stored = resumeId == null
                ? repository.findFirstByPostingIdAndDeletedFalseOrderByIdDesc(postingId)
                : repository.findFirstByPostingIdAndResumeVersionIdAndDeletedFalseOrderByIdDesc(postingId, resumeId);
        return stored.map(item -> {
            try {
                return mapper.readValue(item.getResultJson(), GreetingDtos.Response.class);
            } catch (JsonProcessingException exception) {
                throw new IllegalStateException("读取已保存的打招呼用语失败", exception);
            }
        }).orElse(null);
    }

    // Each read returns a detached snapshot; no database transaction remains open during generation.
    public GreetingDtos.Response generate(Long postingId, Long resumeId) {
        var posting = postings.get(postingId);
        var resume = resumes.get(resumeId);
        if (!Boolean.TRUE.equals(resume.active()) || resume.archived()) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, "请选择启用且未归档的简历");
        }
        if (resume.contentMarkdown() == null || resume.contentMarkdown().isBlank()
                || posting.rawJd() == null || posting.rawJd().isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, "JD 和简历正文不能为空");
        }
        var input = new GreetingDtos.Input(posting.companyName(), posting.title(), posting.rawJd(), resume.contentMarkdown());
        if (input.jd().length() + input.resume().length() > 80000) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, "JD 与简历正文过长，请先精简正文");
        }
        var draft = generator.generate(input);
        validate(draft, input);
        String text = normalizeGreeting(draft.greeting());
        var response = new GreetingDtos.Response(postingId, resumeId, resume.name(), resume.versionLabel(), text,
                characterCount(text), draft.evidence(), GreetingDtos.MODEL, GreetingDtos.REASONING_EFFORT);
        var stored = new PostingGreeting();
        stored.setPostingId(postingId);
        stored.setResumeVersionId(resumeId);
        try {
            stored.setResultJson(mapper.writeValueAsString(response));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("保存打招呼用语失败", exception);
        }
        // Only this short repository transaction writes; model/validation failures leave history intact.
        repository.saveAndFlush(stored);
        return response;
    }

    static int characterCount(String text) {
        String compact = normalize(text);
        return compact.codePointCount(0, compact.length());
    }

    static void validate(GreetingDtos.Draft draft, GreetingDtos.Input input) {
        if (draft == null || draft.greeting() == null || draft.greeting().length() > 4000) {
            throw invalidDraft("模型未返回有效正文");
        }
        int count = characterCount(draft.greeting());
        if (count < 100) {
            throw invalidDraft("生成结果为 " + count + " 字，需至少 100 字");
        }
        if (draft.evidence() == null || draft.evidence().isEmpty() || draft.evidence().size() > 10) {
            throw invalidDraft("生成结果缺少有效匹配依据");
        }
        String text = normalizeGreeting(draft.greeting());
        if (!GREETING_STRUCTURE.matcher(text).matches()) {
            throw invalidDraft("生成结果未按任职资格、加分项逐行分组或缺少分组空行");
        }
        if (MATCH_ITEM.matcher(text).results().count() != draft.evidence().size()) {
            throw invalidDraft("符合项与匹配依据数量不一致");
        }
        for (int i = 0; i < draft.evidence().size(); i++) {
            var evidence = draft.evidence().get(i);
            if (evidence == null || !containsQuote(input.jd(), evidence.jdQuote())) {
                throw invalidDraft("第 " + (i + 1) + " 条依据未能在 JD 中找到连续原文");
            }
            if (!containsQuote(input.resume(), evidence.resumeQuote())) {
                throw invalidDraft("第 " + (i + 1) + " 条依据未能在简历中找到连续原文");
            }
        }
    }

    private static String normalizeGreeting(String text) {
        return text.replace("\r\n", "\n").strip();
    }

    private static boolean containsQuote(String source, String quote) {
        if (quote == null || quote.isBlank() || quote.length() > 500) return false;
        return normalize(source).contains(normalize(quote));
    }

    private static String normalize(String text) {
        return text.replaceAll("[\\p{IsWhite_Space}\\uFEFF]+", "");
    }

    private static BusinessException invalidDraft(String reason) {
        return new BusinessException(ErrorCode.BUSINESS_ERROR, HttpStatus.BAD_GATEWAY,
                reason + "，请重新生成");
    }
}
