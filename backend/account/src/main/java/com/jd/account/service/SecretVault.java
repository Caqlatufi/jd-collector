package com.jd.account.service;

import com.jd.common.exception.BusinessException;
import com.jd.common.exception.ErrorCode;
import org.springframework.http.HttpStatus;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.SecureRandom;
import java.util.Base64;

public class SecretVault {
    private final Path keyPath;
    private final SecureRandom random = new SecureRandom();

    public SecretVault(Path keyPath) { this.keyPath = keyPath.toAbsolutePath().normalize(); }

    private synchronized byte[] key(boolean create) throws Exception {
        if (!Files.exists(keyPath) && create) {
            Files.createDirectories(keyPath.getParent());
            byte[] key = new byte[32];
            random.nextBytes(key);
            try { Files.write(keyPath, key, StandardOpenOption.CREATE_NEW); }
            catch (java.nio.file.FileAlreadyExistsException ignored) { /* Another instance created it first. */ }
        }
        byte[] value = Files.readAllBytes(keyPath);
        if (value.length != 32) throw new IllegalStateException("Invalid key");
        return value;
    }
    public String encrypt(String value, String purpose) {
        try {
            byte[] iv = new byte[12]; random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key(true), "AES"), new GCMParameterSpec(128, iv));
            cipher.updateAAD(purpose.getBytes(StandardCharsets.UTF_8));
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            return "v1:" + Base64.getEncoder().encodeToString(ByteBuffer.allocate(iv.length + encrypted.length).put(iv).put(encrypted).array());
        } catch (Exception e) { throw failure(); }
    }
    public String decrypt(String value, String purpose) {
        try {
            if (!value.startsWith("v1:")) throw new IllegalArgumentException("Unknown cipher format");
            ByteBuffer data = ByteBuffer.wrap(Base64.getDecoder().decode(value.substring(3)));
            byte[] iv = new byte[12]; data.get(iv);
            byte[] encrypted = new byte[data.remaining()]; data.get(encrypted);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key(false), "AES"), new GCMParameterSpec(128, iv));
            cipher.updateAAD(purpose.getBytes(StandardCharsets.UTF_8));
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (Exception e) { throw failure(); }
    }
    private BusinessException failure() {
        return new BusinessException(ErrorCode.BUSINESS_ERROR, HttpStatus.CONFLICT,
                "本地凭证密钥不可用或密文损坏，请恢复配套密钥；也可清除该账号后重新配置。");
    }
}
