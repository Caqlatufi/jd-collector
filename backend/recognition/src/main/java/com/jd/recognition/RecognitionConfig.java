package com.jd.recognition;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jd.recognition.service.RecognitionService;
import com.jd.recognition.service.PostingImportService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
@ComponentScan("com.jd.recognition.ctrl")
public class RecognitionConfig {

    @Bean
    com.jd.recognition.service.CompanyAddressTaskService companyAddressTaskService(ObjectMapper mapper,
            @Value("${jd-collector.recognition.project-root:}") String root,
            @Value("${jd-collector.company-address.work-directory:}") String directory,
            @Value("${jd-collector.company-address.enabled:true}") boolean enabled,
            @Value("${jd-collector.recognition.node:node}") String node,
            @Value("${jd-collector.recognition.codex:}") String codex,
            @Value("${jd-collector.recognition.model:gpt-6-astra}") String model,
            @Value("${jd-collector.recognition.reasoning-effort:medium}") String effort,
            @Value("${jd-collector.recognition.timeout-seconds:120}") int timeout,
            @Value("${jd-collector.posting-import.api-base:http://127.0.0.1:7890/jd-collector/api}") String apiBase) {
        return new com.jd.recognition.service.CompanyAddressTaskService(mapper, root, directory, enabled, node, codex,
                model, effort, timeout, apiBase);
    }
    @Bean
    PostingImportService postingImportService(ObjectMapper mapper,
            @Value("${jd-collector.recognition.project-root:}") String root,
            @Value("${jd-collector.posting-import.work-directory:}") String directory,
            @Value("${jd-collector.posting-import.enabled:true}") boolean enabled,
            @Value("${jd-collector.recognition.node:node}") String node,
            @Value("${jd-collector.recognition.codex:}") String codex,
            @Value("${jd-collector.recognition.model:gpt-6-astra}") String model,
            @Value("${jd-collector.recognition.reasoning-effort:medium}") String effort,
            @Value("${jd-collector.recognition.timeout-seconds:120}") int timeout,
            @Value("${jd-collector.posting-import.api-base:http://127.0.0.1:7890/jd-collector/api}") String apiBase) {
        return new PostingImportService(mapper, root, directory, enabled, node, codex, model, effort, timeout, apiBase);
    }

    @Bean
    RecognitionService recognitionService(ObjectMapper mapper,
            @Value("${jd-collector.recognition.project-root:}") String projectRoot,
            @Value("${jd-collector.recognition.work-directory:}") String directory,
            @Value("${jd-collector.recognition.enabled:true}") boolean enabled,
            @Value("${jd-collector.recognition.concurrency:2}") int concurrency,
            @Value("${jd-collector.recognition.max-attempts:2}") int maxAttempts,
            @Value("${jd-collector.recognition.timeout-seconds:120}") int timeout,
            @Value("${jd-collector.recognition.node:node}") String node,
            @Value("${jd-collector.recognition.codex:}") String codex,
            @Value("${jd-collector.recognition.model:gpt-6-astra}") String model,
            @Value("${jd-collector.recognition.reasoning-effort:medium}") String reasoningEffort) {
        return new RecognitionService(mapper, projectRoot, directory, enabled, concurrency, maxAttempts, timeout,
                node, codex, model, reasoningEffort);
    }
}
