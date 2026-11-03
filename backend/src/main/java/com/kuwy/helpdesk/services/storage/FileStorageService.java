package com.kuwy.helpdesk.services.storage;

import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

public interface FileStorageService {

    StoredFileResult storeFile(MultipartFile file, Long companyId, Long ticketId) throws IOException;

    Resource loadFileAsResource(String storagePath) throws IOException;

    boolean deleteFile(String storagePath);

    String getStorageType();
}

