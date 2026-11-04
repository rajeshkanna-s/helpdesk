package com.kuwy.helpdesk.services;

import org.junit.jupiter.api.Test;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class CaptchaVerificationServiceTest {
    @Test
    void requiresConfigurationAndValidHostAndAction() throws Exception {
        HttpClient client = mock(HttpClient.class);
        var service = new CaptchaVerificationService("synthetic-server-key", "synthetic-public-key", "app.example.invalid", client);
        assertTrue(service.isReady());
        assertThrows(IllegalArgumentException.class, () -> service.verify(null, "127.0.0.1", "signup"));
        HttpResponse<byte[]> response = mock(HttpResponse.class);
        when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(response);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn("{\"success\":true,\"hostname\":\"app.example.invalid\",\"action\":\"signup\"}".getBytes(StandardCharsets.UTF_8));
        assertDoesNotThrow(() -> service.verify("synthetic-proof", "127.0.0.1", "signup"));
        assertThrows(IllegalArgumentException.class, () -> service.verify("synthetic-proof", "127.0.0.1", "different"));
        when(response.body()).thenReturn("{\"success\":true,\"hostname\":\"evil.example.invalid\",\"action\":\"signup\"}".getBytes(StandardCharsets.UTF_8));
        assertThrows(IllegalArgumentException.class, () -> service.verify("synthetic-proof", "127.0.0.1", "signup"));
        assertFalse(new CaptchaVerificationService("", "", "", client).isReady());
        assertThrows(IllegalStateException.class, () -> new CaptchaVerificationService("", "", "", client).verify("anything", "127.0.0.1", "signup"));
    }
}
