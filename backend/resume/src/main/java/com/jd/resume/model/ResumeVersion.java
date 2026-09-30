package com.jd.resume.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import com.jd.common.persistence.BaseEntity;

@Getter
@Setter
@Entity
@Table(name = "jd_resume_version")
public class ResumeVersion extends BaseEntity {

    @Column(nullable = false, length = 120)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private ResumeType type;

    @Column(nullable = false, length = 50)
    private String versionLabel;

    /** Legacy compatibility only. New resumes are stored in contentMarkdown. */
    @Column(nullable = false, length = 500)
    private String relativePath;

    @Column(columnDefinition = "TEXT")
    private String contentMarkdown;

    @Column(nullable = false, length = 40)
    private String templateKey = "CLASSIC_BLUE";

    @Column(length = 500)
    private String photoUrl;

    @Column(nullable = false)
    private Boolean active = true;

    @Column
    private Boolean archived = false;

    @Column(columnDefinition = "TEXT")
    private String notes;
}
