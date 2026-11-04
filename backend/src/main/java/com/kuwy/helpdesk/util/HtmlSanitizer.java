package com.kuwy.helpdesk.util;

import org.jsoup.Jsoup;
import org.jsoup.safety.Safelist;

/**
 * Whitelist-based HTML Sanitizer (OWASP compliant) to defeat Stored XSS,
 * DOM injection, and malicious attribute-based exploits (e.g. <img onerror=...>).
 */
public final class HtmlSanitizer {

    private static final Safelist SAFE_HTML_WHITELIST = Safelist.relaxed()
            // Strictly exclude execution and dangerous embedded elements
            .removeTags("script", "iframe", "object", "embed", "applet", "form", "input", "button", "link", "style", "meta", "base")
            // Strip any JavaScript event listeners or expression styles from all tags
            .removeAttributes(":all", "onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "style")
            // Safe protocols only
            .addProtocols("a", "href", "http", "https", "mailto")
            .addProtocols("img", "src", "http", "https", "data");

    private HtmlSanitizer() {}

    /**
     * Sanitizes HTML allowing only safe formatting tags, stripped of all inline scripts and event handlers.
     */
    public static String clean(String dirtyHtml) {
        if (dirtyHtml == null || dirtyHtml.isBlank()) {
            return "";
        }
        return Jsoup.clean(dirtyHtml, SAFE_HTML_WHITELIST);
    }

    /**
     * Completely strips all HTML tags and leaves safe plain text.
     */
    public static String cleanToPlainText(String input) {
        if (input == null || input.isBlank()) {
            return "";
        }
        return Jsoup.clean(input, Safelist.none());
    }
}
