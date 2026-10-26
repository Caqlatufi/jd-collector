package com.jd.posting.repo;

import com.jd.posting.model.PostingDirection;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PostingDirectionRepository extends JpaRepository<PostingDirection, Long> {
    List<PostingDirection> findAllByDeletedFalseOrderByIdAsc();
}
