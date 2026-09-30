package com.jd.resume.service;

import com.jd.common.config.ProjectPaths;
import com.jd.common.exception.BusinessException;
import com.jd.common.exception.ErrorCode;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

public class ResumeStarterService {
    public record Starter(String contentMarkdown, String templateKey, String photoUrl, String versionLabel) {
    }

    private final Path starterFile;
    private final Path photoFile;
    private final boolean explicitStarter;

    public ResumeStarterService(String starterFile, String photoFile) {
        this(ProjectPaths.localFile(starterFile, "resume-starter.md"),
                ProjectPaths.localFile(photoFile, "resume/photo.png"), !starterFile.isBlank());
    }

    ResumeStarterService(Path starterFile, Path photoFile, boolean explicitStarter) {
        this.starterFile = starterFile;
        this.photoFile = photoFile;
        this.explicitStarter = explicitStarter;
    }

    public Starter read() {
        try {
            String markdown;
            if (Files.isRegularFile(starterFile)) {
                markdown = Files.readString(starterFile, StandardCharsets.UTF_8);
            } else if (explicitStarter) {
                throw storageError();
            } else {
                try (var input = new ClassPathResource("resume-starter.example.md").getInputStream()) {
                    markdown = new String(input.readAllBytes(), StandardCharsets.UTF_8);
                }
            }
            return new Starter(markdown, "CLASSIC_BLUE", Files.isRegularFile(photoFile) ? "/resume/photo.png" : null,
                    LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy.MM")) + "-v1");
        } catch (IOException e) {
            throw storageError();
        }
    }

    public byte[] photo() {
        if (!Files.isRegularFile(photoFile)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, "尚未配置简历照片");
        }
        try {
            return Files.readAllBytes(photoFile);
        } catch (IOException e) {
            throw storageError();
        }
    }

    private BusinessException storageError() {
        return new BusinessException(ErrorCode.INTERNAL_ERROR, HttpStatus.INTERNAL_SERVER_ERROR,
                "简历本地配置读取失败，请检查文件路径、格式与权限");
    }
}
