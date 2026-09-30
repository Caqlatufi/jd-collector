package com.jd.criteria;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jd.criteria.service.CriteriaService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;

@Configuration
@ComponentScan("com.jd.criteria.ctrl")
public class CriteriaConfig {

    @Bean
    CriteriaService criteriaService(ObjectMapper mapper,
            @Value("${jd-collector.criteria-file:}") String file) {
        return new CriteriaService(mapper, CriteriaService.resolveFile(file));
    }
}
