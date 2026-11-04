package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.models.*;
import com.kuwy.helpdesk.repositories.*;
import com.kuwy.helpdesk.services.storage.StorageManagerService;
import com.kuwy.helpdesk.services.storage.StoredFileResult;
import com.kuwy.helpdesk.tenant.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AttachmentSecurityTest {
    private TicketAttachmentRepository files;
    private TicketRepository tickets;
    private TicketThreadRepository threads;
    private StorageManagerService storage;
    private AttachmentScanner scanner;
    private AttachmentService service;
    private Ticket ticket;
    private TicketAttachment attachment;

    @BeforeEach
    void setUp() {
        files = mock(TicketAttachmentRepository.class);
        tickets = mock(TicketRepository.class);
        threads = mock(TicketThreadRepository.class);
        storage = mock(StorageManagerService.class);
        scanner = mock(AttachmentScanner.class);
        service = new AttachmentService(files, tickets, threads, mock(CompanyRepository.class), storage, scanner);
        Company company = new Company(); company.setId(7L);
        Contact contact = new Contact(); contact.setId(31L); contact.setCompany(company); contact.setEmail("person@example.invalid");
        ticket = new Ticket(); ticket.setId(41L); ticket.setCompany(company); ticket.setContact(contact);
        attachment = new TicketAttachment(); attachment.setId(51L); attachment.setTicket(ticket); attachment.setCompany(company);
        attachment.setFileName("notes.txt"); attachment.setContentType("text/plain"); attachment.setStoragePath("company_7/ticket_41/random.txt");
        when(tickets.findById(41L)).thenReturn(Optional.of(ticket));
        when(files.findById(51L)).thenReturn(Optional.of(attachment));
        TenantContext.clear();
    }

    @AfterEach void clear() { TenantContext.clear(); }

    @Test
    void anonymousOrForeignStaffCannotReadFiles() {
        assertThrows(SecurityException.class, () -> service.getAttachmentById(51L));
        TenantContext.setContext(8L, 11L, "AGENT", "staff@example.invalid");
        assertThrows(SecurityException.class, () -> service.getAttachmentById(51L));
        verifyNoInteractions(storage);
    }

    @Test
    void customerMustOwnTicketAndCannotReadPrivateMessageFiles() {
        TenantContext.setContext(7L, 32L, "CUSTOMER", "other@example.invalid");
        assertThrows(SecurityException.class, () -> service.getAttachmentById(51L));
        TenantContext.setContext(7L, 31L, "CUSTOMER", "person@example.invalid");
        TicketThread thread = new TicketThread(); thread.setId(61L); thread.setCompany(ticket.getCompany()); thread.setTicket(ticket); thread.setIsPrivate(true);
        attachment.setThread(thread);
        assertThrows(SecurityException.class, () -> service.getAttachmentById(51L));
        when(files.findByTicketIdOrderByCreatedAtAsc(41L)).thenReturn(List.of(attachment));
        assertTrue(service.getAttachmentsForTicket(41L).isEmpty());
    }

    @Test
    void uploadedFilesRequireCorrectMessageAndVerifiedTypeBeforeStorage() throws Exception {
        TenantContext.setContext(7L, 11L, "AGENT", "staff@example.invalid");
        Ticket other = new Ticket(); other.setId(42L); other.setCompany(ticket.getCompany());
        TicketThread thread = new TicketThread(); thread.setId(61L); thread.setCompany(ticket.getCompany()); thread.setTicket(other);
        when(threads.findById(61L)).thenReturn(Optional.of(thread));
        assertThrows(SecurityException.class, () -> service.saveAttachment(text(), 7L, 41L, 61L, false));
        assertThrows(SecurityException.class, () -> service.saveAttachment(text(), 8L, 41L, null, false));
        var executableDisguisedAsPng = new MockMultipartFile("files", "image.png", "image/png", "MZ executable".getBytes(StandardCharsets.US_ASCII));
        assertThrows(IllegalArgumentException.class, () -> service.saveAttachment(executableDisguisedAsPng, 7L, 41L, null, false));
        verifyNoInteractions(scanner, storage);
        verify(files, never()).save(any());
    }

    @Test
    void scannerFailureNeverStoresAFileAndCleanTypeIgnoresClientMime() throws Exception {
        TenantContext.setContext(7L, 11L, "AGENT", "staff@example.invalid");
        doThrow(new IllegalStateException("ATTACHMENT_SCAN_UNAVAILABLE")).when(scanner).requireClean(any());
        assertThrows(IllegalStateException.class, () -> service.saveAttachment(text(), 7L, 41L, null, false));
        verifyNoInteractions(storage);
        doNothing().when(scanner).requireClean(any());
        when(storage.storeFile(any(), eq(7L), eq(41L))).thenReturn(new StoredFileResult("notes.txt", "text/html", 14L, "private/path.txt", "LOCAL_DISK", "https://public.example.invalid/secret"));
        when(files.save(any())).thenAnswer(call -> { TicketAttachment result = call.getArgument(0); result.setId(52L); return result; });
        TicketAttachment saved = service.saveAttachment(text(), 7L, 41L, null, true);
        assertEquals("text/plain", saved.getContentType());
        assertEquals("CLEAN", saved.getScanStatus());
        assertFalse(saved.getIsInline());
        assertEquals("/api/v1/attachments/52/download", saved.getDownloadUrl());
    }

    @Test
    void legacyUnscannedFilesCannotBeDownloadedAndOnlyAdminsDelete() {
        TenantContext.setContext(7L, 11L, "AGENT", "staff@example.invalid");
        assertThrows(IllegalStateException.class, () -> service.getResourceForAttachment(attachment));
        assertThrows(SecurityException.class, () -> service.deleteAttachment(51L));
        verifyNoInteractions(storage);
    }

    @Test
    void batchBoundsAreCheckedBeforeAnyStorage() {
        TenantContext.setContext(7L, 11L, "AGENT", "staff@example.invalid");
        assertThrows(IllegalArgumentException.class, () -> service.saveAttachments(new MockMultipartFile[11], 7L, 41L, null));
        var tooLarge = new MockMultipartFile("files", "notes.txt", "text/plain", new byte[10 * 1024 * 1024 + 1]);
        assertThrows(IllegalArgumentException.class, () -> service.saveAttachments(new MockMultipartFile[]{text(), tooLarge}, 7L, 41L, null));
        verifyNoInteractions(storage, scanner);
    }

    private MockMultipartFile text() { return new MockMultipartFile("files", "notes.txt", "text/html", "synthetic text".getBytes(StandardCharsets.UTF_8)); }
}
