package com.jd.posting.repo;

import com.jd.posting.model.JobPosting;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface JobPostingRepository extends JpaRepository<JobPosting, Long>, JpaSpecificationExecutor<JobPosting> {

    Optional<JobPosting> findByIdAndDeletedFalse(Long id);

    List<JobPosting> findAllByDeletedFalseOrderByUpdatedAtDesc();

    long countByCompanyIdAndDeletedFalse(Long companyId);
}
