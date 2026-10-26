package com.jd.company.model;

import com.jd.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "jd_company_location_cache")
public class CompanyLocationCache extends BaseEntity {
    @Column(nullable = false, unique = true, length = 255)
    private String address;
    private Double longitude;
    private Double latitude;
    @Column(length = 255)
    private String matchedName;
}
