package com.kuwy.helpdesk.util;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kuwy.helpdesk.models.Role;
import com.kuwy.helpdesk.models.User;

public final class AccountSecurityPolicy {
    private static final ObjectMapper JSON = new ObjectMapper();
    private AccountSecurityPolicy() {}

    public static boolean requiresTwoFactor(User user) {
        if (user == null || user.getRole() == null || user.getRole().getRoleType() == null) return true;
        Role.RoleType role = user.getRole().getRoleType();
        if (role == Role.RoleType.CUSTOMER) return false;
        if (role == Role.RoleType.SUPER_ADMIN) return true;
        String policy = "REQUIRED_ADMINS";
        String raw = user.getCompany() == null ? null : user.getCompany().getSettingsJson();
        if (raw != null && !raw.isBlank()) {
            if (raw.length() > 100_000) return true;
            try { policy = JSON.readTree(raw).path("security").path("twoFactorPolicy").asText(policy); }
            catch (Exception malformed) { return true; }
        }
        return switch (policy) {
            case "OFF", "OPTIONAL" -> false;
            case "REQUIRED_ADMINS" -> role == Role.RoleType.COMPANY_ADMIN;
            default -> true;
        };
    }

    public static boolean needsSetup(User user) {
        if (user == null) return true;
        return requiresTwoFactor(user) && !Boolean.TRUE.equals(user.getIsTwoFactorEnabled());
    }
}
