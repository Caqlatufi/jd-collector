package com.jd.posting.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class PostingDirectionDtos {
    private PostingDirectionDtos() { }

    public record Option(String value, String label, String description) { }

    public record Proposal(
            @NotBlank @Size(max = 60) String label,
            @NotBlank @Size(max = 400) String description,
            @NotBlank @Size(max = 500) String reason
    ) { }
}
