package com.jd.posting.repo;

import com.jd.posting.model.PostingGreeting;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PostingGreetingRepository extends JpaRepository<PostingGreeting, Long> {
    Optional<PostingGreeting> findFirstByPostingIdAndDeletedFalseOrderByIdDesc(Long postingId);

    Optional<PostingGreeting> findFirstByPostingIdAndResumeVersionIdAndDeletedFalseOrderByIdDesc(
            Long postingId, Long resumeVersionId);
}
