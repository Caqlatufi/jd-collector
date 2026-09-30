package com.jd.resume.repo;

import com.jd.resume.model.ResumeContentBlock;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ResumeContentBlockRepository extends JpaRepository<ResumeContentBlock, Long> {

    List<ResumeContentBlock> findAllByResumeVersionIdAndDeletedFalseOrderBySortOrderAsc(Long resumeVersionId);

    long countByResumeVersionIdAndDeletedFalse(Long resumeVersionId);

    void deleteAllByResumeVersionId(Long resumeVersionId);
}
