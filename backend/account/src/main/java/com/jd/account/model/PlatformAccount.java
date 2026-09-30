package com.jd.account.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import com.jd.common.persistence.BaseEntity;
import java.time.LocalDateTime;

@Getter
@Setter
@Entity
@Table(name = "jd_platform_account")
public class PlatformAccount extends BaseEntity {
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, unique = true, length = 30)
    private RecruitmentPlatform platform;
    @Column(length = 200)
    private String username;
    @Column(columnDefinition = "TEXT")
    private String passwordCipher;
    @Column(columnDefinition = "LONGTEXT")
    private String sessionCipher;
    @Column(nullable = false, length = 30)
    private String sessionStatus = "EMPTY";
    private LocalDateTime capturedAt;
    private LocalDateTime verifiedAt;
    private int cookieCount;
    private int storageCount;
    @Column(length = 500)
    private String lastMessage;
    @Column(length = 1000)
    private String notes;
}
