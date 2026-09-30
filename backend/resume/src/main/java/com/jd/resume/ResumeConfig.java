package com.jd.resume;

import com.jd.resume.repo.ResumeVersionRepository;
import com.jd.resume.repo.ResumeContentBlockRepository;
import com.jd.resume.service.ResumeBlockService;
import com.jd.resume.service.ResumeVersionService;
import com.jd.resume.service.ResumeStarterService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@Configuration
@ComponentScan("com.jd.resume.ctrl")
@EntityScan("com.jd.resume.model")
@EnableJpaRepositories("com.jd.resume.repo")
public class ResumeConfig {

    @Bean
    ResumeStarterService resumeStarterService(
            @Value("${jd-collector.resume.starter-file:}") String starterFile,
            @Value("${jd-collector.resume.photo-file:}") String photoFile) {
        return new ResumeStarterService(starterFile, photoFile);
    }

    @Bean
    ResumeBlockService resumeBlockService(ResumeContentBlockRepository repository) {
        return new ResumeBlockService(repository);
    }

    @Bean
    ResumeVersionService resumeVersionService(ResumeVersionRepository repository, ResumeBlockService blockService) {
        return new ResumeVersionService(repository, blockService);
    }
}
