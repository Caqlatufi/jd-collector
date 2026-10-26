package com.jd.posting.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CodexGreetingGeneratorTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void capacityFailureShowsServerStatusWithoutAskingForLogin() throws Exception {
        var result = mapper.readTree("{\"ok\":false,\"errorCode\":\"CODEX_MODEL_CAPACITY\",\"httpStatus\":503}");
        assertThat(CodexGreetingGenerator.errorMessage(result))
                .contains("当前容量不足", "无需重新登录", "CODEX_MODEL_CAPACITY", "HTTP 503");
    }

    @Test
    void authenticationAndNetworkFailuresGiveDifferentActions() throws Exception {
        assertThat(CodexGreetingGenerator.errorMessage(mapper.readTree("{\"errorCode\":\"CODEX_AUTH_EXPIRED\"}")))
                .contains("凭证已失效", "重新登录");
        assertThat(CodexGreetingGenerator.errorMessage(mapper.readTree("{\"errorCode\":\"CODEX_NETWORK\"}")))
                .contains("网络", "代理").doesNotContain("登录");
        assertThat(CodexGreetingGenerator.errorMessage(mapper.readTree("{\"errorCode\":\"CODEX_USAGE_LIMIT\"}")))
                .contains("额度").doesNotContain("登录");
    }

    @Test
    void timeoutKeepsLastKnownCauseAndUnknownFailuresDoNotEchoRawOutput() throws Exception {
        var timeout = mapper.readTree("{\"errorCode\":\"CODEX_TIMEOUT\",\"causeCode\":\"CODEX_SERVER_UNAVAILABLE\",\"httpStatus\":503}");
        assertThat(CodexGreetingGenerator.errorMessage(timeout)).contains("120 秒", "上游服务", "HTTP 503");
        var unknown = mapper.readTree("{\"errorCode\":\"secret-token\",\"message\":\"private resume\",\"httpStatus\":1000,\"exitCode\":2}");
        assertThat(CodexGreetingGenerator.errorMessage(unknown)).contains("CODEX_FAILED")
                .doesNotContain("secret-token", "private resume", "1000");
        assertThat(CodexGreetingGenerator.errorMessage(null)).contains("CODEX_FAILED");
    }
}
