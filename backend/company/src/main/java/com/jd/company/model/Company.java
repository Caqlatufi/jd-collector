package com.jd.company.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import com.jd.common.persistence.BaseEntity;

@Getter
@Setter
@Entity
@Table(name = "jd_company")
public class Company extends BaseEntity {

    @Column(nullable = false, length = 120)
    private String name;

    @Column(length = 120)
    private String alias;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private CompanyTypes.BusinessType businessType = CompanyTypes.BusinessType.UNKNOWN;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private CompanyTypes.ProductOwnership productOwnership = CompanyTypes.ProductOwnership.UNKNOWN;

    @Column(length = 255)
    private String address;

    private Integer commuteMinutes;

    private Integer qualityScore;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(nullable = false)
    private Boolean active = true;
}
