package com.jd.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PostingImportHttpIntegrationTest {
    private static final Path DIRECTORY = temporaryDirectory();
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;

    private static Path temporaryDirectory() {
        try { return Files.createTempDirectory("jd-import-http-"); }
        catch (IOException e) { throw new IllegalStateException(e); }
    }

    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        registry.add("jd-collector.posting-import.work-directory", DIRECTORY::toString);
        registry.add("jd-collector.posting-import.enabled", () -> "false");
    }

    @Test void validatesUrlAndReturnsDurableTaskAndRejectsRunningRetry() throws Exception {
        mvc.perform(post("/api/posting-imports").contentType("application/json").content("{\"sourceUrl\":\"javascript:alert(1)\"}"))
                .andExpect(status().isBadRequest());
        String body = mvc.perform(post("/api/posting-imports").contentType("application/json")
                .content("{\"sourceUrl\":\"https://www.zhipin.com/job_detail/httpfixture~.html?from=search\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode task = mapper.readTree(body).path("result");
        assertEquals("QUEUED", task.path("status").asText());
        assertEquals("https://www.zhipin.com/job_detail/httpfixture~.html", task.path("sourceUrl").asText());
        String id = task.path("taskId").asText();
        String list = mvc.perform(get("/api/posting-imports")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals(id, mapper.readTree(list).path("result").get(0).path("taskId").asText());
        mvc.perform(post("/api/posting-imports/" + id + "/retry")).andExpect(status().isConflict());
        mvc.perform(get("/api/posting-imports/" + id)).andExpect(status().isOk());
        String official = "https://nio.jobs.feishu.cn/index/position/7697199510845622566/detail";
        String officialBody = mvc.perform(post("/api/posting-imports").contentType("application/json")
                .content(mapper.writeValueAsString(java.util.Map.of("sourceUrl", official))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals(official, mapper.readTree(officialBody).path("result").path("sourceUrl").asText());
    }
}
