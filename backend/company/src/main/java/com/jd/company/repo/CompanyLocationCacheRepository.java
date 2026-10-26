package com.jd.company.repo;

import com.jd.company.model.CompanyLocationCache;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CompanyLocationCacheRepository extends JpaRepository<CompanyLocationCache, Long> {
    Optional<CompanyLocationCache> findByAddress(String address);
}
