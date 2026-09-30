package com.jd.posting.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import com.jd.common.persistence.BaseEntity;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Getter
@Setter
@Entity
@Table(name = "jd_posting")
public class JobPosting extends BaseEntity {

    @Column(nullable = false)
    private Long companyId;

    @Column(nullable = false, length = 160)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private PostingEnums.Direction direction;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private PostingEnums.Source source;

    @Column(length = 1000)
    private String sourceUrl;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String rawJd;

    @Column(length = 255)
    private String location;

    private Integer salaryMinK;
    private Integer salaryMaxK;
    private Integer salaryMonths;
    private Integer experienceMin;
    private Integer experienceMax;
    private LocalDate publishedAt;
    private LocalDate recruiterActiveAt;
    private Boolean officialSynchronized;

    @Column(columnDefinition = "TEXT")
    private String requiredSkills;

    @Column(columnDefinition = "TEXT")
    private String bonusSkills;

    @Column(columnDefinition = "TEXT")
    private String matchPoints;

    @Column(columnDefinition = "TEXT")
    private String skillGaps;

    @Column(columnDefinition = "TEXT")
    private String riskNotes;

    @Column(nullable = false)
    private Boolean blockingRisk = false;

    @Column(nullable = false)
    private Integer matchScore;

    @Column(nullable = false)
    private Integer companyScore;

    @Column(nullable = false)
    private Integer freshnessScore;

    @Column(nullable = false)
    private Integer commuteScore;

    @Column(nullable = false)
    private Integer salaryScore;

    @Column(nullable = false)
    private Integer totalScore;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private PostingEnums.Tier tier;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private PostingEnums.Recommendation recommendation;

    @Column(length = 500)
    private String manualOverrideReason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private PostingEnums.Stage stage;

    private Long resumeVersionId;
    private LocalDateTime appliedAt;

    @Column(length = 500)
    private String nextAction;

    private LocalDateTime nextActionAt;
}
