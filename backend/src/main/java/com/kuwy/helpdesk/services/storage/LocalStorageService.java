package com.kuwy.helpdesk.services.storage;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.nio.file.LinkOption;
import java.util.UUID;

@Slf4j
@Service
public class LocalStorageService implements FileStorageService {

    private final Path uploadRoot;

    public LocalStorageService(@Value("${helpdesk.attachments.upload-dir:uploads/attachments}") String uploadDir) {
        this.uploadRoot = Paths.get(uploadDir).toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.uploadRoot);
            log.info("Initialized local attachment storage directory: {}", this.uploadRoot);
        } catch (IOException e) {
            log.error("Could not create attachment storage directory: {}", this.uploadRoot, e);
            throw new RuntimeException("Could not initialize local storage directory", e);
        }
    }

    @Override
    public StoredFileResult storeFile(MultipartFile file, Long companyId, Long ticketId) throws IOException {
        if (companyId == null || companyId <= 0 || ticketId == null || ticketId <= 0) throw new IllegalArgumentException("A valid workspace and ticket are required for attachment storage.");
        String originalFilename = StringUtils.cleanPath(file.getOriginalFilename() != null ? file.getOriginalFilename() : "document");
        if (originalFilename.contains("..")) {
            throw new IllegalArgumentException("Cannot store file with relative path outside current directory: " + originalFilename);
        }

        // Subdirectory partitioned by company and ticket: company_{id}/ticket_{id}
        Path targetDir = uploadRoot.resolve("company_" + companyId).resolve("ticket_" + ticketId);
        Files.createDirectories(targetDir);
        if (!targetDir.toRealPath().startsWith(uploadRoot.toRealPath())) throw new IOException("Attachment directory is outside private storage.");

        // Unique filename: e.g. 1793684829_a3f81e_document.pdf
        String extension = "";
        int dotIdx = originalFilename.lastIndexOf('.');
        if (dotIdx >= 0) {
            extension = originalFilename.substring(dotIdx);
        }
        if (!extension.matches("\\.[A-Za-z0-9]{1,8}")) throw new IllegalArgumentException("Attachment extension is invalid.");
        String uniqueFileName = UUID.randomUUID() + extension.toLowerCase(java.util.Locale.ROOT);

        Path targetPath = targetDir.resolve(uniqueFileName);
        try (java.io.InputStream input = file.getInputStream()) { Files.copy(input, targetPath); }

        String relativePath = uploadRoot.relativize(targetPath).toString().replace('\\', '/');

        log.debug("Stored attachment locally at: {}", relativePath);

        return new StoredFileResult(
                originalFilename,
                file.getContentType() != null ? file.getContentType() : "application/octet-stream",
                file.getSize(),
                relativePath,
                "LOCAL_DISK",
                null
        );
    }

    @Override
    public Resource loadFileAsResource(String storagePath) throws IOException {
        try {
            Path filePath = checkedPath(storagePath);
            Resource resource = new UrlResource(filePath.toUri());
            if (resource.exists() && resource.isReadable()) {
                return resource;
            } else {
                throw new IOException("Attachment not found or unreadable.");
            }
        } catch (MalformedURLException e) {
            throw new IOException("Attachment path is invalid.");
        }
    }

    @Override
    public boolean deleteFile(String storagePath) {
        try {
            Path filePath = checkedPath(storagePath);
            return Files.deleteIfExists(filePath);
        } catch (IOException e) {
            log.warn("Private attachment could not be deleted.");
            return false;
        }
    }

    @Override
    public String getStorageType() {
        return "LOCAL_DISK";
    }

    private Path checkedPath(String storagePath) throws IOException {
        if (storagePath == null || storagePath.isBlank()) throw new IOException("Attachment path is invalid.");
        Path relative;
        try { relative = Paths.get(storagePath); } catch (RuntimeException invalid) { throw new IOException("Attachment path is invalid."); }
        if (relative.isAbsolute()) throw new IOException("Absolute attachment paths are not allowed.");
        Path result = uploadRoot.resolve(relative).normalize();
        if (!result.startsWith(uploadRoot) || result.equals(uploadRoot) || !Files.isRegularFile(result, LinkOption.NOFOLLOW_LINKS)
                || !result.toRealPath().startsWith(uploadRoot.toRealPath())) throw new IOException("Attachment path is outside private storage or unavailable.");
        return result;
    }
}
