package com.jd.dashboard;

import com.jd.company.service.CompanyService;
import com.jd.dashboard.service.DashboardService;
import com.jd.interview.repo.InterviewRepository;
import com.jd.pipeline.event.repo.StageEventRepository;
import com.jd.posting.repo.JobPostingRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;
import java.time.ZoneId;

@Configuration
@ComponentScan("com.jd.dashboard.ctrl")
public class DashboardConfig {

    @Bean
    Clock dashboardClock() {
        return Clock.system(ZoneId.of("Asia/Shanghai"));
    }

    @Bean
    DashboardService dashboardService(
            JobPostingRepository postingRepository,
            InterviewRepository interviewRepository,
            StageEventRepository eventRepository,
            CompanyService companyService,
            Clock dashboardClock
    ) {
        return new DashboardService(postingRepository, interviewRepository, eventRepository, companyService, dashboardClock);
    }
}
