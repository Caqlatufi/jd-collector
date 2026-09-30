package com.jd.posting.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.Setter;
import com.jd.common.persistence.BaseEntity;

@Getter
@Setter
@Entity
@Table(name = "jd_posting_term", uniqueConstraints =
        @UniqueConstraint(name = "uk_posting_term_profile_word", columnNames = {"profile_id", "normalized_term"}))
public class JobPostingTerm extends BaseEntity {

    @Column(name = "profile_id", nullable = false)
    private Long profileId;

    @Column(name = "term", nullable = false, length = 100)
    private String term;

    @Column(name = "normalized_term", nullable = false, length = 100)
    private String normalizedTerm;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PostingKnowledgeEnums.Priority priority;
}
