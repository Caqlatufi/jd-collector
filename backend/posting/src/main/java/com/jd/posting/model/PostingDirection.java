package com.jd.posting.model;

import com.jd.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "jd_posting_direction")
public class PostingDirection extends BaseEntity {
    @Column(nullable = false, unique = true, length = 40)
    private String code;

    @Column(nullable = false, length = 60)
    private String label;

    @Column(nullable = false, unique = true, length = 60)
    private String normalizedLabel;

    @Column(nullable = false, length = 400)
    private String description;

    @Column(nullable = false, length = 500)
    private String reason;
}
