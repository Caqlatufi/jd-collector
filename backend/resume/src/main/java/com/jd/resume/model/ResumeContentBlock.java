package com.jd.resume.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import com.jd.common.persistence.BaseEntity;

@Getter
@Setter
@Entity
@Table(name = "jd_resume_content_block")
public class ResumeContentBlock extends BaseEntity {

    @Column(nullable = false)
    private Long resumeVersionId;

    @Column(nullable = false, length = 80)
    private String sectionKey;

    @Column(length = 200)
    private String heading;

    @Column(nullable = false)
    private Integer headingLevel;

    @Column(nullable = false)
    private Integer chunkIndex;

    @Column(nullable = false)
    private Integer sortOrder;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String contentMarkdown;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String contentPlainText;

    @Column(nullable = false)
    private Integer characterCount;

    @Column(nullable = false, length = 64)
    private String contentHash;
}
