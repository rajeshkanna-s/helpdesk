package com.kuwy.helpdesk.tenant;

import com.kuwy.helpdesk.models.Role;

import java.util.Locale;

/**
 * ThreadLocal storage for the active tenant user context.
 * Enforces strict multi-tenant isolation and prevents cross-tenant data leakage.
 */
public final class TenantContext {

    private static final ThreadLocal<Long> CURRENT_TENANT = new ThreadLocal<>();
    private static final ThreadLocal<Long> CURRENT_USER_ID = new ThreadLocal<>();
    private static final ThreadLocal<String> CURRENT_USER_ROLE = new ThreadLocal<>();
    private static final ThreadLocal<String> CURRENT_USER_EMAIL = new ThreadLocal<>();

    private TenantContext() {
    }

    public static void setContext(Long companyId, Long userId, String role, String email) {
        CURRENT_TENANT.set(companyId);
        CURRENT_USER_ID.set(userId);
        CURRENT_USER_ROLE.set(role == null ? null : role.trim().toUpperCase(Locale.ROOT));
        CURRENT_USER_EMAIL.set(email);
    }

    public static void setCompanyId(Long companyId) {
        CURRENT_TENANT.set(companyId);
    }

    public static Long getCompanyId() {
        return CURRENT_TENANT.get();
    }

    public static Long getUserId() {
        return CURRENT_USER_ID.get();
    }

    public static String getUserRole() {
        return CURRENT_USER_ROLE.get();
    }

    public static String getUserEmail() {
        return CURRENT_USER_EMAIL.get();
    }

    public static boolean isSuperAdmin() {
        String role = CURRENT_USER_ROLE.get();
        return isAuthenticated() && Role.RoleType.SUPER_ADMIN.name().equals(role);
    }

    public static boolean isAuthenticated() {
        Long userId = getUserId();
        String email = getUserEmail();
        String role = getUserRole();
        if (userId == null || userId <= 0 || email == null || email.isBlank() || role == null) {
            return false;
        }
        try {
            Role.RoleType roleType = Role.RoleType.valueOf(role);
            if (roleType == Role.RoleType.CUSTOMER) return false;
            return roleType == Role.RoleType.SUPER_ADMIN || getCompanyId() != null && getCompanyId() > 0;
        } catch (IllegalArgumentException invalidRole) {
            return false;
        }
    }

    /**
     * Checks if current context has permission to access a resource belonging to targetCompanyId.
     * Super Admin has cross-tenant access. All other roles are strictly bound to their own company.
     */
    public static boolean hasAccessTo(Long targetCompanyId) {
        if (!isAuthenticated() || targetCompanyId == null || targetCompanyId <= 0) {
            return false;
        }
        if (isSuperAdmin()) {
            return true;
        }
        Long currentTenant = getCompanyId();
        return currentTenant != null && currentTenant.equals(targetCompanyId);
    }

    /**
     * Asserts that current context has access to targetCompanyId.
     * Throws SecurityException if cross-tenant violation is detected.
     */
    public static void assertAccessTo(Long targetCompanyId) {
        if (!hasAccessTo(targetCompanyId)) {
            throw new SecurityException("Access to this workspace is not permitted.");
        }
    }

    public static void clear() {
        CURRENT_TENANT.remove();
        CURRENT_USER_ID.remove();
        CURRENT_USER_ROLE.remove();
        CURRENT_USER_EMAIL.remove();
    }
}
