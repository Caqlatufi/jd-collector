package com.jd.posting.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jd.common.exception.BusinessException;
import com.jd.common.exception.ErrorCode;
import com.jd.posting.model.GreetingDtos;
import org.springframework.http.HttpStatus;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

public class CodexGreetingGenerator implements GreetingGenerator {
    private final ObjectMapper mapper;
    private final Path projectRoot;
    private final String node;
    private final String codex;
    private final Semaphore slots = new Semaphore(2);

    public CodexGreetingGenerator(ObjectMapper mapper, String projectRoot, String node, String codex) {
        this.mapper = mapper;
        this.projectRoot = Path.of(projectRoot.isBlank() ? System.getProperty("user.dir") : projectRoot).toAbsolutePath();
        this.node = node;
        this.codex = codex;
    }

    @Override
    public GreetingDtos.Draft generate(GreetingDtos.Input input) {
        if (!slots.tryAcquire()) {
            throw new BusinessException(ErrorCode.CONFLICT, HttpStatus.CONFLICT, "正在生成其他打招呼用语，请稍后再试");
        }
        Process process = null;
        Path output = null;
        try {
            output = Files.createTempFile("jd-greeting-", ".json");
            process = new ProcessBuilder(node, projectRoot.resolve("ops/greeting/worker.mjs").toString(), codex)
                    .directory(projectRoot.toFile()).redirectOutput(output.toFile())
                    .redirectError(ProcessBuilder.Redirect.DISCARD).start();
            try (var stdin = process.getOutputStream()) {
                stdin.write(mapper.writeValueAsBytes(input));
            }
            if (!process.waitFor(140, TimeUnit.SECONDS)) {
                throw failure("生成超时，请稍后重新生成");
            }
            if (Files.size(output) > 64000) throw failure("生成结果异常，请重新生成");
            var result = mapper.readTree(Files.readAllBytes(output));
            if (process.exitValue() != 0 || result == null || !result.path("ok").asBoolean()) {
                throw failure(errorMessage(result));
            }
            if (!GreetingDtos.MODEL.equals(result.path("model").asText())
                    || !GreetingDtos.REASONING_EFFORT.equals(result.path("reasoningEffort").asText())) {
                throw failure("模型配置不匹配，已停止返回结果");
            }
            return mapper.treeToValue(result.path("draft"), GreetingDtos.Draft.class);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw failure("生成已中断，请重新生成");
        } catch (JsonProcessingException e) {
            throw failure("生成进程返回的 JSON 无效（INVALID_RESULT），请重新生成");
        } catch (IOException e) {
            throw failure("生成服务不可用，请检查本机 Node 和 Codex 安装");
        } finally {
            if (process != null && process.isAlive()) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
                try { process.waitFor(5, TimeUnit.SECONDS); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            }
            if (output != null) {
                try { Files.deleteIfExists(output); } catch (IOException ignored) { /* No input is stored here. */ }
            }
            slots.release();
        }
    }

    static String errorMessage(JsonNode result) {
        String code = result == null ? "CODEX_FAILED" : result.path("errorCode").asText("CODEX_FAILED");
        String message = description(code);
        if (result == null) return message;
        if ("CODEX_TIMEOUT".equals(code) && result.hasNonNull("causeCode")) {
            String cause = result.path("causeCode").asText();
            if (!"CODEX_FAILED".equals(cause) && !description(cause).equals(description("CODEX_FAILED"))) {
                message += "；超时前的错误：" + description(cause);
            }
        }
        if (result.path("httpStatus").isIntegralNumber()) {
            int status = result.path("httpStatus").asInt();
            if (status >= 400 && status <= 599) message += "；HTTP " + status;
        }
        if ("CODEX_FAILED".equals(code) && result.path("exitCode").isIntegralNumber()) {
            message += "；CLI 退出码 " + result.path("exitCode").asInt();
        }
        return message;
    }

    private static String description(String code) {
        return switch (code) {
            case "CODEX_MODEL_CAPACITY" -> "GPT 6.1 Sol 当前容量不足（CODEX_MODEL_CAPACITY），请稍后重试，无需重新登录";
            case "CODEX_AUTH_EXPIRED" -> "Codex 登录凭证已失效（CODEX_AUTH_EXPIRED），请重新登录本机 Codex 后重试";
            case "CODEX_AUTH_REQUIRED" -> "Codex 未登录或认证被拒绝（CODEX_AUTH_REQUIRED），请登录本机 Codex 后重试";
            case "CODEX_USAGE_LIMIT" -> "Codex 可用额度已用尽（CODEX_USAGE_LIMIT），请检查账户用量或等待额度恢复";
            case "CODEX_RATE_LIMIT" -> "Codex 请求被限流（CODEX_RATE_LIMIT），请稍后重试";
            case "CODEX_MODEL_UNAVAILABLE" -> "当前 Codex 账户无法使用 GPT 6.1 Sol（CODEX_MODEL_UNAVAILABLE），请检查模型权限与支持情况";
            case "CODEX_PERMISSION_DENIED" -> "Codex 请求权限被拒绝（CODEX_PERMISSION_DENIED），请检查账户或本机访问权限";
            case "CODEX_ARGUMENTS" -> "本机 Codex CLI 不支持生成参数（CODEX_ARGUMENTS），请检查 CLI 版本";
            case "CODEX_SERVER_UNAVAILABLE" -> "Codex 上游服务暂时不可用（CODEX_SERVER_UNAVAILABLE），请稍后重试";
            case "CODEX_NETWORK" -> "Codex 网络连接失败或响应流中断（CODEX_NETWORK），请检查网络或代理后重试";
            case "CODEX_TIMEOUT" -> "生成超过 120 秒（CODEX_TIMEOUT），请稍后重试";
            case "CODEX_UNAVAILABLE" -> "无法启动本机 Codex（CODEX_UNAVAILABLE），请检查可执行文件路径、安装或权限";
            case "INVALID_RESULT" -> "Codex 生成结果缺失或 JSON 无效（INVALID_RESULT），请重新生成";
            case "INVALID_INPUT" -> "生成输入格式或大小不符合要求（INVALID_INPUT），请检查 JD 和简历";
            default -> "Codex 生成失败（CODEX_FAILED），未返回可识别的错误原因，请重试";
        };
    }

    private BusinessException failure(String message) {
        return new BusinessException(ErrorCode.BUSINESS_ERROR, HttpStatus.BAD_GATEWAY, message);
    }
}
