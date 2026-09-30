package com.jd.common.rest;

public record RestResultResponse<T>(int code, String msg, T result) {
    public static <T> RestResultResponse<T> of(T result) {
        return new RestResultResponse<>(200, "ok", result);
    }
}
