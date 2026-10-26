package com.jd.company.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import lombok.Getter;
import lombok.Setter;
import com.jd.common.persistence.BaseEntity;
import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@Entity
@Table(name = "jd_company")
public class Company extends BaseEntity {

    @Column(nullable = false, length = 120)
    private String name;

    @Column(length = 120)
    private String alias;

    @Column(length = 2048)
    private String officialApplicationUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private CompanyTypes.BusinessType businessType = CompanyTypes.BusinessType.UNKNOWN;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private CompanyTypes.ProductOwnership productOwnership = CompanyTypes.ProductOwnership.UNKNOWN;

    @Column(length = 255)
    private String address;

    @ElementCollection
    @CollectionTable(name = "jd_company_work_location", joinColumns = @JoinColumn(name = "company_id"))
    @OrderColumn(name = "location_order")
    private List<CompanyWorkLocation> workLocations = new ArrayList<>();

    private Integer commuteMinutes;

    private Integer qualityScore;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(nullable = false)
    private Boolean active = true;
}
