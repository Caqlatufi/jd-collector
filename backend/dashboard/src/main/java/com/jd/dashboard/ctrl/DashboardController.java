package com.jd.dashboard.ctrl;

import com.jd.dashboard.model.DashboardDtos;
import com.jd.dashboard.service.DashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.jd.common.rest.RestResultResponse;

@RestController
@RequestMapping("/api/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService service;

    @GetMapping("/today")
    public RestResultResponse<DashboardDtos.TodayResponse> today() {
        return RestResultResponse.of(service.today());
    }
}
