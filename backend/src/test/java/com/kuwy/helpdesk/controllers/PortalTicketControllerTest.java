package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.dto.PortalTicketDto;
import com.kuwy.helpdesk.services.PortalTicketService;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PortalTicketControllerTest {
    @Mock private PortalTicketService tickets;
    @InjectMocks private PublicPortalController controller;

    @Test
    void ticketRoutesExposePagesAndFlatPublicDtosWithoutRequiringCallerEmail() throws Exception {
        try (AutoCloseable ignored = MockitoAnnotations.openMocks(this)) {
            var dto = new PortalTicketDto(21L, "ACME-1001", "Public", "Body", null, null, null,
                    null, null, null, null, List.of(), List.of(), null);
            when(tickets.list("acme", null, 0, 25, null, null))
                    .thenReturn(new PageImpl<>(List.of(dto), PageRequest.of(0, 25), 1));
            when(tickets.detail("acme", "ACME-1001", null)).thenReturn(dto);
            when(tickets.reply("acme", "ACME-1001", Map.of("reply", "hello"))).thenReturn(dto);
            var mvc = MockMvcBuilders.standaloneSetup(controller).build();
            mvc.perform(get("/api/v1/portal/acme/tickets")).andExpect(status().isOk())
                    .andExpect(jsonPath("$.content[0].ticketNumber").value("ACME-1001"))
                    .andExpect(jsonPath("$.totalElements").value(1));
            mvc.perform(get("/api/v1/portal/acme/tickets/ACME-1001")).andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(21)).andExpect(jsonPath("$.threads").isArray())
                    .andExpect(jsonPath("$.company").doesNotExist()).andExpect(jsonPath("$.assignedAgent").doesNotExist());
            mvc.perform(post("/api/v1/portal/acme/tickets/ACME-1001/reply").contentType("application/json")
                    .content("{\"reply\":\"hello\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(21));
            verify(tickets).reply("acme", "ACME-1001", Map.of("reply", "hello"));
        }
    }
}
