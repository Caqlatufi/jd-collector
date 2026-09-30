package com.jd.posting.repo;

import com.jd.posting.model.JobPostingTerm;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface JobPostingTermRepository extends JpaRepository<JobPostingTerm, Long> {

    List<JobPostingTerm> findAllByProfileIdAndDeletedFalse(Long profileId);

    List<JobPostingTerm> findAllByProfileIdInAndDeletedFalse(Collection<Long> profileIds);

    @Modifying
    @Query("delete from JobPostingTerm term where term.profileId = :profileId")
    void deleteAllByProfileId(@Param("profileId") Long profileId);
}
