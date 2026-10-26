package com.jd.posting.model;

public final class PostingEnums {

    private PostingEnums() {
    }

    public enum Source {
        BOSS, LIEPIN, OFFICIAL, OTHER
    }

    public enum BossCompetitionStatus {
        AVAILABLE, UNAVAILABLE, CLOSED
    }

    public enum SortBy {
        SCORE, BOSS_COMPETITION
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
        MESSAGE_SENT,
        WAITING_COMMUNICATION,
        CONTACT_NOT_SUITABLE,
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
