package com.jd.posting.ctrl;

import com.jd.common.rest.RestResultResponse;
import com.jd.posting.model.PostingDirectionDtos;
import com.jd.posting.service.PostingDirectionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/posting-directions")
public class PostingDirectionController {
    private final PostingDirectionService service;

    @GetMapping
    public RestResultResponse<List<PostingDirectionDtos.Option>> options() {
        return RestResultResponse.of(service.options());
    }
}
