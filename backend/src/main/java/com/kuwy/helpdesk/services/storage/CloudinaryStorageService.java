package com.kuwy.helpdesk.services.storage;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Formatter;

@Slf4j
@Service
public class CloudinaryStorageService implements FileStorageService {

    @Value("${helpdesk.cloudinary.cloud-name:}")
    private String cloudName;

    @Value("${helpdesk.cloudinary.api-key:}")
    private String apiKey;

    @Value("${helpdesk.cloudinary.api-secret:}")
    private String apiSecret;

    private final LocalStorageService fallbackLocalStorage;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    public CloudinaryStorageService(LocalStorageService fallbackLocalStorage) {
        this.fallbackLocalStorage = fallbackLocalStorage;
        this.restTemplate = new RestTemplate();
        this.objectMapper = new ObjectMapper();
    }

    public boolean isConfigured() {
        return StringUtils.hasText(cloudName) &&
               StringUtils.hasText(apiKey) &&
               StringUtils.hasText(apiSecret) &&
               !cloudName.startsWith("${") &&
               !apiKey.startsWith("${") &&
               !apiSecret.startsWith("${");
    }

    @Override
    public StoredFileResult storeFile(MultipartFile file, Long companyId, Long ticketId) throws IOException {
        if (!isConfigured()) {
            log.info("Cloudinary API details not yet configured. Utilizing local storage fallback.");
            return fallbackLocalStorage.storeFile(file, companyId, ticketId);
        }

        try {
            long timestamp = System.currentTimeMillis() / 1000L;
            String folder = "kuwy_helpdesk/company_" + (companyId != null ? companyId : 1) + "/ticket_" + (ticketId != null ? ticketId : 0);
            
            // Build signature: folder=...&timestamp=...<apiSecret>
            String toSign = "folder=" + folder + "&timestamp=" + timestamp + apiSecret;
            String signature = sha1(toSign);

            String originalFilename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "document";
            String uploadUrl = "https://api.cloudinary.com/v1_1/" + cloudName + "/auto/upload";

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);

            MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
            body.add("api_key", apiKey);
            body.add("timestamp", String.valueOf(timestamp));
            body.add("folder", folder);
            body.add("signature", signature);

            ByteArrayResource fileResource = new ByteArrayResource(file.getBytes()) {
                @Override
                public String getFilename() {
                    return originalFilename;
                }
            };
            body.add("file", fileResource);

            HttpEntity<MultiValueMap<String, Object>> requestEntity = new HttpEntity<>(body, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(uploadUrl, requestEntity, String.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                JsonNode root = objectMapper.readTree(response.getBody());
                String secureUrl = root.path("secure_url").asText();
                String publicId = root.path("public_id").asText();

                log.info("Successfully uploaded attachment to Cloudinary: {}", secureUrl);

                return new StoredFileResult(
                        originalFilename,
                        file.getContentType() != null ? file.getContentType() : "application/octet-stream",
                        file.getSize(),
                        publicId,
                        "CLOUDINARY",
                        secureUrl
                );
            } else {
                throw new IOException("Failed to upload to Cloudinary: " + response.getStatusCode());
            }
        } catch (Exception e) {
            log.error("Cloudinary upload encountered an error, falling back to local storage: {}", e.getMessage(), e);
            return fallbackLocalStorage.storeFile(file, companyId, ticketId);
        }
    }

    @Override
    public Resource loadFileAsResource(String storagePath) throws IOException {
        if (!isConfigured() || !storagePath.startsWith("http")) {
            return fallbackLocalStorage.loadFileAsResource(storagePath);
        }

        try {
            return new org.springframework.core.io.UrlResource(URI.create(storagePath));
        } catch (Exception e) {
            return fallbackLocalStorage.loadFileAsResource(storagePath);
        }
    }

    @Override
    public boolean deleteFile(String storagePath) {
        if (!isConfigured()) {
            return fallbackLocalStorage.deleteFile(storagePath);
        }
        // In Cloudinary, deleting requires Destroy API call; fallback or no-op
        return true;
    }

    @Override
    public String getStorageType() {
        return isConfigured() ? "CLOUDINARY" : "LOCAL_DISK";
    }

    private String sha1(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] hash = md.digest(input.getBytes(StandardCharsets.UTF_8));
            try (Formatter formatter = new Formatter()) {
                for (byte b : hash) {
                    formatter.format("%02x", b);
                }
                return formatter.toString();
            }
        } catch (Exception e) {
            throw new RuntimeException("Could not calculate SHA-1", e);
        }
    }
}

