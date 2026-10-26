package com.jd.app;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.sql.SQLException;

/** Runs through the executable JAR's PropertiesLauncher without starting Spring. */
public final class DatabaseBackup {
    private DatabaseBackup() {
    }

    public static void main(String[] args) {
        try {
            if (args.length != 1) {
                throw new IllegalArgumentException("One backup destination is required");
            }
            Path destination = Path.of(args[0]).toAbsolutePath().normalize();
            if (Files.exists(destination)) {
                throw new IllegalArgumentException("Backup destination already exists");
            }
            String url = System.getenv("JD_COLLECTOR_DB_URL");
            if (url == null || !url.startsWith("jdbc:h2:file:")) {
                throw new IllegalArgumentException("An H2 file connection is required");
            }
            Files.createDirectories(destination.getParent());
            String username = System.getenv().getOrDefault("JD_COLLECTOR_DB_USERNAME", "sa");
            String password = System.getenv().getOrDefault("JD_COLLECTOR_DB_PASSWORD", "");
            // A backup must never create an empty database at a mistyped path.
            try (var connection = DriverManager.getConnection(url + ";IFEXISTS=TRUE", username, password);
                 var statement = connection.createStatement()) {
                statement.execute("BACKUP TO '" + destination.toString().replace("'", "''") + "'");
            }
            if (!Files.isRegularFile(destination) || Files.size(destination) == 0) {
                throw new IllegalStateException("Backup file is empty");
            }
            System.out.println("H2 backup completed.");
        } catch (Exception error) {
            // JDBC messages can contain URLs, SQL and data; do not print them.
            String state = error instanceof SQLException sql ? " SQLState=" + sql.getSQLState() : "";
            System.err.println("H2 backup failed: " + error.getClass().getSimpleName() + state);
            System.exit(1);
        }
    }
}
