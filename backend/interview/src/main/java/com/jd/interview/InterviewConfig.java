package com.jd.interview;

import com.jd.company.service.CompanyService;
import com.jd.interview.repo.InterviewRepository;
import com.jd.interview.service.InterviewService;
import com.jd.pipeline.event.repo.StageEventRepository;
import com.jd.posting.repo.JobPostingRepository;
import com.jd.posting.service.PostingService;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@Configuration
@ComponentScan("com.jd.interview.ctrl")
@EntityScan("com.jd.interview.model")
@EnableJpaRepositories("com.jd.interview.repo")
public class InterviewConfig {

    @Bean
    InterviewService interviewService(
            InterviewRepository repository,
            PostingService postingService,
            JobPostingRepository postingRepository,
            StageEventRepository eventRepository,
            CompanyService companyService
    ) {
        return new InterviewService(repository, postingService, postingRepository, eventRepository, companyService);
    }
}
