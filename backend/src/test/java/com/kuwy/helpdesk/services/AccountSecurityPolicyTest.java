package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Role;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.util.AccountSecurityPolicy;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class AccountSecurityPolicyTest {
    @Test
    void administratorsRequireMfaByDefaultAndPlatformAdminsCannotDisableThePolicy() {
        User admin = user(Role.RoleType.COMPANY_ADMIN, null);
        assertTrue(AccountSecurityPolicy.needsSetup(admin));
        admin.setIsTwoFactorEnabled(true);
        assertFalse(AccountSecurityPolicy.needsSetup(admin));
        assertTrue(AccountSecurityPolicy.needsSetup(user(Role.RoleType.SUPER_ADMIN, "{\"security\":{\"twoFactorPolicy\":\"OFF\"}}")));
    }

    @Test
    void companyPolicyControlsStaffAndMalformedSettingsFailClosed() {
        assertFalse(AccountSecurityPolicy.needsSetup(user(Role.RoleType.AGENT, null)));
        assertTrue(AccountSecurityPolicy.needsSetup(user(Role.RoleType.AGENT, "{\"security\":{\"twoFactorPolicy\":\"REQUIRED_ALL\"}}")));
        assertFalse(AccountSecurityPolicy.needsSetup(user(Role.RoleType.COMPANY_ADMIN, "{\"security\":{\"twoFactorPolicy\":\"OPTIONAL\"}}")));
        assertTrue(AccountSecurityPolicy.needsSetup(user(Role.RoleType.AGENT, "broken")));
        assertTrue(AccountSecurityPolicy.needsSetup(null));
    }

    private User user(Role.RoleType kind, String settings) {
        User user = new User(); Role role = new Role(); role.setRoleType(kind); user.setRole(role);
        Company company = new Company(); company.setSettingsJson(settings); user.setCompany(company); return user;
    }
}
