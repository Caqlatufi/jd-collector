package com.jd.pipeline.event.repo;

import com.jd.pipeline.event.model.StageEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StageEventRepository extends JpaRepository<StageEvent, Long> {

    List<StageEvent> findAllByJobPostingIdAndDeletedFalseOrderByOccurredAtDesc(Long jobPostingId);

    List<StageEvent> findAllByDeletedFalse();
}
