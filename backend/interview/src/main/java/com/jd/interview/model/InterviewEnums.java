package com.jd.interview.model;

public final class InterviewEnums {

    private InterviewEnums() {
    }

    public enum Type {
        HR, TECHNICAL, MANAGER, FINAL, OTHER
    }

    public enum Format {
        ONLINE, ONSITE, PHONE
    }

    public enum Status {
        SCHEDULED, COMPLETED, CANCELLED, NO_SHOW
    }
}
