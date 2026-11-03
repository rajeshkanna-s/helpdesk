package com.kuwy.helpdesk.services.storage;

public record StoredFileResult(
        String fileName,
        String contentType,
        long fileSizeBytes,
        String storagePath,
        String storageType,
        String directUrl
) {}

