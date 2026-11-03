package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.AgentInvitation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AgentInvitationRepository extends JpaRepository<AgentInvitation, Long> {
    Optional<AgentInvitation> findByTokenHash(String tokenHash);
    List<AgentInvitation> findByCompanyIdOrderByCreatedAtDesc(Long companyId);
    List<AgentInvitation> findByCompanyIdAndStatus(Long companyId, AgentInvitation.InvitationStatus status);
    Optional<AgentInvitation> findByCompanyIdAndEmailAndStatus(Long companyId, String email, AgentInvitation.InvitationStatus status);
    long countByCompanyIdAndStatus(Long companyId, AgentInvitation.InvitationStatus status);
}

