package com.jd.posting.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.Setter;
import com.jd.common.persistence.BaseEntity;

import java.time.LocalDateTime;

@Getter
@Setter
@Entity
@Table(name = "jd_posting_term_profile", uniqueConstraints =
        @UniqueConstraint(name = "uk_posting_term_profile_posting", columnNames = "posting_id"))
public class JobPostingTermProfile extends BaseEntity {

    @Column(name = "posting_id", nullable = false)
    private Long postingId;

    @Column(name = "extractor_version", nullable = false, length = 40)
    private String extractorVersion;

    @Column(name = "source_hash", nullable = false, length = 64)
    private String sourceHash;

    @Column(name = "generated_at", nullable = false)
    private LocalDateTime generatedAt;
}
