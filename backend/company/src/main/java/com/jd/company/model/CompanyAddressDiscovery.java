package com.jd.company.model;

import com.jd.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "jd_company_address_discovery")
@Getter
@Setter
public class CompanyAddressDiscovery extends BaseEntity {
    @Column(nullable = false) private Long companyId;
    private Long postingId;
    @Column(nullable = false, length = 255) private String address;
    @Column(nullable = false, length = 16) private String sourceType;
    @Column(nullable = false, length = 2048) private String sourceUrl;
    @Column(nullable = false, length = 2000) private String evidenceText;
    @Column(nullable = false, length = 36) private String taskId;
    @Column(nullable = false, unique = true, length = 64) private String fingerprint;
}
