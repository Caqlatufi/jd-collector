package com.jd.criteria.model;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

public final class CriteriaDtos {
    private CriteriaDtos() {
    }

    public enum Status { PENDING, CONFIRMED }

    public record Answer(
            @NotBlank @Size(max = 100) String id,
            @Size(max = 10000) String value,
            @NotBlank @Size(max = 50) String kind,
            @NotNull Status status
    ) {
    }

    public record SaveRequest(
            @NotNull @Pattern(regexp = "[a-f0-9]{64}") String revision,
            @NotNull @Size(min = 1, max = 500) List<@NotNull @Valid Answer> answers
    ) {
    }

    public record Response(String revision, JsonNode document) {
    }
}
