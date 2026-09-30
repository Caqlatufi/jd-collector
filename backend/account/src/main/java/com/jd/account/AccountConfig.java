package com.jd.account;

import com.jd.account.repo.PlatformAccountRepository;
import com.jd.account.service.AccountService;
import com.jd.account.service.PlatformCatalog;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@Configuration
@ComponentScan("com.jd.account.ctrl")
@EntityScan("com.jd.account.model")
@EnableJpaRepositories("com.jd.account.repo")
public class AccountConfig {
    @Bean
    PlatformCatalog platformCatalog() {
        return new PlatformCatalog();
    }

    @Bean
    AccountService accountService(PlatformAccountRepository repository, PlatformCatalog catalog) {
        return new AccountService(repository, catalog);
    }
}
