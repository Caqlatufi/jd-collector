package com.jd.posting.model;

public final class PostingEnums {

    private PostingEnums() {
    }

    public enum Direction {
        JAVA_BACKEND,
        PLATFORM_BACKEND,
        AI_APPLICATION,
        FULL_STACK,
        AI_TOOLING,
        TEST_PLATFORM
    }

    public enum Source {
        BOSS, LIEPIN, OFFICIAL, OTHER
    }

    public enum Tier {
        S, A, B, SKIP
    }

    public enum Recommendation {
        DIRECT_APPLY, CONTACT_FIRST, CUSTOM_DEMO, WAIT_HC, SKIP
    }

    public enum Stage {
        COLLECTED,
        SCREENED,
        TO_CONTACT,
        READY_TO_APPLY,
        APPLIED,
        HR_SCREEN,
        WRITTEN_TEST,
        INTERVIEW,
        OFFER,
        ACCEPTED,
        REJECTED,
        WITHDRAWN,
        CLOSED
    }
}
