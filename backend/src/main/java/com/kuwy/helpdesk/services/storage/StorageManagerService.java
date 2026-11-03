package com.kuwy.helpdesk.services.storage;

import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@Service
@RequiredArgsConstructor
public class StorageManagerService {

    private final LocalStorageService localStorageService;
    private final CloudinaryStorageService cloudinaryStorageService;

    public FileStorageService getActiveStorage() {
        if (cloudinaryStorageService.isConfigured()) {
            return cloudinaryStorageService;
        }
        return localStorageService;
    }

    public StoredFileResult storeFile(MultipartFile file, Long companyId, Long ticketId) throws IOException {
        return getActiveStorage().storeFile(file, companyId, ticketId);
    }

    public Resource loadFileAsResource(String storagePath, String storageType) throws IOException {
        if ("CLOUDINARY".equalsIgnoreCase(storageType) && cloudinaryStorageService.isConfigured()) {
            return cloudinaryStorageService.loadFileAsResource(storagePath);
        }
        return localStorageService.loadFileAsResource(storagePath);
    }

    public boolean deleteFile(String storagePath, String storageType) {
        if ("CLOUDINARY".equalsIgnoreCase(storageType) && cloudinaryStorageService.isConfigured()) {
            return cloudinaryStorageService.deleteFile(storagePath);
        }
        return localStorageService.deleteFile(storagePath);
    }
}

