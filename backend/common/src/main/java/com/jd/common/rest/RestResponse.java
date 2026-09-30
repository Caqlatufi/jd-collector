package com.jd.common.rest;

public record RestResponse(int code, String msg) {
    public static RestResponse error(int code, String message) {
        return new RestResponse(code, message);
    }
}
