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
        // Public cloud uploads are not suitable for customer attachments. Keep new files private.
        return localStorageService;
    }

    public StoredFileResult storeFile(MultipartFile file, Long companyId, Long ticketId) throws IOException {
        return getActiveStorage().storeFile(file, companyId, ticketId);
    }

    public Resource loadFileAsResource(String storagePath, String storageType) throws IOException {
        if (!"LOCAL_DISK".equalsIgnoreCase(storageType)) throw new IOException("This attachment requires a configured private storage adapter.");
        return localStorageService.loadFileAsResource(storagePath);
    }

    public boolean deleteFile(String storagePath, String storageType) {
        if (!"LOCAL_DISK".equalsIgnoreCase(storageType)) return false;
        return localStorageService.deleteFile(storagePath);
    }
}
