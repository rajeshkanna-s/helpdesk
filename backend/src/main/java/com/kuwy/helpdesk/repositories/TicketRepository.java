package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.Ticket;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface TicketRepository extends JpaRepository<Ticket, Long> {

    Page<Ticket> findByCompanyId(Long companyId, Pageable pageable);

    Page<Ticket> findByCompanyIdAndStatus(Long companyId, Ticket.TicketStatus status, Pageable pageable);

    Page<Ticket> findByCompanyIdAndAssignedAgentId(Long companyId, Long agentId, Pageable pageable);

    Optional<Ticket> findByCompanyIdAndTicketNumber(Long companyId, String ticketNumber);

    @Query("SELECT t FROM Ticket t WHERE t.company.id = :companyId AND LOWER(t.contact.email) = LOWER(:email) ORDER BY t.createdAt DESC")
    java.util.List<Ticket> findByCompanyIdAndContactEmail(@Param("companyId") Long companyId, @Param("email") String email);

    // Email Threading Lookups (Internet Message-ID and MS Conversation ID)
    Optional<Ticket> findByCompanyIdAndInternetMessageId(Long companyId, String internetMessageId);

    Optional<Ticket> findByCompanyIdAndMsConversationId(Long companyId, String msConversationId);

    // Dashboard Statistics Queries
    long countByCompanyId(Long companyId);

    long countByCompanyIdAndStatus(Long companyId, Ticket.TicketStatus status);

    @Query("SELECT COUNT(t) FROM Ticket t WHERE t.company.id = :companyId AND t.status NOT IN ('RESOLVED', 'CLOSED') AND t.firstResponseDueAt < CURRENT_TIMESTAMP")
    long countBreachedSla(@Param("companyId") Long companyId);

    @Query("SELECT MAX(t.id) FROM Ticket t WHERE t.company.id = :companyId")
    Long findMaxTicketIdForCompany(@Param("companyId") Long companyId);

    @Query("SELECT COUNT(t) FROM Ticket t WHERE t.company.id = :companyId AND t.createdAt >= :afterDate")
    long countByCompanyIdAndCreatedAtAfter(@Param("companyId") Long companyId, @Param("afterDate") java.time.LocalDateTime afterDate);

    @Query(value = "SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number, LOCATE('-', ticket_number) + 1) AS UNSIGNED)), 1000) FROM tickets WHERE company_id = :companyId", nativeQuery = true)
    Long findMaxTicketSequenceForCompany(@Param("companyId") Long companyId);
}
