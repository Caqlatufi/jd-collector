package com.jd.dashboard;

import com.jd.company.service.CompanyService;
import com.jd.dashboard.service.DashboardService;
import com.jd.interview.repo.InterviewRepository;
import com.jd.pipeline.event.repo.StageEventRepository;
import com.jd.posting.repo.JobPostingRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;

@Configuration
@ComponentScan("com.jd.dashboard.ctrl")
public class DashboardConfig {

    @Bean
    DashboardService dashboardService(
            JobPostingRepository postingRepository,
            InterviewRepository interviewRepository,
            StageEventRepository eventRepository,
            CompanyService companyService
    ) {
        return new DashboardService(postingRepository, interviewRepository, eventRepository, companyService);
    }
}
