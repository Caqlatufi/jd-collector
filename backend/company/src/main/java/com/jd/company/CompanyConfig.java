package com.jd.company;

import com.jd.company.repo.CompanyRepository;
import com.jd.company.service.CompanyService;
import com.jd.company.service.CompanyGeocodingService;
import com.jd.company.repo.CompanyLocationCacheRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@Configuration
@ComponentScan("com.jd.company.ctrl")
@EntityScan("com.jd.company.model")
@EnableJpaRepositories("com.jd.company.repo")
public class CompanyConfig {

    @Bean
    com.jd.company.service.CompanyAddressDiscoveryService companyAddressDiscoveryService(CompanyService companies,
            com.jd.company.repo.CompanyAddressDiscoveryRepository repository) {
        return new com.jd.company.service.CompanyAddressDiscoveryService(companies, repository);
    }

    @Bean
    CompanyGeocodingService companyGeocodingService(CompanyLocationCacheRepository repository, ObjectMapper mapper,
            @Value("${jd-collector.company.geocoder-url:https://photon.komoot.io/api/}") String endpoint) {
        return new CompanyGeocodingService(repository, mapper, endpoint);
    }

    @Bean
    CompanyService companyService(CompanyRepository repository) {
        return new CompanyService(repository);
    }
}
