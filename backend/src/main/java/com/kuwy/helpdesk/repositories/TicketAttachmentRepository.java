package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.models.TicketAttachment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TicketAttachmentRepository extends JpaRepository<TicketAttachment, Long> {

    @Query("SELECT a FROM TicketAttachment a WHERE a.ticket.id = :ticketId ORDER BY a.createdAt ASC")
    List<TicketAttachment> findByTicketIdOrderByCreatedAtAsc(@Param("ticketId") Long ticketId);

    @Query("SELECT a FROM TicketAttachment a WHERE a.thread.id = :threadId ORDER BY a.createdAt ASC")
    List<TicketAttachment> findByThreadIdOrderByCreatedAtAsc(@Param("threadId") Long threadId);

    @Query("SELECT a FROM TicketAttachment a WHERE a.ticket.id = :ticketId AND a.thread IS NULL ORDER BY a.createdAt ASC")
    List<TicketAttachment> findByTicketIdAndThreadIsNullOrderByCreatedAtAsc(@Param("ticketId") Long ticketId);
}
