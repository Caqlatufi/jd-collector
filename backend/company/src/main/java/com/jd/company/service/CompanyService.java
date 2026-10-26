package com.jd.company.service;

import com.jd.common.exception.BusinessException;
import com.jd.common.exception.ErrorCode;
import com.jd.company.model.Company;
import com.jd.company.model.CompanyDtos;
import com.jd.company.model.CompanyWorkLocation;
import com.jd.company.repo.CompanyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.util.ArrayList;

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
        if (request.officialApplicationUrl() != null || company.getId() == null) {
            company.setOfficialApplicationUrl(normalizeOfficialApplicationUrl(request.officialApplicationUrl()));
        }
        company.setBusinessType(request.businessType());
        company.setProductOwnership(request.productOwnership());
        company.setAddress(trimToNull(request.address()));
        if (request.workLocations() != null) {
            var locations = new ArrayList<CompanyWorkLocation>();
            for (var input : request.workLocations()) {
                if ((input.longitude() == null) != (input.latitude() == null)
                        || (input.longitude() != null && (!Double.isFinite(input.longitude()) || !Double.isFinite(input.latitude())))) {
                    throw new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, "经纬度必须同时填写且为有限数值");
                }
                var location = new CompanyWorkLocation();
                location.setLabel(trimToNull(input.label()));
                location.setAddress(input.address().trim());
                location.setLongitude(input.longitude());
                location.setLatitude(input.latitude());
                locations.add(location);
            }
            company.getWorkLocations().clear();
            company.getWorkLocations().addAll(locations);
        }
        company.setCommuteMinutes(request.commuteMinutes());
        company.setQualityScore(request.qualityScore());
        company.setNotes(trimToNull(request.notes()));
        company.setActive(request.active() == null || request.active());
    }

    private CompanyDtos.Response toResponse(Company company) {
        return new CompanyDtos.Response(
                company.getId(), company.getName(), company.getAlias(), company.getOfficialApplicationUrl(), company.getBusinessType(),
                company.getProductOwnership(), company.getAddress(), company.getCommuteMinutes(),
                company.getQualityScore(), company.getNotes(), company.getActive(),
                company.getCreatedAt(), company.getUpdatedAt(),
                company.getWorkLocations().stream().map(location -> new CompanyDtos.WorkLocation(
                        location.getLabel(), location.getAddress(), location.getLongitude(), location.getLatitude())).toList()
        );
    }

    private String normalizeOfficialApplicationUrl(String value) {
        String url = trimToNull(value);
        if (url == null) {
            return null;
        }
        try {
            URI uri = URI.create(url);
            if (("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))
                    && uri.getHost() != null && uri.getUserInfo() == null) {
                return url;
            }
        } catch (IllegalArgumentException ignored) {
            // Invalid URI is reported through the same business validation below.
        }
        throw new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, "请填写完整的 HTTP 或 HTTPS 官网投递渠道链接");
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
