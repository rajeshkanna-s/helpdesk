package com.kuwy.helpdesk.tenant;

/**
 * ThreadLocal storage for the active company tenant ID in request context.
 */
public final class TenantContext {

    private static final ThreadLocal<Long> CURRENT_TENANT = new ThreadLocal<>();

    private TenantContext() {
    }

    public static void setCompanyId(Long companyId) {
        CURRENT_TENANT.set(companyId);
    }

    public static Long getCompanyId() {
        return CURRENT_TENANT.get();
    }

    public static void clear() {
        CURRENT_TENANT.remove();
    }
}
