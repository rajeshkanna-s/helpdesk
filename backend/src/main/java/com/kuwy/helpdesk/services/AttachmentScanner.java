package com.kuwy.helpdesk.services;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

@Service
public class AttachmentScanner {
    private final String host;
    private final int port;

    public AttachmentScanner(@Value("${helpdesk.attachments.clamav-host:}") String host,
                             @Value("${helpdesk.attachments.clamav-port:3310}") int port) {
        this.host = host;
        this.port = port;
    }

    public void requireClean(MultipartFile file) {
        if (host == null || host.isBlank() || port < 1 || port > 65535) {
            throw new IllegalStateException("ATTACHMENT_SCAN_UNAVAILABLE");
        }
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), 2000);
            socket.setSoTimeout(10000);
            DataOutputStream output = new DataOutputStream(socket.getOutputStream());
            output.write("zINSTREAM\0".getBytes(StandardCharsets.US_ASCII));
            byte[] buffer = new byte[8192];
            long total = 0;
            try (InputStream input = file.getInputStream()) {
                int count;
                while ((count = input.read(buffer)) >= 0) {
                    total += count;
                    if (total > 10L * 1024 * 1024) throw new IllegalArgumentException("Attachments may be at most 10 MB each.");
                    output.writeInt(count);
                    output.write(buffer, 0, count);
                }
            }
            output.writeInt(0);
            output.flush();
            ByteArrayOutputStream reply = new ByteArrayOutputStream();
            for (int i = 0; i < 2048; i++) {
                int value = socket.getInputStream().read();
                if (value < 0 || value == 0) break;
                reply.write(value);
            }
            String result = reply.toString(StandardCharsets.US_ASCII).trim();
            if ("stream: OK".equals(result)) return;
            if (result.endsWith(" FOUND")) throw new IllegalArgumentException("The attachment was blocked by the malware scanner.");
            throw new IllegalStateException("ATTACHMENT_SCAN_UNAVAILABLE");
        } catch (IOException unavailable) {
            throw new IllegalStateException("ATTACHMENT_SCAN_UNAVAILABLE");
        }
    }
}
