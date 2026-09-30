package com.jd.resume.ctrl;

import com.jd.common.rest.RestResultResponse;
import com.jd.resume.service.ResumeStarterService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class ResumeStarterController {
    private final ResumeStarterService service;

    @GetMapping("/api/resume-starter")
    public ResponseEntity<RestResultResponse<ResumeStarterService.Starter>> starter() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(RestResultResponse.of(service.read()));
    }

    @GetMapping({"/resume/photo.png", "${jd-collector.resume.legacy-photo-route:/resume/photo.png}"})
    public ResponseEntity<byte[]> photo() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.IMAGE_PNG)
                .body(service.photo());
    }
}
