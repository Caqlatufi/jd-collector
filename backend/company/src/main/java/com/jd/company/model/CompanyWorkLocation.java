package com.jd.company.model;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Embeddable
public class CompanyWorkLocation {

    @Column(length = 120)
    private String label;

    @Column(nullable = false, length = 255)
    private String address;

    private Double longitude;

    private Double latitude;
}
