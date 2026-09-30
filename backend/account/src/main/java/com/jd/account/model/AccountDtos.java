package com.jd.account.model;

import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public class AccountDtos {
    public record SaveRequest(
            @Size(max = 200, message = "账号最多200字") String username,
            @Size(max = 500, message = "密码最多500字") String password,
            @Size(max = 1000, message = "备注最多1000字") String notes) {}
    public record Response(RecruitmentPlatform platform, String name, String loginUrl, String homeUrl,
                           String loginHint, String username, boolean hasPassword, boolean hasSession,
                           String sessionStatus, LocalDateTime capturedAt, LocalDateTime verifiedAt,
                           int cookieCount, int storageCount, boolean browserOpen, String lastMessage,
                           String notes) {}
}
