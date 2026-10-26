package com.jd.posting.model;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.util.List;

public final class GreetingDtos {
    public static final String MODEL = "gpt-6.1-sol";
    public static final String REASONING_EFFORT = "medium";

    private GreetingDtos() {
    }

    public record Request(@NotNull @Positive Long resumeVersionId) {
    }

    public record Input(String companyName, String title, String jd, String resume) {
    }

    public record Evidence(String jdQuote, String resumeQuote) {
    }

    public record Draft(String greeting, List<Evidence> evidence) {
    }

    public record Response(Long postingId, Long resumeVersionId, String resumeName, String versionLabel,
                           String greeting, int characterCount, List<Evidence> evidence,
                           String model, String reasoningEffort) {
    }
}
