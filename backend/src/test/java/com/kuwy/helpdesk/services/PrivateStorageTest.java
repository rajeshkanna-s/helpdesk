package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.services.storage.LocalStorageService;
import com.kuwy.helpdesk.util.HtmlSanitizer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;

class PrivateStorageTest {
    @TempDir Path temp;

    @Test
    void filesUseRandomPrivatePathsAndCannotEscapeStorage() throws Exception {
        LocalStorageService storage = new LocalStorageService(temp.resolve("private").toString());
        var input = new MockMultipartFile("files", "customer notes.txt", "text/plain", "synthetic file".getBytes(StandardCharsets.UTF_8));
        var stored = storage.storeFile(input, 7L, 41L);
        assertFalse(stored.storagePath().contains("customer notes"));
        assertEquals("synthetic file", storage.loadFileAsResource(stored.storagePath()).getContentAsString(StandardCharsets.UTF_8));
        Path outside = temp.resolve("outside.txt"); Files.writeString(outside, "do not expose");
        assertThrows(java.io.IOException.class, () -> storage.loadFileAsResource("../outside.txt"));
        assertThrows(java.io.IOException.class, () -> storage.loadFileAsResource(outside.toString()));
        assertFalse(storage.deleteFile("../outside.txt"));
        assertTrue(Files.exists(outside));
        assertTrue(storage.deleteFile(stored.storagePath()));
    }

    @Test
    void customerHtmlCannotExecuteOrLoadRemoteTrackingContent() {
        String clean = HtmlSanitizer.clean("<p>Welcome</p><img src='https://tracker.example.invalid/pixel'><script>bad()</script><a href='javascript:bad()'>bad</a><a href='https://example.invalid'>safe</a>");
        assertFalse(clean.contains("<img"));
        assertFalse(clean.contains("<script"));
        assertFalse(clean.contains("javascript:"));
        assertTrue(clean.contains("noopener noreferrer"));
        assertEquals("A & B\nsecond line", HtmlSanitizer.cleanToPlainText("A &amp; B\nsecond line"));
    }
}
