package com.jd.common.exception;

import lombok.Getter;

@Getter
public enum ErrorCode {
    VALIDATION_ERROR(40001),
    BUSINESS_ERROR(40002),
    NOT_FOUND(40401),
    CONFLICT(40901),
    INTERNAL_ERROR(50001);

    private final int code;

    ErrorCode(int code) {
        this.code = code;
    }
}
