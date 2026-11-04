package com.kuwy.helpdesk.services;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class CaptchaVerificationService {
    private final String secret;
    private final String siteKey;
    private final Set<String> hosts;
    private final HttpClient client;
    private final ObjectMapper json = new ObjectMapper();

    @org.springframework.beans.factory.annotation.Autowired
    public CaptchaVerificationService(@Value("${kuwy.security.turnstile-secret:}") String secret,
                                      @Value("${kuwy.security.turnstile-site-key:}") String siteKey,
                                      @Value("${kuwy.security.turnstile-hostnames:}") String allowedHosts) {
        this(secret, siteKey, allowedHosts, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build());
    }

    CaptchaVerificationService(String secret, String siteKey, String allowedHosts, HttpClient client) {
        this.secret = secret;
        this.siteKey = siteKey;
        this.client = client;
        this.hosts = Arrays.stream(allowedHosts.split(",")).map(String::trim).filter(value -> !value.isEmpty()).collect(Collectors.toUnmodifiableSet());
    }

    public boolean isReady() {
        return secret != null && !secret.isBlank() && siteKey != null && !siteKey.isBlank() && !hosts.isEmpty() && !hosts.contains("*");
    }

    public String publicSiteKey() { return isReady() ? siteKey : ""; }

    public void verify(String token, String remoteAddress, String action) {
        if (!isReady()) throw new IllegalStateException("CAPTCHA_NOT_CONFIGURED");
        if (token == null || token.isBlank() || token.length() > 2048) throw new IllegalArgumentException("Complete the verification challenge before continuing.");
        String body = "secret=" + encode(secret) + "&response=" + encode(token) + "&remoteip=" + encode(remoteAddress == null ? "" : remoteAddress);
        HttpRequest request = HttpRequest.newBuilder(URI.create("https://challenges.cloudflare.com/turnstile/v0/siteverify"))
                .timeout(Duration.ofSeconds(7)).header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        try {
            HttpResponse<byte[]> response = client.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() != 200 || response.body().length > 16384) throw new IllegalStateException("CAPTCHA_UNAVAILABLE");
            var result = json.readTree(response.body());
            if (!result.path("success").isBoolean() || !result.path("success").booleanValue() || !hosts.contains(result.path("hostname").asText())
                    || !action.equals(result.path("action").asText())) {
                throw new IllegalArgumentException("Verification failed. Complete a new challenge and try again.");
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("CAPTCHA_UNAVAILABLE");
        } catch (IOException unavailable) {
            throw new IllegalStateException("CAPTCHA_UNAVAILABLE");
        }
    }

    private String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
}
