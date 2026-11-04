package com.kuwy.helpdesk.services;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.*;

class SecretCryptoServiceTest {
    @Test
    void roundTripUsesRandomNoncesAndDoesNotExposePlaintext() {
        SecretCryptoService service = crypto((byte) 7);
        String first = service.encrypt("synthetic private payload", "test:1");
        String second = service.encrypt("synthetic private payload", "test:1");
        assertNotEquals(first, second);
        assertFalse(first.contains("synthetic private payload"));
        assertEquals("synthetic private payload", service.decrypt(first, "test:1"));
    }

    @Test
    void wrongPurposeKeyOrTamperingFailsClosed() {
        SecretCryptoService service = crypto((byte) 7);
        String value = service.encrypt("synthetic private payload", "test:1");
        assertThrows(IllegalArgumentException.class, () -> service.decrypt(value, "test:2"));
        assertThrows(IllegalArgumentException.class, () -> crypto((byte) 8).decrypt(value, "test:1"));
        byte[] bytes = Base64.getDecoder().decode(value.substring("enc:v1:".length()));
        bytes[bytes.length - 1] ^= 1;
        String changed = "enc:v1:" + Base64.getEncoder().encodeToString(bytes);
        assertThrows(IllegalArgumentException.class, () -> service.decrypt(changed, "test:1"));
        assertThrows(IllegalArgumentException.class, () -> service.decrypt("plain-text", "test:1"));
    }

    @Test
    void missingOrInvalidConfigurationCannotEncrypt() {
        SecretCryptoService missing = new SecretCryptoService("");
        assertFalse(missing.isConfigured());
        assertThrows(IllegalStateException.class, () -> missing.encrypt("data", "test"));
        assertThrows(IllegalStateException.class, () -> new SecretCryptoService("not-base64"));
        assertThrows(IllegalStateException.class, () -> new SecretCryptoService(Base64.getEncoder().encodeToString(new byte[16])));
        assertThrows(IllegalArgumentException.class, () -> crypto((byte) 7).encrypt("data", ""));
    }

    private SecretCryptoService crypto(byte value) {
        byte[] key = new byte[32];
        Arrays.fill(key, value);
        return new SecretCryptoService(Base64.getEncoder().encodeToString(key));
    }
}
