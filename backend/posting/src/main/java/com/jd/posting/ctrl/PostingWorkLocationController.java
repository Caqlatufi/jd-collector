package com.jd.posting.ctrl;

import com.jd.common.rest.RestResultResponse;
import com.jd.company.model.CompanyDtos;
import com.jd.posting.repo.JobPostingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/postings/work-locations")
@RequiredArgsConstructor
public class PostingWorkLocationController {

    private final JobPostingRepository repository;

    @GetMapping
    @Transactional(readOnly = true)
    public RestResultResponse<List<CompanyDtos.PostingLocation>> list() {
        return RestResultResponse.of(repository.findWorkLocations().stream()
                .map(row -> new CompanyDtos.PostingLocation(row.getPostingId(), row.getCompanyId(), row.getAddress()))
                .toList());
    }
}
