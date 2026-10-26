package com.jd.recognition.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

public class CompanyAddressTaskService extends FileTaskQueueService {
    public CompanyAddressTaskService(ObjectMapper mapper, String projectRoot, String directory, boolean enabled,
            String node, String codex, String model, String effort, int timeout, String apiBase) {
        super(mapper, projectRoot, directory, "runtime/company-addresses", "ops/jd-import/address-worker.mjs", "company-address:",
                enabled, node, codex, model, effort, timeout, apiBase);
    }

    public JsonNode create(Long companyId, String companyName) {
        var seed = mapper.createObjectNode();
        seed.put("companyId", companyId);
        seed.put("companyName", companyName);
        return enqueue(seed, "companyId");
    }
}
