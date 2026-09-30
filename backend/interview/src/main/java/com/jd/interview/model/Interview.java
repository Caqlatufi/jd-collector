package com.jd.interview.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import com.jd.common.persistence.BaseEntity;

import java.time.LocalDateTime;

@Getter
@Setter
@Entity
@Table(name = "jd_interview")
public class Interview extends BaseEntity {

    @Column(nullable = false)
    private Long jobPostingId;

    @Column(nullable = false)
    private Integer roundNo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private InterviewEnums.Type type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private InterviewEnums.Format format;

    @Column(nullable = false)
    private LocalDateTime scheduledAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private InterviewEnums.Status status;

    @Column(length = 120)
    private String interviewer;

    @Column(columnDefinition = "TEXT")
    private String questions;

    @Column(columnDefinition = "TEXT")
    private String feedback;

    @Column(length = 500)
    private String nextStep;
}
