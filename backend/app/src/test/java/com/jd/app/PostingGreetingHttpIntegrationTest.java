package com.jd.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jd.common.exception.BusinessException;
import com.jd.common.exception.ErrorCode;
import com.jd.posting.model.GreetingDtos;
import com.jd.posting.service.GreetingGenerator;
import com.jd.posting.repo.PostingGreetingRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.http.HttpStatus;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class PostingGreetingHttpIntegrationTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @MockBean GreetingGenerator generator;
    @Autowired PostingGreetingRepository greetings;
    private final HttpClient client = HttpClient.newHttpClient();
    private long postingId;
    private long resumeId;
    private final String resume = "# 测试候选人\n## 项目经历\n参与模块拆分；维护异步任务的状态流转和异常重试。";
    private final String jd = "负责Java后端开发、模块设计与异步任务编排。";
    private final String greeting = "您好，想应聘Java后端工程师岗位。\n\n任职资格：\n1. 模块设计：参与模块拆分，具备围绕业务接口理解模块边界和处理功能依赖的实践，相关职责已在简历项目经历中列明。\n2. 异步任务编排：维护异步任务的状态流转和异常重试，处理任务执行和失败恢复，支持任务链路持续运行。\n\n期待您查看简历，并进一步交流岗位需求。";

    private HttpResponse<String> request(String path, Object body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/jd-collector/api" + path));
        if (body != null) builder.header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private JsonNode result(HttpResponse<String> response) throws Exception {
        assertThat(response.statusCode()).withFailMessage("HTTP %s: %s", response.statusCode(), response.body()).isEqualTo(200);
        return mapper.readTree(response.body()).path("result");
    }

    @BeforeEach
    void setup() throws Exception {
        reset(generator);
        long companyId = result(request("/companies", Map.of("name", "打招呼测试公司-" + UUID.randomUUID(), "businessType", "UNKNOWN", "productOwnership", "UNKNOWN"))).path("id").asLong();
        postingId = result(request("/postings", Map.ofEntries(Map.entry("companyId", companyId), Map.entry("title", "Java后端工程师"),
                Map.entry("direction", "JAVA_BACKEND"), Map.entry("source", "BOSS"), Map.entry("rawJd", jd),
                Map.entry("matchScore", 30), Map.entry("companyScore", 15), Map.entry("freshnessScore", 10),
                Map.entry("commuteScore", 10), Map.entry("salaryScore", 10)))).path("id").asLong();
        resumeId = createResume(true, resume);
    }

    private long createResume(boolean active, String text) throws Exception {
        return result(request("/resume-versions", Map.of("name", "定向测试版", "type", "TARGETED", "versionLabel", "test-v1",
                "contentMarkdown", text, "active", active))).path("id").asLong();
    }

    private GreetingDtos.Draft draft() {
        return new GreetingDtos.Draft(greeting, List.of(new GreetingDtos.Evidence("模块设计", "参与模块拆分"),
                new GreetingDtos.Evidence("异步任务编排", "维护异步任务的状态流转和异常重试")));
    }

    @Test
    void selectedStoredResumeAndJdAreUsedWithoutWritingApplicationOrResume() throws Exception {
        long alternate = createResume(true, "# 另一候选人\n## 技能\n只做前端界面。");
        JsonNode beforePosting = result(request("/postings/" + postingId, null));
        JsonNode beforeResume = result(request("/resume-versions/" + resumeId, null));
        when(generator.generate(any())).thenAnswer(call -> {
            GreetingDtos.Input input = call.getArgument(0);
            assertThat(input.jd()).isEqualTo(jd);
            assertThat(input.resume()).isEqualTo(resume);
            assertThat(input.resume()).doesNotContain("只做前端界面");
            return draft();
        });
        JsonNode generated = result(request("/postings/" + postingId + "/greeting", Map.of("resumeVersionId", resumeId)));
        assertThat(generated.path("resumeVersionId").asLong()).isEqualTo(resumeId).isNotEqualTo(alternate);
        assertThat(generated.path("model").asText()).isEqualTo("gpt-6.1-sol");
        assertThat(generated.path("reasoningEffort").asText()).isEqualTo("medium");
        assertThat(generated.path("characterCount").asInt()).isBetween(100, 500);
        assertThat(generated.path("greeting").asText()).isEqualTo(greeting);
        var stored = greetings.findFirstByPostingIdAndResumeVersionIdAndDeletedFalseOrderByIdDesc(postingId, resumeId).orElseThrow();
        assertThat(mapper.readTree(stored.getResultJson())).isEqualTo(generated);
        assertThat(result(request("/postings/" + postingId + "/greeting", null))).isEqualTo(generated);
        assertThat(result(request("/postings/" + postingId, null))).isEqualTo(beforePosting);
        assertThat(result(request("/resume-versions/" + resumeId, null))).isEqualTo(beforeResume);
    }

    @Test
    void savedGreetingsSurviveReopeningAndAreIsolatedByPostingAndResume() throws Exception {
        assertThat(result(request("/postings/" + postingId + "/greeting", null)).isMissingNode()).isTrue();
        verifyNoInteractions(generator);
        when(generator.generate(any())).thenReturn(draft());
        JsonNode first = result(request("/postings/" + postingId + "/greeting", Map.of("resumeVersionId", resumeId)));
        long otherResume = createResume(true, resume);
        String newerText = greeting.replace("进一步交流", "继续交流");
        when(generator.generate(any())).thenReturn(new GreetingDtos.Draft(newerText, draft().evidence()));
        JsonNode newer = result(request("/postings/" + postingId + "/greeting", Map.of("resumeVersionId", otherResume)));
        reset(generator);
        assertThat(result(request("/postings/" + postingId + "/greeting", null))).isEqualTo(newer);
        assertThat(result(request("/postings/" + postingId + "/greeting?resumeVersionId=" + resumeId, null))).isEqualTo(first);
        assertThat(result(request("/postings/" + postingId + "/greeting?resumeVersionId=999999", null)).isMissingNode()).isTrue();
        assertThat(request("/postings/999999/greeting", null).statusCode()).isEqualTo(404);
        result(request("/resume-versions/" + otherResume + "/archive", Map.of()));
        assertThat(result(request("/postings/" + postingId + "/greeting", null))).isEqualTo(newer);
        verifyNoInteractions(generator);
    }

    @Test
    void regenerationAppendsOnlySuccessfulValidatedResultsAndKeepsPreviousOnFailure() throws Exception {
        when(generator.generate(any())).thenReturn(draft());
        JsonNode first = result(request("/postings/" + postingId + "/greeting", Map.of("resumeVersionId", resumeId)));
        long firstId = greetings.findFirstByPostingIdAndDeletedFalseOrderByIdDesc(postingId).orElseThrow().getId();
        long count = greetings.count();
        when(generator.generate(any())).thenReturn(new GreetingDtos.Draft("太短", draft().evidence()));
        assertThat(request("/postings/" + postingId + "/greeting", Map.of("resumeVersionId", resumeId)).statusCode()).isEqualTo(502);
        assertThat(greetings.count()).isEqualTo(count);
        assertThat(result(request("/postings/" + postingId + "/greeting", null))).isEqualTo(first);
        when(generator.generate(any())).thenThrow(new BusinessException(ErrorCode.BUSINESS_ERROR, HttpStatus.BAD_GATEWAY, "模型调用失败"));
        assertThat(request("/postings/" + postingId + "/greeting", Map.of("resumeVersionId", resumeId)).statusCode()).isEqualTo(502);
        assertThat(greetings.count()).isEqualTo(count);
        assertThat(result(request("/postings/" + postingId + "/greeting", null))).isEqualTo(first);
        reset(generator);
        when(generator.generate(any())).thenReturn(new GreetingDtos.Draft(greeting.replace("进一步交流", "再次交流"), draft().evidence()));
        JsonNode next = result(request("/postings/" + postingId + "/greeting", Map.of("resumeVersionId", resumeId)));
        assertThat(greetings.count()).isEqualTo(count + 1);
        assertThat(greetings.findById(firstId)).isPresent();
        assertThat(result(request("/postings/" + postingId + "/greeting?resumeVersionId=" + resumeId, null))).isEqualTo(next);
    }

    @Test
    void unavailableResumeAndMissingSelectionFailBeforeModelCall() throws Exception {
        assertThat(request("/postings/" + postingId + "/greeting", Map.of()).statusCode()).isEqualTo(400);
        assertThat(request("/postings/" + postingId + "/greeting", Map.of("resumeVersionId", -1)).statusCode()).isEqualTo(400);
        assertThat(request("/postings/" + postingId + "/greeting", Map.of("resumeVersionId", 999999)).statusCode()).isEqualTo(404);
        long inactive = createResume(false, resume);
        assertThat(request("/postings/" + postingId + "/greeting", Map.of("resumeVersionId", inactive)).statusCode()).isEqualTo(400);
        result(request("/resume-versions/" + resumeId + "/archive", Map.of()));
        assertThat(request("/postings/" + postingId + "/greeting", Map.of("resumeVersionId", resumeId)).statusCode()).isEqualTo(400);
        verifyNoInteractions(generator);
    }

    @Test
    void invalidDraftIsRejectedAndFailedGenerationLeavesStoredJobUntouched() throws Exception {
        JsonNode before = result(request("/postings/" + postingId, null));
        when(generator.generate(any())).thenReturn(new GreetingDtos.Draft("太短", draft().evidence()));
        var failure = request("/postings/" + postingId + "/greeting", Map.of("resumeVersionId", resumeId));
        assertThat(failure.statusCode()).isEqualTo(502);
        assertThat(mapper.readTree(failure.body()).path("code").asInt()).isEqualTo(40002);
        assertThat(result(request("/postings/" + postingId, null))).isEqualTo(before);
    }

    @Test
    void upstreamCapacityErrorIsReturnedWithoutChangingJobOrResume() throws Exception {
        JsonNode beforePosting = result(request("/postings/" + postingId, null));
        JsonNode beforeResume = result(request("/resume-versions/" + resumeId, null));
        String message = "GPT 6.1 Sol 当前容量不足（CODEX_MODEL_CAPACITY），请稍后重试，无需重新登录；HTTP 503";
        when(generator.generate(any())).thenThrow(new BusinessException(ErrorCode.BUSINESS_ERROR, HttpStatus.BAD_GATEWAY, message));
        var failure = request("/postings/" + postingId + "/greeting", Map.of("resumeVersionId", resumeId));
        assertThat(failure.statusCode()).isEqualTo(502);
        JsonNode body = mapper.readTree(failure.body());
        assertThat(body.path("code").asInt()).isEqualTo(40002);
        assertThat(body.path("msg").asText()).isEqualTo(message);
        assertThat(result(request("/postings/" + postingId, null))).isEqualTo(beforePosting);
        assertThat(result(request("/resume-versions/" + resumeId, null))).isEqualTo(beforeResume);
    }

    @Test
    void overFiveHundredCharactersAreReturnedInFullWithoutTruncation() throws Exception {
        int count = greeting.codePointCount(0, greeting.length()) - (int) greeting.chars().filter(Character::isWhitespace).count();
        String atLimit = greeting.replace("模块设计：", "模块设计：" + "字".repeat(500 - count));
        when(generator.generate(any())).thenReturn(new GreetingDtos.Draft(atLimit, draft().evidence()));
        JsonNode generated = result(request("/postings/" + postingId + "/greeting", Map.of("resumeVersionId", resumeId)));
        assertThat(generated.path("characterCount").asInt()).isEqualTo(500);
        assertThat(generated.path("greeting").asText()).isEqualTo(atLimit);
        String overLimit = atLimit + "字".repeat(69);
        when(generator.generate(any())).thenReturn(new GreetingDtos.Draft(overLimit, draft().evidence()));
        JsonNode longer = result(request("/postings/" + postingId + "/greeting", Map.of("resumeVersionId", resumeId)));
        assertThat(longer.path("characterCount").asInt()).isEqualTo(569);
        assertThat(longer.path("greeting").asText()).isEqualTo(overLimit);
    }
}
