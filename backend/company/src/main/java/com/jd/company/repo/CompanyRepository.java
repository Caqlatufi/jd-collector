package com.jd.company.repo;

import com.jd.company.model.Company;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CompanyRepository extends JpaRepository<Company, Long> {

    @Query("""
            select c from Company c
            where c.deleted = false
              and (:keyword = '' or lower(c.name) like lower(concat('%', :keyword, '%'))
                   or lower(coalesce(c.alias, '')) like lower(concat('%', :keyword, '%')))
            """)
    Page<Company> search(@Param("keyword") String keyword, Pageable pageable);

    Optional<Company> findByIdAndDeletedFalse(Long id);

    Optional<Company> findFirstByNameIgnoreCaseAndDeletedFalse(String name);
}
