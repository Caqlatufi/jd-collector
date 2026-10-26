package com.jd.posting;

import com.jd.company.service.CompanyService;
import com.jd.posting.repo.JobPostingRepository;
import com.jd.posting.repo.JobPostingTermProfileRepository;
import com.jd.posting.repo.JobPostingTermRepository;
import com.jd.posting.repo.PostingDirectionRepository;
import com.jd.posting.repo.PostingGreetingRepository;
import com.jd.posting.service.PostingDirectionService;
import com.jd.posting.service.PostingKnowledgeService;
import com.jd.posting.service.PostingService;
import com.jd.resume.repo.ResumeVersionRepository;
import com.jd.resume.service.ResumeVersionService;
import com.jd.posting.service.CodexGreetingGenerator;
import com.jd.posting.service.GreetingGenerator;
import com.jd.posting.service.PostingGreetingService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@Configuration
@ComponentScan("com.jd.posting.ctrl")
@EntityScan("com.jd.posting.model")
@EnableJpaRepositories("com.jd.posting.repo")
public class PostingConfig {

    @Bean
    PostingDirectionService postingDirectionService(PostingDirectionRepository repository) {
        return new PostingDirectionService(repository);
    }

    @Bean
    GreetingGenerator greetingGenerator(ObjectMapper mapper,
            @Value("${jd-collector.recognition.project-root:}") String projectRoot,
            @Value("${jd-collector.recognition.node:node}") String node,
            @Value("${jd-collector.recognition.codex:}") String codex) {
        return new CodexGreetingGenerator(mapper, projectRoot, node, codex);
    }

    @Bean
    PostingGreetingService postingGreetingService(PostingService postings, ResumeVersionService resumes,
                                                  GreetingGenerator generator, PostingGreetingRepository repository,
                                                  ObjectMapper mapper) {
        return new PostingGreetingService(postings, resumes, generator, repository, mapper);
    }

    @Bean
    PostingService postingService(
            JobPostingRepository repository,
            CompanyService companyService,
            ResumeVersionRepository resumeVersionRepository,
            PostingDirectionService directionService,
            com.jd.company.service.CompanyAddressDiscoveryService addressDiscoveries
    ) {
        return new PostingService(repository, companyService, resumeVersionRepository, directionService, addressDiscoveries);
    }

    @Bean
    PostingKnowledgeService postingKnowledgeService(
            JobPostingRepository postingRepository,
            JobPostingTermProfileRepository profileRepository,
            JobPostingTermRepository termRepository,
            CompanyService companyService
    ) {
        return new PostingKnowledgeService(postingRepository, profileRepository, termRepository, companyService);
    }
}
