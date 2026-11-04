package com.kuwy.helpdesk.config;

import com.kuwy.helpdesk.services.BrowserSessionService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

@Component
public class BrowserSessionCookies {
    public static final String CSRF_HEADER = "X-Session-CSRF";
    private final boolean secure;
    private final Set<String> allowedOrigins;

    public BrowserSessionCookies(@Value("${kuwy.security.cookie-secure:true}") boolean secure,
                                @Value("${kuwy.security.allowed-origins:http://localhost:5173,http://localhost:5174}") String origins) {
        this.secure = secure;
        this.allowedOrigins = Arrays.stream(origins.split(",")).map(String::trim).filter(value -> !value.isEmpty()).collect(Collectors.toUnmodifiableSet());
        if (allowedOrigins.isEmpty() || allowedOrigins.stream().anyMatch(value -> value.contains("*"))) {
            throw new IllegalStateException("Browser sessions require explicit trusted origins.");
        }
        if (!secure && allowedOrigins.stream().anyMatch(value -> !isLoopbackOrigin(value))) {
            throw new IllegalStateException("Insecure cookies may only be used with loopback development origins.");
        }
    }

    public HttpHeaders issue(BrowserSessionService.Tokens tokens, String kind) {
        HttpHeaders headers = noStore();
        headers.add(HttpHeaders.SET_COOKIE, cookie(accessName(kind), tokens.accessToken(), "/api/v1", tokens.accessMaxAge()).toString());
        headers.add(HttpHeaders.SET_COOKIE, cookie(refreshName(kind), tokens.refreshToken(), refreshPath(kind), tokens.refreshMaxAge()).toString());
        return headers;
    }

    public HttpHeaders clear(String kind) {
        HttpHeaders headers = noStore();
        headers.add(HttpHeaders.SET_COOKIE, cookie(accessName(kind), "", "/api/v1", 0).toString());
        headers.add(HttpHeaders.SET_COOKIE, cookie(refreshName(kind), "", refreshPath(kind), 0).toString());
        return headers;
    }

    public String access(HttpServletRequest request, String kind) { return read(request, accessName(kind)); }
    public String refresh(HttpServletRequest request, String kind) { return read(request, refreshName(kind)); }

    public void requireBrowserMutation(HttpServletRequest request) {
        String origin = request.getHeader(HttpHeaders.ORIGIN);
        if (origin == null || !allowedOrigins.contains(origin) || !"1".equals(request.getHeader("X-Browser-Session"))) {
            throw new SecurityException("This browser request is not from a trusted application origin.");
        }
        String contentType = request.getContentType();
        if (contentType == null || !contentType.toLowerCase(java.util.Locale.ROOT).startsWith("application/json")) {
            throw new SecurityException("Browser authentication requires a JSON request.");
        }
    }

    public static HttpHeaders noStore() {
        HttpHeaders headers = new HttpHeaders();
        headers.setCacheControl("no-store, private");
        headers.setPragma("no-cache");
        headers.set("Referrer-Policy", "no-referrer");
        return headers;
    }

    private ResponseCookie cookie(String name, String value, String path, long seconds) {
        return ResponseCookie.from(name, value).httpOnly(true).secure(secure).sameSite("Strict").path(path).maxAge(seconds).build();
    }

    private String accessName(String kind) { return prefix(kind) + "_access"; }
    private String refreshName(String kind) { return prefix(kind) + "_refresh"; }
    private String refreshPath(String kind) { return "CUSTOMER".equals(kind) ? "/api/v1/portal" : "/api/v1/auth"; }
    private String prefix(String kind) {
        if ("STAFF".equals(kind)) return "kuwy_staff";
        if ("CUSTOMER".equals(kind)) return "kuwy_customer";
        throw new IllegalArgumentException("Unknown session kind.");
    }

    private String read(HttpServletRequest request, String name) {
        if (request.getCookies() == null) return null;
        String result = null;
        for (Cookie cookie : request.getCookies()) {
            if (name.equals(cookie.getName())) {
                if (result != null || cookie.getValue() == null || cookie.getValue().length() > 8192) return null;
                result = cookie.getValue();
            }
        }
        return result;
    }

    private boolean isLoopbackOrigin(String value) {
        try {
            String host = URI.create(value).getHost();
            return "localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host) || "[::1]".equals(host);
        } catch (IllegalArgumentException invalid) {
            return false;
        }
    }
}
