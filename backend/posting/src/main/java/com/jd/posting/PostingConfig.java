package com.jd.posting;

import com.jd.company.service.CompanyService;
import com.jd.posting.repo.JobPostingRepository;
import com.jd.posting.repo.JobPostingTermProfileRepository;
import com.jd.posting.repo.JobPostingTermRepository;
import com.jd.posting.service.PostingKnowledgeService;
import com.jd.posting.service.PostingService;
import com.jd.resume.repo.ResumeVersionRepository;
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
    PostingService postingService(
            JobPostingRepository repository,
            CompanyService companyService,
            ResumeVersionRepository resumeVersionRepository
    ) {
        return new PostingService(repository, companyService, resumeVersionRepository);
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
