package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.TicketThread;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TicketThreadRepository extends JpaRepository<TicketThread, Long> {
    List<TicketThread> findByTicketIdOrderByCreatedAtAsc(Long ticketId);
}
