package com.jd.pipeline;

import com.jd.pipeline.event.repo.StageEventRepository;
import com.jd.pipeline.service.PipelineService;
import com.jd.posting.repo.JobPostingRepository;
import com.jd.posting.service.PostingService;
import com.jd.resume.service.ResumeVersionService;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@Configuration
@ComponentScan("com.jd.pipeline.ctrl")
@EntityScan("com.jd.pipeline.event.model")
@EnableJpaRepositories("com.jd.pipeline.event.repo")
public class PipelineConfig {

    @Bean
    PipelineService pipelineService(
            PostingService postingService,
            JobPostingRepository postingRepository,
            StageEventRepository eventRepository,
            ResumeVersionService resumeVersionService
    ) {
        return new PipelineService(postingService, postingRepository, eventRepository, resumeVersionService);
    }
}
