package com.jd.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jd.posting.repo.JobPostingRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class PostingKnowledgeIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JobPostingRepository postingRepository;

    @Test
    void weightedGraphUsesPerPostingPrioritiesAndTracksEmptyAndStaleProfiles() throws Exception {
        long companyId = postId("/api/companies", """
                {"name":"知识图谱测试公司","businessType":"UNKNOWN","productOwnership":"UNKNOWN"}
                """);
        long first = posting(companyId, "AI全栈工程师", "Spring Boot、RAG、Redis");
        long second = posting(companyId, "AI应用工程师", "SpringBoot、RAG、Python");
        long empty = posting(companyId, "技术协调岗位", "无明确技术词");

        replace(first, """
                {"extractorVersion":"jd-term-v1","terms":[
                  {"term":"SpringBoot","priority":"MEDIUM"},
                  {"term":"Spring Boot","priority":"HIGH"},
                  {"term":"RAG","priority":"HIGH"},
                  {"term":"Redis","priority":"LOW"}
                ]}
                """);
        replace(second, """
                {"extractorVersion":"jd-term-v1","terms":[
                  {"term":"Spring Boot","priority":"MEDIUM"},
                  {"term":"RAG","priority":"LOW"},
                  {"term":"Python","priority":"HIGH"}
                ]}
                """);
        replace(empty, "{" + "\"extractorVersion\":\"jd-term-v1\",\"terms\":[]}");

        mockMvc.perform(get("/api/posting-knowledge/postings/{id}/terms", first))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.processed").value(true))
                .andExpect(jsonPath("$.result.stale").value(false))
                .andExpect(jsonPath("$.result.terms.length()").value(3))
                .andExpect(jsonPath("$.result.terms[0].priority").value("HIGH"));

        JsonNode graph = result(post("/api/posting-knowledge/graph")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"postingIds":[%d,%d,%d],"minDocumentCount":2,"minEdgeDocumentCount":2,"maxNodes":80}
                        """.formatted(first, second, empty)));
        assertThat(graph.get("selectedPostingCount").asInt()).isEqualTo(3);
        assertThat(graph.get("processedPostingCount").asInt()).isEqualTo(3);
        assertThat(graph.get("taggedPostingCount").asInt()).isEqualTo(2);
        assertThat(graph.get("emptyPostingIds").get(0).asLong()).isEqualTo(empty);
        assertThat(graph.get("nodes")).hasSize(2);

        JsonNode spring = find(graph.get("nodes"), "label", "Spring Boot");
        JsonNode rag = find(graph.get("nodes"), "label", "RAG");
        assertThat(spring.get("documentCount").asInt()).isEqualTo(2);
        assertThat(spring.get("weightedCount").asInt()).isEqualTo(5);
        assertThat(spring.get("highCount").asInt()).isEqualTo(1);
        assertThat(spring.get("mediumCount").asInt()).isEqualTo(1);
        assertThat(rag.get("weightedCount").asInt()).isEqualTo(4);
        assertThat(graph.get("edges")).hasSize(1);
        assertThat(graph.get("edges").get(0).get("documentCount").asInt()).isEqualTo(2);
        assertThat(graph.get("edges").get(0).get("weightedCount").asInt()).isEqualTo(4);

        var posting = postingRepository.findByIdAndDeletedFalse(first).orElseThrow();
        posting.setRawJd(posting.getRawJd() + " 更新");
        postingRepository.saveAndFlush(posting);
        mockMvc.perform(get("/api/posting-knowledge/postings/{id}/terms", first))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.stale").value(true));

        JsonNode staleGraph = result(post("/api/posting-knowledge/graph")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"postingIds":[%d,%d],"minDocumentCount":1,"minEdgeDocumentCount":1,"maxNodes":80}
                        """.formatted(first, second)));
        assertThat(staleGraph.get("stalePostingCount").asInt()).isEqualTo(1);
        assertThat(staleGraph.get("taggedPostingCount").asInt()).isEqualTo(1);
        assertThat(staleGraph.get("nodes")).hasSize(3);
    }

    @Test
    void invalidTermBatchDoesNotReplaceExistingTerms() throws Exception {
        long companyId = postId("/api/companies", """
                {"name":"知识词校验公司","businessType":"UNKNOWN","productOwnership":"UNKNOWN"}
                """);
        long postingId = posting(companyId, "全栈开发", "Java和Vue");
        replace(postingId, """
                {"extractorVersion":"manual-v1","terms":[{"term":"Java","priority":"HIGH"}]}
                """);
        String terms = IntStream.range(0, 31)
                .mapToObj(index -> "{\"term\":\"词" + index + "\",\"priority\":\"LOW\"}")
                .collect(java.util.stream.Collectors.joining(","));
        mockMvc.perform(put("/api/posting-knowledge/postings/{id}/terms", postingId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"extractorVersion\":\"manual-v1\",\"terms\":[" + terms + "]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40001));
        mockMvc.perform(get("/api/posting-knowledge/postings/{id}/terms", postingId))
                .andExpect(jsonPath("$.result.terms.length()").value(1))
                .andExpect(jsonPath("$.result.terms[0].term").value("Java"));
    }

    private long posting(long companyId, String title, String rawJd) throws Exception {
        return postId("/api/postings", """
                {"companyId":%d,"title":"%s","direction":"AI_APPLICATION","source":"OTHER",
                 "rawJd":"%s","requiredSkills":"技术能力","bonusSkills":"加分能力",
                 "matchScore":30,"companyScore":10,"freshnessScore":10,"commuteScore":0,"salaryScore":10}
                """.formatted(companyId, title, rawJd));
    }

    private void replace(long postingId, String json) throws Exception {
        mockMvc.perform(put("/api/posting-knowledge/postings/{id}/terms", postingId)
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isOk());
    }

    private long postId(String url, String json) throws Exception {
        return result(post(url).contentType(MediaType.APPLICATION_JSON).content(json)).get("id").asLong();
    }

    private JsonNode result(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request)
            throws Exception {
        String body = mockMvc.perform(request).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        return objectMapper.readTree(body).get("result");
    }

    private JsonNode find(JsonNode rows, String field, String value) {
        for (JsonNode row : rows) if (value.equals(row.get(field).asText())) return row;
        throw new AssertionError("Missing " + value);
    }
}
