package com.jd.pipeline.event.model;

import com.jd.posting.model.PostingEnums;
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
@Table(name = "jd_stage_event")
public class StageEvent extends BaseEntity {

    @Column(nullable = false)
    private Long jobPostingId;

    @Enumerated(EnumType.STRING)
    @Column(length = 30)
    private PostingEnums.Stage fromStage;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private PostingEnums.Stage toStage;

    @Column(nullable = false)
    private LocalDateTime occurredAt;

    @Column(length = 1000)
    private String note;
}
