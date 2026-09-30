package com.jd.criteria.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.jd.common.exception.BusinessException;
import com.jd.common.exception.ErrorCode;
import com.jd.criteria.model.CriteriaDtos;
import com.jd.common.config.ProjectPaths;
import org.springframework.http.HttpStatus;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

public class CriteriaService {
    private final ObjectMapper mapper;
    private final Path file;

    public CriteriaService(ObjectMapper mapper, Path file) {
        this.mapper = mapper;
        this.file = file.toAbsolutePath().normalize();
    }

    public static Path resolveFile(String configured) {
        return ProjectPaths.localFile(configured, "JD门槛.json");
    }

    public synchronized CriteriaDtos.Response read() {
        try {
            byte[] bytes = Files.readAllBytes(file);
            JsonNode document = mapper.readTree(bytes);
            fields(document);
            return new CriteriaDtos.Response(revision(bytes), document);
        } catch (IOException | IllegalArgumentException e) {
            throw storageError("本地 JD 门槛不存在或格式无效，请先初始化 local/ 配置或指定 JD_COLLECTOR_CRITERIA_FILE；未生成默认值。");
        }
    }

    public synchronized CriteriaDtos.Response save(CriteriaDtos.SaveRequest request) {
        var current = read();
        if (!current.revision().equals(request.revision())) throw conflict();
        JsonNode updated = current.document().deepCopy();
        Map<String, ObjectNode> fields = fields(updated);
        Set<String> seen = new HashSet<>();
        for (var answer : request.answers()) {
            if (!fields.containsKey(answer.id()) || !seen.add(answer.id())) {
                throw invalid("答案包含未知或重复字段，请重新加载门槛。");
            }
            String value = answer.value() == null ? null : answer.value().strip();
            if (value != null && value.isBlank()) value = null;
            if (answer.status() == CriteriaDtos.Status.CONFIRMED && value == null) {
                throw invalid("已确认的门槛必须填写答案；尚未确定请保留待确认。");
            }
            ObjectNode field = fields.get(answer.id());
            field.put("value", value);
            field.put("kind", answer.kind());
            field.put("status", answer.status().name());
        }
        if (seen.size() != fields.size()) throw invalid("答案字段不完整，请重新加载门槛。");

        Path temp = null;
        try {
            byte[] next = (mapper.writerWithDefaultPrettyPrinter().writeValueAsString(updated) + "\n")
                    .getBytes(StandardCharsets.UTF_8);
            Path backups = file.getParent().resolve("backups/criteria");
            Files.createDirectories(backups);
            // 按内容版本保存旧文件，备份失败时不进入替换步骤。
            byte[] original = Files.readAllBytes(file);
            if (!revision(original).equals(current.revision())) throw conflict();
            Path backup = backups.resolve(current.revision() + ".json");
            if (!Files.exists(backup)) Files.write(backup, original, java.nio.file.StandardOpenOption.CREATE_NEW);
            temp = Files.createTempFile(file.getParent(), ".criteria-", ".tmp");
            Files.write(temp, next);
            if (!revision(Files.readAllBytes(file)).equals(current.revision())) throw conflict();
            Files.move(temp, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            return new CriteriaDtos.Response(revision(next), updated);
        } catch (IOException e) {
            throw storageError("门槛保存失败，请检查文件权限和磁盘；页面输入已保留，请重新读取确认文件状态。");
        } finally {
            if (temp != null) {
                try {
                    Files.deleteIfExists(temp);
                } catch (IOException ignored) {
                    // 临时文件未被当作有效门槛，不以清理错误掩盖保存结果。
                }
            }
        }
    }

    private Map<String, ObjectNode> fields(JsonNode document) {
        if (document == null || !document.isObject() || document.path("schemaVersion").asInt() != 1
                || !document.path("sections").isArray() || !document.path("title").isTextual()) {
            throw storageError("门槛文件结构或版本不受支持，请修复文件，不会覆盖原文件。");
        }
        Map<String, ObjectNode> result = new LinkedHashMap<>();
        Set<String> sectionIds = new HashSet<>();
        for (JsonNode section : document.path("sections")) {
            if (!section.path("id").isTextual() || !sectionIds.add(section.path("id").asText())
                    || !section.path("title").isTextual() || !section.path("notes").isArray()
                    || !section.path("fields").isArray()) {
                throw storageError("门槛分组结构无效。");
            }
            for (JsonNode note : section.path("notes")) {
                if (!note.isTextual()) throw storageError("门槛说明必须为文本。");
            }
            for (JsonNode field : section.path("fields")) {
                String status = field.path("status").asText();
                if (!(field instanceof ObjectNode object) || !field.path("id").isTextual()
                        || field.path("id").asText().isBlank() || !field.path("label").isTextual()
                        || !field.path("hint").isTextual() || !field.path("kind").isTextual()
                        || field.path("kind").asText().isBlank()
                        || !(field.has("value") && (field.get("value").isNull() || field.get("value").isTextual()))
                        || !(status.equals("PENDING") || status.equals("CONFIRMED"))
                        || (status.equals("CONFIRMED") && field.path("value").asText("").isBlank())
                        || result.putIfAbsent(field.path("id").asText(), object) != null) {
                    throw storageError("门槛字段结构无效或 ID 重复。");
                }
            }
        }
        if (result.isEmpty()) throw storageError("门槛文件没有可填写字段。");
        return result;
    }

    private String revision(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private BusinessException invalid(String message) {
        return new BusinessException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, message);
    }

    private BusinessException conflict() {
        return new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT,
                "门槛文件已被其他页面或 Agent 修改；请保留本次输入，重新加载后再合并，不会覆盖新版本。");
    }

    private BusinessException storageError(String message) {
        return new BusinessException(ErrorCode.INTERNAL_ERROR, HttpStatus.INTERNAL_SERVER_ERROR, message);
    }
}
