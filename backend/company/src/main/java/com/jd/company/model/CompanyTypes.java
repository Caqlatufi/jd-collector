package com.jd.company.model;

public final class CompanyTypes {

    private CompanyTypes() {
    }

    public enum BusinessType {
        PRODUCT, TO_B_PRODUCT, DELIVERY, OUTSOURCING, UNKNOWN
    }

    public enum ProductOwnership {
        HIGH, MEDIUM, LOW, UNKNOWN
    }
}
