package com.jd.interview.repo;

import com.jd.interview.model.Interview;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface InterviewRepository extends JpaRepository<Interview, Long> {

    Optional<Interview> findByIdAndDeletedFalse(Long id);

    List<Interview> findAllByDeletedFalseOrderByScheduledAtAsc();

    List<Interview> findAllByDeletedFalseAndScheduledAtBetweenOrderByScheduledAtAsc(
            LocalDateTime from,
            LocalDateTime to
    );
}
