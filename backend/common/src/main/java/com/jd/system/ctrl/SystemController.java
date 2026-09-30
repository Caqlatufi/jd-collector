package com.jd.system.ctrl;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.jd.common.rest.RestResultResponse;
import com.jd.system.model.SystemHealthResponse;

import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/system")
public class SystemController {

    @GetMapping("/health")
    public RestResultResponse<SystemHealthResponse> health() {
        return RestResultResponse.of(new SystemHealthResponse(
                "jd-collector",
                "UP",
                "jd-collector:common",
                LocalDateTime.now()
        ));
    }
}
