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
        String originalFilename = StringUtils.cleanPath(file.getOriginalFilename() != null ? file.getOriginalFilename() : "document");
        if (originalFilename.contains("..")) {
            throw new IllegalArgumentException("Cannot store file with relative path outside current directory: " + originalFilename);
        }

        // Subdirectory partitioned by company and ticket: company_{id}/ticket_{id}
        Path targetDir = uploadRoot.resolve("company_" + (companyId != null ? companyId : 1))
                                   .resolve("ticket_" + (ticketId != null ? ticketId : 0));
        Files.createDirectories(targetDir);

        // Unique filename: e.g. 1793684829_a3f81e_document.pdf
        String extension = "";
        int dotIdx = originalFilename.lastIndexOf('.');
        if (dotIdx >= 0) {
            extension = originalFilename.substring(dotIdx);
        }
        String baseName = dotIdx >= 0 ? originalFilename.substring(0, dotIdx) : originalFilename;
        String safeBaseName = baseName.replaceAll("[^a-zA-Z0-9._-]", "_");
        String uniqueFileName = System.currentTimeMillis() + "_" + UUID.randomUUID().toString().substring(0, 8) + "_" + safeBaseName + extension;

        Path targetPath = targetDir.resolve(uniqueFileName);
        Files.copy(file.getInputStream(), targetPath, StandardCopyOption.REPLACE_EXISTING);

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
            Path filePath = uploadRoot.resolve(storagePath).normalize();
            Resource resource = new UrlResource(filePath.toUri());
            if (resource.exists() && resource.isReadable()) {
                return resource;
            } else {
                throw new IOException("File not found or unreadable: " + storagePath);
            }
        } catch (MalformedURLException e) {
            throw new IOException("Malformed file URL: " + storagePath, e);
        }
    }

    @Override
    public boolean deleteFile(String storagePath) {
        try {
            Path filePath = uploadRoot.resolve(storagePath).normalize();
            return Files.deleteIfExists(filePath);
        } catch (IOException e) {
            log.warn("Failed to delete local attachment: {}", storagePath, e);
            return false;
        }
    }

    @Override
    public String getStorageType() {
        return "LOCAL_DISK";
    }
}

