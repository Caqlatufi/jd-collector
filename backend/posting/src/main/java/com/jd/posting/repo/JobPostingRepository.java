package com.jd.posting.repo;

import com.jd.posting.model.JobPosting;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Optional;

public interface JobPostingRepository extends JpaRepository<JobPosting, Long>, JpaSpecificationExecutor<JobPosting> {

    interface WorkLocationView {
        Long getPostingId();
        Long getCompanyId();
        String getAddress();
    }

    @Query("""
            select p.id as postingId, p.companyId as companyId, p.location as address
            from JobPosting p where p.deleted = false and p.location is not null
            order by p.companyId, p.id
            """)
    List<WorkLocationView> findWorkLocations();

    Optional<JobPosting> findByIdAndDeletedFalse(Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select posting from JobPosting posting where posting.id = :id and posting.deleted = false")
    Optional<JobPosting> findByIdForUpdate(@Param("id") Long id);

    List<JobPosting> findAllByDeletedFalseOrderByUpdatedAtDesc();

    long countByCompanyIdAndDeletedFalse(Long companyId);
}
