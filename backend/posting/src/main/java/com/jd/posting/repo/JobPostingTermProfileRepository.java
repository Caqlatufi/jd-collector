package com.jd.posting.repo;

import com.jd.posting.model.JobPostingTermProfile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface JobPostingTermProfileRepository extends JpaRepository<JobPostingTermProfile, Long> {

    Optional<JobPostingTermProfile> findByPostingIdAndDeletedFalse(Long postingId);

    List<JobPostingTermProfile> findAllByPostingIdInAndDeletedFalse(Collection<Long> postingIds);
}
