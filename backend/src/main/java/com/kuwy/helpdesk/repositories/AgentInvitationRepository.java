package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.AgentInvitation;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface AgentInvitationRepository extends JpaRepository<AgentInvitation, Long> {
    Optional<AgentInvitation> findByTokenHash(String tokenHash);
    List<AgentInvitation> findByCompanyIdOrderByCreatedAtDesc(Long companyId);
    List<AgentInvitation> findByCompanyIdAndStatus(Long companyId, AgentInvitation.InvitationStatus status);
    Optional<AgentInvitation> findByCompanyIdAndEmailAndStatus(Long companyId, String email, AgentInvitation.InvitationStatus status);
    long countByCompanyIdAndStatus(Long companyId, AgentInvitation.InvitationStatus status);

    @Query("SELECT i.companyId FROM AgentInvitation i WHERE i.tokenHash = :tokenHash")
    Optional<Long> findCompanyIdByTokenHash(@Param("tokenHash") String tokenHash);

    @Query("SELECT i.companyId FROM AgentInvitation i WHERE i.id = :id")
    Optional<Long> findCompanyIdByInvitationId(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM AgentInvitation i WHERE i.tokenHash = :tokenHash")
    Optional<AgentInvitation> findForConsumptionByTokenHash(@Param("tokenHash") String tokenHash);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM AgentInvitation i WHERE i.id = :id AND i.companyId = :companyId")
    Optional<AgentInvitation> findForUpdateByIdAndCompanyId(@Param("id") Long id,
                                                         @Param("companyId") Long companyId);

    List<AgentInvitation> findByCompanyIdAndEmailIgnoreCaseAndStatusIn(
            Long companyId, String email, Collection<AgentInvitation.InvitationStatus> statuses);

    @Query("SELECT COUNT(i) FROM AgentInvitation i WHERE i.companyId = :companyId "
            + "AND i.status = :status AND i.expiresAt > :now AND LOWER(i.email) <> LOWER(:email)")
    long countLiveInvitationsExcludingEmail(@Param("companyId") Long companyId,
                                           @Param("status") AgentInvitation.InvitationStatus status,
                                           @Param("now") LocalDateTime now, @Param("email") String email);
}
