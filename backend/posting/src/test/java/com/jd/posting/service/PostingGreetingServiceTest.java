package com.jd.posting.service;

import com.jd.common.exception.BusinessException;
import com.jd.posting.model.GreetingDtos;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PostingGreetingServiceTest {
    private final GreetingDtos.Input input = new GreetingDtos.Input("公司", "后端工程师", "负责服务化与稳定性建设",
            "参与模块拆分；处理 Redis 与数据库事务时序问题");

    private GreetingDtos.Draft draft(String text) {
        return new GreetingDtos.Draft(text, List.of(new GreetingDtos.Evidence("服务化与稳定性建设", "处理 Redis 与数据库事务时序问题")));
    }

    private String greeting(int length) {
        String prefix = "您好，想应聘后端岗位。\n\n任职资格：\n1. 技术背景：";
        String suffix = "\n\n期待查看简历并进一步沟通。";
        return prefix + "好".repeat(length - PostingGreetingService.characterCount(prefix + suffix)) + suffix;
    }

    @Test
    void lengthCountsCodePointsAndIgnoresWhitespaceIncludingChineseSpaces() {
        assertThat(PostingGreetingService.characterCount("你 好\nJava　😀")).isEqualTo(7);
        PostingGreetingService.validate(draft(greeting(100)), input);
        PostingGreetingService.validate(draft(greeting(201)), input);
        PostingGreetingService.validate(draft(greeting(500)), input);
        PostingGreetingService.validate(draft(greeting(499).replace("技术背景：", "技术背景：😀　")), input);
        assertThatThrownBy(() -> PostingGreetingService.validate(draft(greeting(99)), input)).isInstanceOf(BusinessException.class);
        PostingGreetingService.validate(draft(greeting(501)), input);
        PostingGreetingService.validate(draft(greeting(569)), input);
    }

    @Test
    void inventedOrEmptyEvidenceIsRejectedRatherThanReturnedAsSuccess() {
        var invented = new GreetingDtos.Draft(greeting(140), List.of(new GreetingDtos.Evidence("服务化与稳定性建设", "独立主导多活容灾")));
        assertThatThrownBy(() -> PostingGreetingService.validate(invented, input))
                .isInstanceOf(BusinessException.class).hasMessageContaining("第 1 条依据未能在简历中找到连续原文");
        assertThatThrownBy(() -> PostingGreetingService.validate(new GreetingDtos.Draft(greeting(140), List.of()), input))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> PostingGreetingService.validate(new GreetingDtos.Draft(greeting(140), List.of(new GreetingDtos.Evidence("招聘Python专家", "参与模块拆分"))), input))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void groupedLinesKeepBlankSeparatorAndEachItemNeedsEvidence() {
        var evidence = draft(greeting(100)).evidence().get(0);
        String text = "您好，想应聘后端岗位。\n\n任职资格：\n1. 系统设计：参与模块拆分。\n2. 稳定性：处理 Redis 与数据库事务时序问题。\n\n加分项：\n1. 系统设计：参与模块拆分。\n2. 稳定性：处理 Redis 与数据库事务时序问题。\n\n期待您查看简历并进一步沟通。";
        var fourEvidence = List.of(evidence, evidence, evidence, evidence);
        PostingGreetingService.validate(new GreetingDtos.Draft(text, fourEvidence), input);
        PostingGreetingService.validate(new GreetingDtos.Draft(text.replace("\n", "\r\n"), fourEvidence), input);
        assertThatThrownBy(() -> PostingGreetingService.validate(new GreetingDtos.Draft(text.replace("\n\n加分项", "\n加分项"), fourEvidence), input))
                .isInstanceOf(BusinessException.class).hasMessageContaining("分组空行");
        assertThatThrownBy(() -> PostingGreetingService.validate(draft(text), input)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> PostingGreetingService.validate(draft("好".repeat(140)), input)).isInstanceOf(BusinessException.class);
    }

    @Test
    void separateSourceSentencesCannotBeJoinedIntoOneEvidenceQuote() {
        var separated = new GreetingDtos.Input("公司", "后端工程师", input.jd(),
                "参与模块拆分。另一个无关项目。处理 Redis 与数据库事务时序问题。");
        var joined = new GreetingDtos.Draft(greeting(140),
                List.of(new GreetingDtos.Evidence("服务化与稳定性建设", "参与模块拆分。处理 Redis 与数据库事务时序问题。")));
        assertThatThrownBy(() -> PostingGreetingService.validate(joined, separated))
                .isInstanceOf(BusinessException.class).hasMessageContaining("连续原文");
    }
}
