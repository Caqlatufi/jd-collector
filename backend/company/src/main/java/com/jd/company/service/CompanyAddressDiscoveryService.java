package com.jd.company.service;

import com.jd.common.exception.BusinessException;
import com.jd.common.exception.ErrorCode;
import com.jd.company.model.CompanyAddressDiscovery;
import com.jd.company.model.CompanyAddressDtos;
import com.jd.company.repo.CompanyAddressDiscoveryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.util.HexFormat;
import java.util.List;

@RequiredArgsConstructor
public class CompanyAddressDiscoveryService {
    private final CompanyService companies;
    private final CompanyAddressDiscoveryRepository repository;

    @Transactional(readOnly = true)
    public List<CompanyAddressDtos.Response> list() { return repository.visible().stream().map(this::response).toList(); }

    @Transactional
    public CompanyAddressDtos.Response record(Long companyId, Long postingId, CompanyAddressDtos.SaveRequest request) {
        var company = companies.getEntity(companyId);
        if (!company.getName().equals(request.expectedCompanyName()))
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "公司名称已变化，请重新查找地址");
        String address = Normalizer.normalize(request.address(), Normalizer.Form.NFKC).trim();
        String compact = address.replaceAll("(?U)\\s+", "");
        if (!compact.contains("上海") || compact.length() < 8
                || compact.matches("上海市?([·-]?[\\p{IsHan}]{2,4}区)?"))
            throw invalid("地址须为可核实的上海详细办公地址，不能只填城市或行政区");
        try {
            URI uri = URI.create(request.sourceUrl());
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                    || (uri.getPort() != -1 && uri.getPort() != 443)) throw new IllegalArgumentException();
        } catch (IllegalArgumentException error) { throw invalid("地址证据须有完整 HTTPS 来源链接"); }
        String key = companyId + "\n" + postingId + "\n" + compact;
        String fingerprint;
        try { fingerprint = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
        var existing = repository.findByFingerprintAndDeletedFalse(fingerprint);
        if (existing.isPresent()) return response(existing.get());
        var row = new CompanyAddressDiscovery();
        row.setCompanyId(companyId);
        row.setPostingId(postingId);
        row.setAddress(address);
        row.setSourceType(postingId == null ? "COMPANY" : "JD");
        row.setSourceUrl(request.sourceUrl());
        row.setEvidenceText(request.evidenceText());
        row.setTaskId(request.taskId());
        row.setFingerprint(fingerprint);
        return response(repository.saveAndFlush(row));
    }

    private CompanyAddressDtos.Response response(CompanyAddressDiscovery row) {
        return new CompanyAddressDtos.Response(row.getId(), row.getCompanyId(), row.getPostingId(), row.getAddress(),
                row.getSourceType(), row.getSourceUrl(), row.getEvidenceText(), row.getTaskId(), row.getCreatedAt());
    }

    private BusinessException invalid(String message) {
        return new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, message);
    }
}
