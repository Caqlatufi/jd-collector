package com.jd.posting.model;

import com.jd.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "jd_posting_greeting", indexes = {
        @Index(name = "idx_greeting_posting_resume", columnList = "postingId,resumeVersionId,id")
})
public class PostingGreeting extends BaseEntity {
    @Column(nullable = false)
    private Long postingId;

    @Column(nullable = false)
    private Long resumeVersionId;

    // Keep the generated text, evidence and resume labels as one immutable snapshot.
    @Column(nullable = false, columnDefinition = "LONGTEXT")
    private String resultJson;
}
