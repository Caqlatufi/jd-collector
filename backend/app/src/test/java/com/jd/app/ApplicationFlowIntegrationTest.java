package com.jd.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ApplicationFlowIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private com.jd.posting.repo.JobPostingRepository postingRepository;

    @Autowired
    private com.jd.interview.repo.InterviewRepository interviewRepository;

    @Test
    void dashboardPlanCoversMonthsExceptionsAndDeduplicatesInterviews() throws Exception {
        long companyId = postAndReadId("/api/companies", """
                {"name":"时间图验证公司","businessType":"UNKNOWN","productOwnership":"UNKNOWN"}
                """);
        LocalDateTime now = LocalDateTime.now(java.time.ZoneId.of("Asia/Shanghai")).withNano(0);
        long[] ids = new long[7];
        for (int n = 0; n < ids.length; n++) {
            ids[n] = postAndReadId("/api/postings", """
                    {"companyId":%d,"title":"plan-test-%d","direction":"JAVA_BACKEND","source":"OTHER",
                    "rawJd":"时间图测试","matchScore":30,"companyScore":10,"freshnessScore":10,"commuteScore":10,"salaryScore":10}
                    """.formatted(companyId, n));
            var posting = postingRepository.findByIdAndDeletedFalse(ids[n]).orElseThrow();
            posting.setStage(com.jd.posting.model.PostingEnums.Stage.APPLIED);
            posting.setAppliedAt(now.minusDays(2));
            posting.setNextAction("跟进事项" + n);
            posting.setNextActionAt(n == 0 ? now.plusMonths(1) : n == 2 ? null : now.minusMinutes(10));
            if (n == 3) posting.setStage(com.jd.posting.model.PostingEnums.Stage.CLOSED);
            if (n == 4) posting.setDeleted(true);
            if (n == 5) posting.setTier(com.jd.posting.model.PostingEnums.Tier.SKIP);
            postingRepository.saveAndFlush(posting);
        }
        var interviewStatus = com.jd.interview.model.InterviewEnums.Status.values();
        java.util.List<Long> interviewIds = new java.util.ArrayList<>();
        for (int n = 0; n < interviewStatus.length; n++) {
            var interview = new com.jd.interview.model.Interview();
            interview.setJobPostingId(ids[6]); interview.setRoundNo(n + 1);
            interview.setType(com.jd.interview.model.InterviewEnums.Type.TECHNICAL);
            interview.setFormat(com.jd.interview.model.InterviewEnums.Format.ONLINE);
            interview.setScheduledAt(now.minusDays(n + 1)); interview.setStatus(interviewStatus[n]);
            interviewIds.add(interviewRepository.saveAndFlush(interview).getId());
        }
        var duplicate = postingRepository.findByIdAndDeletedFalse(ids[6]).orElseThrow();
        duplicate.setNextAction("参加第 1 轮面试"); duplicate.setNextActionAt(now.minusDays(1));
        postingRepository.saveAndFlush(duplicate);
        // 已删除岗位遗留的面试不能导致聚合接口404/500。
        var deletedInterview = new com.jd.interview.model.Interview();
        deletedInterview.setJobPostingId(ids[4]); deletedInterview.setRoundNo(1);
        deletedInterview.setType(com.jd.interview.model.InterviewEnums.Type.HR);
        deletedInterview.setFormat(com.jd.interview.model.InterviewEnums.Format.ONLINE);
        deletedInterview.setStatus(com.jd.interview.model.InterviewEnums.Status.SCHEDULED);
        deletedInterview.setScheduledAt(now.plusDays(1)); interviewRepository.saveAndFlush(deletedInterview);
        JsonNode response = objectMapper.readTree(mockMvc.perform(get("/api/dashboard/today"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8)).get("result");
        assertThat(response.get("serverNow").asText()).startsWith(now.toLocalDate().toString());
        java.util.Map<String, JsonNode> plans = new java.util.HashMap<>();
        response.get("planItems").forEach(p -> plans.put(p.get("id").asText(), p));
        assertThat(plans).hasSize(6);
        assertThat(plans.get("action-" + ids[0]).get("status").asText()).isEqualTo("PLANNED");
        assertThat(plans.get("action-" + ids[0]).get("scheduledAt").asText()).startsWith(now.plusMonths(1).toLocalDate().toString());
        assertThat(plans.get("action-" + ids[1]).get("status").asText()).isEqualTo("OVERDUE");
        assertThat(plans.get("action-" + ids[2]).get("status").asText()).isEqualTo("UNSCHEDULED");
        assertThat(plans.get("interview-" + interviewIds.get(0)).get("status").asText()).isEqualTo("OVERDUE");
        assertThat(plans.get("interview-" + interviewIds.get(1)).get("status").asText()).isEqualTo("COMPLETED");
        assertThat(plans.get("interview-" + interviewIds.get(3)).get("status").asText()).isEqualTo("NO_SHOW");
        assertThat(plans).doesNotContainKeys("action-" + ids[6], "interview-" + interviewIds.get(2));
        assertThat(interviewRepository.findByIdAndDeletedFalse(interviewIds.get(0)).orElseThrow().getStatus())
                .isEqualTo(com.jd.interview.model.InterviewEnums.Status.SCHEDULED);
        assertThat(postingRepository.findByIdAndDeletedFalse(ids[1]).orElseThrow().getStage())
                .isEqualTo(com.jd.posting.model.PostingEnums.Stage.APPLIED);
    }

    @Test
    void postingsAndExportSortByScoreAndExcludeDeletedRows() throws Exception {
        long companyId = postAndReadId("/api/companies", """
                {"name":"排序验证公司","businessType":"UNKNOWN","productOwnership":"UNKNOWN"}
                """);
        int[] scores = {10, 30, 20, 30, 35};
        long[] ids = new long[scores.length];
        for (int i = 0; i < scores.length; i++) {
            ids[i] = postAndReadId("/api/postings", """
                    {"companyId":%d,"title":"sort-test-%d","direction":"JAVA_BACKEND",
                     "source":"OTHER","rawJd":"排序测试","blockingRisk":false,
                     "matchScore":%d,"companyScore":10,"freshnessScore":10,"commuteScore":0,"salaryScore":10}
                    """.formatted(companyId, i, scores[i]));
        }
        var deleted = postingRepository.findByIdAndDeletedFalse(ids[4]).orElseThrow();
        deleted.setDeleted(true);
        postingRepository.saveAndFlush(deleted);
        mockMvc.perform(get("/api/postings").param("companyId", Long.toString(companyId)).param("number", "1").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.length()").value(2))
                .andExpect(jsonPath("$.result[0].id").value(ids[3]))
                .andExpect(jsonPath("$.result[1].id").value(ids[1]));
        mockMvc.perform(get("/api/postings").param("companyId", Long.toString(companyId)).param("number", "2").param("size", "2"))
                .andExpect(jsonPath("$.result[0].id").value(ids[2]))
                .andExpect(jsonPath("$.result[1].id").value(ids[0]));
        mockMvc.perform(get("/api/postings/{id}", ids[4])).andExpect(status().isNotFound());
        String csv = mockMvc.perform(get("/api/postings/export.csv").param("companyId", Long.toString(companyId)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(csv).doesNotContain("sort-test-4");
        assertThat(csv.indexOf("sort-test-3")).isLessThan(csv.indexOf("sort-test-1"));
        assertThat(csv.indexOf("sort-test-1")).isLessThan(csv.indexOf("sort-test-2"));
        assertThat(csv.indexOf("sort-test-2")).isLessThan(csv.indexOf("sort-test-0"));
    }

    @Test
    void completeJobSearchFlowCoversAllBusinessModules() throws Exception {
        mockMvc.perform(get("/api/system/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.status").value("UP"));

        long companyId = postAndReadId("/api/companies", """
                {
                  "name":"测试产品公司",
                  "businessType":"TO_B_PRODUCT",
                  "productOwnership":"HIGH",
                  "address":"上海市闵行区",
                  "commuteMinutes":35,
                  "qualityScore":18,
                  "notes":"本地集成测试公司",
                  "active":true
                }
                """);

        postAndReadId("/api/resume-versions", """
                {
                  "name":"标准版简历",
                  "type":"MASTER",
                  "versionLabel":"2026.09-v1",
                  "contentMarkdown":"# 示例候选人\\n\\n> Agent 全栈开发工程师\\n\\n## 职业定位\\n\\n- 标准版简历",
                  "templateKey":"CLASSIC_BLUE",
                  "active":true,
                  "notes":"最新版 Word"
                }
                """);

        long resumeId = postAndReadId("/api/resume-versions", """
                {
                  "name":"Java 后端版",
                  "type":"JAVA_BACKEND",
                  "versionLabel":"2026.09-v1",
                  "contentMarkdown":"# 示例候选人\\n\\n> Java 后端工程师\\n\\n## 职业定位\\n\\n- Java 后端版本",
                  "active":true,
                  "notes":"用于 Java 和平台岗位"
                }
                """);

        String postingJson = """
                {
                  "companyId":%d,
                  "title":"Java AI 应用工程师",
                  "direction":"AI_APPLICATION",
                  "source":"BOSS",
                  "sourceUrl":"https://example.test/jobs/1",
                  "rawJd":"负责 Java 服务与大模型应用开发",
                  "location":"上海闵行",
                  "salaryMinK":20,
                  "salaryMaxK":30,
                  "salaryMonths":13,
                  "experienceMin":3,
                  "experienceMax":6,
                  "requiredSkills":"Java, Spring Boot, LLM",
                  "matchPoints":"Java 全栈与 Agent 项目经验",
                  "skillGaps":"模型评测深度",
                  "riskNotes":"无阻断风险",
                  "blockingRisk":false,
                  "matchScore":31,
                  "companyScore":18,
                  "freshnessScore":13,
                  "commuteScore":13,
                  "salaryScore":12
                }
                """.formatted(companyId);
        long postingId = postAndReadId("/api/postings", postingJson);

        mockMvc.perform(get("/api/postings/{id}", postingId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.totalScore").value(87))
                .andExpect(jsonPath("$.result.tier").value("S"))
                .andExpect(jsonPath("$.result.stage").value("SCREENED"));

        String tomorrow = LocalDateTime.now().plusDays(1).withNano(0).toString();
        putJson("/api/postings/%d/stage".formatted(postingId), """
                {
                  "toStage":"READY_TO_APPLY",
                  "nextAction":"定制简历并投递",
                  "nextActionAt":"%s",
                  "note":"进入准备投递"
                }
                """.formatted(tomorrow));

        String appliedAt = LocalDateTime.now().withNano(0).toString();
        putJson("/api/postings/%d/stage".formatted(postingId), """
                {
                  "toStage":"APPLIED",
                  "resumeVersionId":%d,
                  "appliedAt":"%s",
                  "nextAction":"三天后跟进 HR",
                  "nextActionAt":"%s",
                  "note":"BOSS 完成投递"
                }
                """.formatted(resumeId, appliedAt, tomorrow));

        mockMvc.perform(get("/api/postings").param("resumeVersionId", Long.toString(resumeId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.length()").value(1))
                .andExpect(jsonPath("$.result[0].id").value(postingId));

        long interviewId = postAndReadId("/api/postings/%d/interviews".formatted(postingId), """
                {
                  "roundNo":1,
                  "type":"TECHNICAL",
                  "format":"ONLINE",
                  "scheduledAt":"%s",
                  "status":"SCHEDULED",
                  "interviewer":"技术负责人",
                  "nextStep":"准备 示例项目 深度故事"
                }
                """.formatted(tomorrow));

        mockMvc.perform(get("/api/interviews").param("postingId", Long.toString(postingId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.length()").value(1))
                .andExpect(jsonPath("$.result[0].id").value(interviewId));

        mockMvc.perform(get("/api/dashboard/today"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.nextSevenDayInterviews[0].interviewId").value(interviewId))
                .andExpect(jsonPath("$.result.conversion.collected").value(1))
                .andExpect(jsonPath("$.result.conversion.applied").value(1))
                .andExpect(jsonPath("$.result.conversion.interviewed").value(1));

        mockMvc.perform(get("/api/postings/{id}/events", postingId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.length()").value(3));

        putJson("/api/interviews/%d".formatted(interviewId), """
                {
                  "roundNo":1,
                  "type":"TECHNICAL",
                  "format":"ONLINE",
                  "scheduledAt":"%s",
                  "status":"COMPLETED",
                  "interviewer":"技术负责人",
                  "questions":"Agent 工具调用如何保证幂等",
                  "feedback":"系统设计表达清楚，评测细节需加强",
                  "nextStep":"补齐评测方案"
                }
                """.formatted(tomorrow));

        MvcResult export = mockMvc.perform(get("/api/postings/export.csv").param("tier", "S"))
                .andExpect(status().isOk())
                .andReturn();
        String csv = export.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(csv).startsWith("\uFEFF").contains("测试产品公司").contains("Java AI 应用工程师");
    }

    @Test
    void applicationStartsPipelineAndFollowUpRemainsOptional() throws Exception {
        long companyId = postAndReadId("/api/companies", """
                {"name":"投递入口验证公司","businessType":"UNKNOWN","productOwnership":"UNKNOWN"}
                """);
        long resumeId = postAndReadId("/api/resume-versions", """
                {"name":"投递入口测试简历","type":"JAVA_BACKEND","versionLabel":"v1",
                 "contentMarkdown":"# 测试候选人\\n\\n## 职业定位\\n\\n- Java 后端","active":true}
                """);
        long postingId = postAndReadId("/api/postings", """
                {"companyId":%d,"title":"投递入口测试岗位","direction":"JAVA_BACKEND",
                 "source":"OTHER","rawJd":"测试从JD列表开始投递","blockingRisk":false,
                 "matchScore":30,"companyScore":15,"freshnessScore":10,"commuteScore":10,"salaryScore":10}
                """.formatted(companyId));
        String appliedAt = LocalDateTime.now().withNano(0).toString();

        mockMvc.perform(post("/api/postings/{id}/interviews", postingId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"roundNo":1,"type":"TECHNICAL","format":"ONLINE",
                                 "scheduledAt":"%s","status":"SCHEDULED"}
                                """.formatted(LocalDateTime.now().plusDays(1).withNano(0))))
                .andExpect(status().isConflict());

        putJson("/api/postings/%d/stage".formatted(postingId), """
                {"toStage":"APPLIED","resumeVersionId":%d,"appliedAt":"%s","note":"已实际提交"}
                """.formatted(resumeId, appliedAt));

        mockMvc.perform(get("/api/postings/{id}", postingId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.stage").value("APPLIED"))
                .andExpect(jsonPath("$.result.resumeVersionId").value(resumeId))
                .andExpect(jsonPath("$.result.nextAction").doesNotExist())
                .andExpect(jsonPath("$.result.nextActionAt").doesNotExist());
        mockMvc.perform(get("/api/postings/{id}/events", postingId))
                .andExpect(jsonPath("$.result.length()").value(1))
                .andExpect(jsonPath("$.result[0].fromStage").value("SCREENED"))
                .andExpect(jsonPath("$.result[0].toStage").value("APPLIED"));
        mockMvc.perform(get("/api/dashboard/today"))
                .andExpect(jsonPath("$.result.planItems.length()").value(0));

        mockMvc.perform(put("/api/postings/{id}/stage", postingId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toStage\":\"APPLIED\",\"nextAction\":\"跟进HR\"}"))
                .andExpect(status().isConflict());

        mockMvc.perform(post("/api/resume-versions/{id}/archive", resumeId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.archived").value(true))
                .andExpect(jsonPath("$.result.active").value(true));
        mockMvc.perform(get("/api/resume-versions"))
                .andExpect(jsonPath("$.result[?(@.id == " + resumeId + ")]").isEmpty());
        mockMvc.perform(get("/api/resume-versions/{id}", resumeId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.contentMarkdown").isNotEmpty());
        mockMvc.perform(get("/api/resume-versions/{id}/blocks", resumeId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").isNotEmpty());
        mockMvc.perform(get("/api/postings/{id}", postingId))
                .andExpect(jsonPath("$.result.resumeVersionName").value("投递入口测试简历"));
        putJson("/api/postings/%d/stage".formatted(postingId), "{\"toStage\":\"INTERVIEW\"}");
        long otherPosting = postAndReadId("/api/postings", """
                {"companyId":%d,"title":"归档版不能新投递","direction":"JAVA_BACKEND",
                 "source":"OTHER","rawJd":"测试","matchScore":30,"companyScore":15,
                 "freshnessScore":10,"commuteScore":10,"salaryScore":10}
                """.formatted(companyId));
        mockMvc.perform(put("/api/postings/{id}/stage", otherPosting)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"toStage":"APPLIED","resumeVersionId":%d,"appliedAt":"%s"}
                                """.formatted(resumeId, appliedAt)))
                .andExpect(status().isConflict());
    }

    @Test
    void explicitlyDeletedResumeIsRemovedFromListAndDetail() throws Exception {
        long id = postAndReadId("/api/resume-versions", """
                {"name":"待删除简历","type":"FULL_STACK","versionLabel":"v1",
                 "contentMarkdown":"# 测试\\n\\n## 经历\\n\\n正文"}
                """);
        mockMvc.perform(delete("/api/resume-versions/{id}", id)).andExpect(status().isOk());
        mockMvc.perform(get("/api/resume-versions/{id}", id)).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/resume-versions"))
                .andExpect(jsonPath("$.result[?(@.id == " + id + ")]").isEmpty());
    }

    @Test
    void validationAndSingleMasterRulesAreEnforced() throws Exception {
        long firstMaster = postAndReadId("/api/resume-versions", """
                {
                  "name":"Master v1",
                  "type":"MASTER",
                  "versionLabel":"v1",
                  "contentMarkdown":"# Master v1\\n\\n## 职业定位\\n\\n- 第一版",
                  "active":true
                }
                """);
        postAndReadId("/api/resume-versions", """
                {
                  "name":"Master v2",
                  "type":"MASTER",
                  "versionLabel":"v2",
                  "contentMarkdown":"# Master v2\\n\\n## 职业定位\\n\\n- 第二版",
                  "active":true
                }
                """);

        mockMvc.perform(get("/api/resume-versions").param("active", "true").param("type", "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.length()").value(1))
                .andExpect(jsonPath("$.result[0].versionLabel").value("v2"));

        mockMvc.perform(get("/api/resume-versions/{id}", firstMaster))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.active").value(false));

        mockMvc.perform(get("/api/resume-versions/{id}/blocks", firstMaster))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.length()").value(2))
                .andExpect(jsonPath("$.result[0].sectionKey").value("profile"))
                .andExpect(jsonPath("$.result[1].heading").value("职业定位"))
                .andExpect(jsonPath("$.result[1].contentHash").isNotEmpty());

        mockMvc.perform(post("/api/companies")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\",\"businessType\":\"UNKNOWN\",\"productOwnership\":\"UNKNOWN\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40001));
    }

    @Test
    void skippedPostingCanCloseWithoutFabricatingAnApplication() throws Exception {
        long companyId = postAndReadId("/api/companies", """
                {"name":"关闭验证公司","businessType":"UNKNOWN","productOwnership":"UNKNOWN"}
                """);
        long postingId = postAndReadId("/api/postings", """
                {"companyId":%d,"title":"已结束岗位","direction":"JAVA_BACKEND",
                 "source":"OTHER","rawJd":"来源明确标注已结束","blockingRisk":true,
                 "matchScore":25,"companyScore":10,"freshnessScore":0,"commuteScore":0,"salaryScore":0}
                """.formatted(companyId));
        mockMvc.perform(put("/api/postings/{id}/stage", postingId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"toStage\":\"APPLIED\"}"))
                .andExpect(status().isConflict());
        putJson("/api/postings/%d/stage".formatted(postingId),
                "{\"toStage\":\"CLOSED\",\"note\":\"招聘结束，采集阶段关闭\"}");
        mockMvc.perform(get("/api/postings/{id}", postingId))
                .andExpect(jsonPath("$.result.stage").value("CLOSED"))
                .andExpect(jsonPath("$.result.appliedAt").doesNotExist())
                .andExpect(jsonPath("$.result.resumeVersionId").doesNotExist());
        mockMvc.perform(get("/api/postings/{id}/events", postingId))
                .andExpect(jsonPath("$.result[0].toStage").value("CLOSED"));
        mockMvc.perform(get("/api/dashboard/today"))
                .andExpect(jsonPath("$.result.conversion.applied").value(0));
    }

    private long postAndReadId(String path, String body) throws Exception {
        MvcResult result = mockMvc.perform(post(path)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andReturn();
        JsonNode root = objectMapper.readTree(result.getResponse().getContentAsByteArray());
        return root.path("result").path("id").asLong();
    }

    private void putJson(String path, String body) throws Exception {
        mockMvc.perform(put(path)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }
}
