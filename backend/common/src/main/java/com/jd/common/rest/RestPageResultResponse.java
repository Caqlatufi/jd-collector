package com.jd.common.rest;

import org.springframework.data.domain.Page;

import java.util.List;

public record RestPageResultResponse<T>(int code, String msg, PageInfo page, List<T> result) {
    public record PageInfo(int number, int size, long totalElements, int totalPages) {
    }

    public static <T> RestPageResultResponse<T> of(Page<T> page) {
        return new RestPageResultResponse<>(200, "ok",
                new PageInfo(page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages()),
                page.getContent());
    }
}
