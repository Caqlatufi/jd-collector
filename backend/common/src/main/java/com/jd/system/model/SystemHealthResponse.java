package com.jd.system.model;

import java.time.LocalDateTime;

public record SystemHealthResponse(
        String service,
        String status,
        String framework,
        LocalDateTime timestamp
) {
}
