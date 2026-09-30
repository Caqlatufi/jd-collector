package com.jd.account.repo;

import com.jd.account.model.PlatformAccount;
import com.jd.account.model.RecruitmentPlatform;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface PlatformAccountRepository extends JpaRepository<PlatformAccount, Long> {
    Optional<PlatformAccount> findByPlatform(RecruitmentPlatform platform);
}
