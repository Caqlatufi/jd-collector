package com.jd.resume.repo;

import com.jd.resume.model.ResumeType;
import com.jd.resume.model.ResumeVersion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ResumeVersionRepository extends JpaRepository<ResumeVersion, Long> {

    List<ResumeVersion> findAllByDeletedFalseOrderByUpdatedAtDesc();

    Optional<ResumeVersion> findByIdAndDeletedFalse(Long id);

    List<ResumeVersion> findAllByTypeAndActiveTrueAndDeletedFalse(ResumeType type);
}
