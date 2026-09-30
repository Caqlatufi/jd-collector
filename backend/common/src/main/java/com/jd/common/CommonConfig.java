package com.jd.common;

import com.jd.common.exception.ApplicationExceptionHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;

@Configuration
@ComponentScan("com.jd.system.ctrl")
public class CommonConfig {

    @Bean
    ApplicationExceptionHandler applicationExceptionHandler() {
        return new ApplicationExceptionHandler();
    }
}
