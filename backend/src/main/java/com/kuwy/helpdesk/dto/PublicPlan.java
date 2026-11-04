package com.kuwy.helpdesk.dto;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.kuwy.helpdesk.models.PlanDefinition.BaseTier;
import com.kuwy.helpdesk.models.PlanDefinition.Status;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

public record PublicPlan(String code, String displayName, String description, BaseTier baseTier,
        Status status, String currency, boolean gstExclusive, BigDecimal monthlyPrice, BigDecimal yearlyPrice,
        int includedAgents, int ticketLimitMonthly, int trialDays, long storageBytes,
        Map<String, Boolean> features, long revision) {
    public static final Set<String> CAPABILITIES = Set.of("mailboxConnect", "customDomain", "automation", "sla",
            "macros", "customFields", "csat", "api", "export", "branding");

    public PublicPlan {
        requireCode(code);
        if (displayName == null || displayName.isBlank() || displayName.length() > 100
                || description == null || description.length() > 2000 || baseTier == null || status == null
                || !"INR".equals(currency) || !gstExclusive || revision < 1
                || includedAgents < 1 || includedAgents > 10000 || ticketLimitMonthly < 1
                || ticketLimitMonthly > 10000000 || trialDays < 0 || trialDays > 30 || storageBytes < 0) {
            throw new IllegalArgumentException("Invalid plan terms; only GST-exclusive INR is supported.");
        }
        monthlyPrice = money(monthlyPrice);
        yearlyPrice = money(yearlyPrice); // Total annual charge, never a monthly equivalent.
        features = checkedFeatures(features);
    }

    public static void requireCode(String code) {
        if (code == null || !code.matches("[A-Z][A-Z0-9_-]{2,29}"))
            throw new IllegalArgumentException("Plan code must be 3-30 uppercase letters, digits, underscores or hyphens, starting with a letter.");
    }

    private static BigDecimal money(BigDecimal value) {
        if (value == null || value.signum() < 0 || value.scale() > 2 || value.scale() < -12
                || value.compareTo(new BigDecimal("999999999999.99")) > 0)
            throw new IllegalArgumentException("Prices must be nonnegative INR amounts with at most two decimal places and 12 integer digits.");
        return value.setScale(2, RoundingMode.UNNECESSARY);
    }

    public static Map<String, Boolean> checkedFeatures(Map<String, ?> values) {
        if (values == null || values.size() > CAPABILITIES.size())
            throw new IllegalArgumentException("A bounded capability map is required.");
        Map<String, Boolean> result = new TreeMap<>();
        values.forEach((key, value) -> {
            if (key == null || !CAPABILITIES.contains(key) || !(value instanceof Boolean))
                throw new IllegalArgumentException("Capabilities must be known names with boolean values.");
            result.put(key, (Boolean) value);
        });
        return Collections.unmodifiableMap(result);
    }

    public record PlanUpdate(String code, String displayName, String description, BaseTier baseTier, Status status,
            String currency, BigDecimal monthlyPrice, BigDecimal yearlyPrice,
            @JsonDeserialize(using = ExactInteger.class) Integer includedAgents,
            @JsonDeserialize(using = ExactInteger.class) Integer ticketLimitMonthly,
            @JsonDeserialize(using = ExactInteger.class) Integer trialDays,
            @JsonDeserialize(using = ExactLong.class) Long storageBytes,
            @JsonDeserialize(using = StrictFeatures.class) Map<String, Object> features,
            @JsonDeserialize(using = ExactLong.class) Long expectedRevision,
            @JsonProperty(access = JsonProperty.Access.WRITE_ONLY) String currentPassword,
            @JsonProperty(access = JsonProperty.Access.WRITE_ONLY) String totpCode) {
        public PublicPlan validated() {
            if (includedAgents == null || ticketLimitMonthly == null || trialDays == null || storageBytes == null
                    || expectedRevision == null || expectedRevision < 0 || expectedRevision == Long.MAX_VALUE)
                throw new IllegalArgumentException("All limits and a non-overflowing expectedRevision are required.");
            return new PublicPlan(code, displayName, description, baseTier, status, currency, true, monthlyPrice,
                    yearlyPrice, includedAgents, ticketLimitMonthly, trialDays, storageBytes,
                    checkedFeatures(features), expectedRevision + 1);
        }
        @JsonAnySetter
        public void rejectUnknown(String name, Object value) { throw new IllegalArgumentException("Unknown plan field."); }
        @Override public String toString() { return "PlanUpdate[credentials redacted]"; }
    }

    public static final class StrictFeatures extends JsonDeserializer<Map<String, Object>> {
        @Override public Map<String, Object> deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (!parser.isExpectedStartObjectToken()) return context.reportInputMismatch(Map.class, "A capability object is required.");
            Map<String, Object> result = new LinkedHashMap<>();
            while (parser.nextToken() != JsonToken.END_OBJECT) {
                String key = parser.currentName();
                if (!parser.hasToken(JsonToken.FIELD_NAME) || !CAPABILITIES.contains(key) || result.containsKey(key))
                    return context.reportInputMismatch(Map.class, "Unknown or duplicate capability.");
                JsonToken value = parser.nextToken();
                if (value != JsonToken.VALUE_TRUE && value != JsonToken.VALUE_FALSE)
                    return context.reportInputMismatch(Map.class, "Capabilities require actual JSON booleans.");
                result.put(key, value == JsonToken.VALUE_TRUE);
            }
            return Collections.unmodifiableMap(result);
        }
    }

    public static final class ExactInteger extends JsonDeserializer<Integer> {
        @Override public Integer deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT)) return context.reportInputMismatch(Integer.class, "A whole number is required.");
            return parser.getIntValue();
        }
    }
    public static final class ExactLong extends JsonDeserializer<Long> {
        @Override public Long deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT)) return context.reportInputMismatch(Long.class, "A whole number is required.");
            return parser.getLongValue();
        }
    }
}
