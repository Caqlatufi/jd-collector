package com.jd.common.config;

import java.nio.file.Files;
import java.nio.file.Path;

public final class ProjectPaths {
    private ProjectPaths() {
    }

    public static Path root(String configured) {
        if (configured != null && !configured.isBlank()) return Path.of(configured).toAbsolutePath().normalize();
        String environment = System.getenv("JD_COLLECTOR_PROJECT_DIR");
        if (environment != null && !environment.isBlank()) return Path.of(environment).toAbsolutePath().normalize();
        Path current = Path.of("").toAbsolutePath().normalize();
        for (Path parent = current; parent != null; parent = parent.getParent()) {
            if (Files.isRegularFile(parent.resolve("backend/settings.gradle"))
                    && Files.isDirectory(parent.resolve("ops"))) return parent;
        }
        return current;
    }

    public static Path localFile(String configured, String defaultName) {
        Path root = root("");
        if (configured == null || configured.isBlank()) return root.resolve("local").resolve(defaultName);
        return root.resolve(configured).toAbsolutePath().normalize();
    }
}
