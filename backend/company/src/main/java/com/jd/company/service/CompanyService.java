package com.jd.company.service;

import com.jd.common.exception.BusinessException;
import com.jd.common.exception.ErrorCode;
import com.jd.company.model.Company;
import com.jd.company.model.CompanyDtos;
import com.jd.company.repo.CompanyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;

@RequiredArgsConstructor
public class CompanyService {

    private final CompanyRepository repository;
    @Transactional(readOnly = true)
    public Page<CompanyDtos.Response> search(String keyword, int number, int size) {
        PageRequest pageable = PageRequest.of(Math.max(0, number - 1), Math.min(Math.max(size, 1), 100),
                Sort.by(Sort.Direction.DESC, "updatedAt"));
        return repository.search(keyword == null ? "" : keyword.trim(), pageable).map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public CompanyDtos.Response get(Long id) {
        return toResponse(getEntity(id));
    }

    @Transactional
    public CompanyDtos.Response create(CompanyDtos.SaveRequest request) {
        Company company = new Company();
        apply(company, request);
        ensureUniqueName(company);
        return toResponse(repository.save(company));
    }

    @Transactional
    public CompanyDtos.Response update(Long id, CompanyDtos.SaveRequest request) {
        Company company = getEntity(id);
        apply(company, request);
        ensureUniqueName(company);
        return toResponse(repository.save(company));
    }

    public Company getEntity(Long id) {
        return repository.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, "公司不存在"));
    }

    private void ensureUniqueName(Company company) {
        repository.findFirstByNameIgnoreCaseAndDeletedFalse(company.getName())
                .filter(existing -> !existing.getId().equals(company.getId()))
                .ifPresent(existing -> {
                    throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "已存在同名公司");
                });
    }

    private void apply(Company company, CompanyDtos.SaveRequest request) {
        company.setName(request.name().trim());
        company.setAlias(trimToNull(request.alias()));
        company.setBusinessType(request.businessType());
        company.setProductOwnership(request.productOwnership());
        company.setAddress(trimToNull(request.address()));
        company.setCommuteMinutes(request.commuteMinutes());
        company.setQualityScore(request.qualityScore());
        company.setNotes(trimToNull(request.notes()));
        company.setActive(request.active() == null || request.active());
    }

    private CompanyDtos.Response toResponse(Company company) {
        return new CompanyDtos.Response(
                company.getId(), company.getName(), company.getAlias(), company.getBusinessType(),
                company.getProductOwnership(), company.getAddress(), company.getCommuteMinutes(),
                company.getQualityScore(), company.getNotes(), company.getActive(),
                company.getCreatedAt(), company.getUpdatedAt()
        );
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
