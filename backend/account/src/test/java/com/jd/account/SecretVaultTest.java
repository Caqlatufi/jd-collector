package com.jd.account;

import com.jd.account.service.SecretVault;
import com.jd.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.*;

class SecretVaultTest {
    @TempDir Path directory;
    @Test void secretsSurviveNewInstanceAndCannotBeSwappedBetweenAccounts() {
        Path key = directory.resolve("master.key");
        SecretVault vault = new SecretVault(key);
        String secret = "fixture-only-口令";
        String encrypted = vault.encrypt(secret, "BOSS:password");
        assertThat(encrypted).startsWith("v1:").doesNotContain(secret);
        assertThat(vault.encrypt(secret, "BOSS:password")).isNotEqualTo(encrypted);
        assertThat(new SecretVault(key).decrypt(encrypted, "BOSS:password")).isEqualTo(secret);
        assertThatThrownBy(() -> vault.decrypt(encrypted, "LIEPIN:password")).isInstanceOf(BusinessException.class);
        SecretVault missing = new SecretVault(directory.resolve("missing.key"));
        assertThatThrownBy(() -> missing.decrypt(encrypted, "BOSS:password")).isInstanceOf(BusinessException.class);
        assertThat(directory.resolve("missing.key")).doesNotExist();
    }
}
