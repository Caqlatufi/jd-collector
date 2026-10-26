package com.jd.company.repo;

import com.jd.company.model.CompanyAddressDiscovery;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface CompanyAddressDiscoveryRepository extends JpaRepository<CompanyAddressDiscovery, Long> {
    Optional<CompanyAddressDiscovery> findByFingerprintAndDeletedFalse(String fingerprint);

    @Query("""
            select d from CompanyAddressDiscovery d, Company c
            where d.companyId = c.id and c.deleted = false and d.deleted = false
            order by d.id
            """)
    List<CompanyAddressDiscovery> visible();
}
