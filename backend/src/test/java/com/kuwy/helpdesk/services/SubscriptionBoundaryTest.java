package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.CompanySubscription;
import com.kuwy.helpdesk.repositories.*;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SubscriptionBoundaryTest {
    @Test
    void missingExpiredAndInactiveWorkspacesCannotConsumeResources() {
        CompanyRepository companies = mock(CompanyRepository.class);
        CompanySubscriptionRepository subscriptions = mock(CompanySubscriptionRepository.class);
        SubscriptionService service = new SubscriptionService(companies, subscriptions, mock(TicketRepository.class), mock(UserRepository.class));
        Company company = new Company(); company.setId(7L);
        when(companies.findById(7L)).thenReturn(Optional.of(company));
        when(subscriptions.findByCompanyId(7L)).thenReturn(Optional.empty());
        assertTrue(service.isWorkspaceLocked(7L));
        assertThrows(IllegalStateException.class, () -> service.assertCanCreateTicket(7L));
        assertThrows(IllegalStateException.class, () -> service.assertCanAddAgent(7L));
        CompanySubscription trial = new CompanySubscription(); trial.setStatus(CompanySubscription.SubscriptionStatus.TRIAL);
        trial.setCurrentPeriodEnd(LocalDateTime.now().minusDays(1));
        when(subscriptions.findByCompanyId(7L)).thenReturn(Optional.of(trial));
        assertTrue(service.isWorkspaceLocked(7L));
        trial.setCurrentPeriodEnd(LocalDateTime.now().plusDays(14));
        assertFalse(service.isWorkspaceLocked(7L));
        company.setStatus(Company.CompanyStatus.INACTIVE);
        assertTrue(service.isWorkspaceLocked(7L));
    }
}
