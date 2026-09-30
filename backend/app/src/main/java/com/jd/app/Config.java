package com.jd.app;

import com.jd.common.CommonConfig;
import com.jd.criteria.CriteriaConfig;
import com.jd.account.AccountConfig;
import com.jd.company.CompanyConfig;
import com.jd.dashboard.DashboardConfig;
import com.jd.export.ExportConfig;
import com.jd.interview.InterviewConfig;
import com.jd.pipeline.PipelineConfig;
import com.jd.posting.PostingConfig;
import com.jd.resume.ResumeConfig;
import com.jd.recognition.RecognitionConfig;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

@Configuration
@Import({
        CommonConfig.class,
        CompanyConfig.class,
        ResumeConfig.class,
        PostingConfig.class,
        PipelineConfig.class,
        InterviewConfig.class,
        DashboardConfig.class,
        ExportConfig.class,
        AccountConfig.class,
        CriteriaConfig.class,
        RecognitionConfig.class
})
public class Config {
}
