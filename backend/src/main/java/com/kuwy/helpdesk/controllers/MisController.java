package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.dto.MisFilterDto;
import com.kuwy.helpdesk.dto.MisSummaryDto;
import com.kuwy.helpdesk.dto.MisTrackItemDto;
import com.kuwy.helpdesk.models.Ticket;
import com.kuwy.helpdesk.services.MisService;
import com.kuwy.helpdesk.tenant.TenantContext;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;

@Slf4j
@RestController
@RequestMapping("/api/v1/mis")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class MisController {

    private final MisService misService;

    @GetMapping("/track")
    public ResponseEntity<Page<MisTrackItemDto>> getTrackingData(
            @RequestParam(required = false) Long companyId,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String priority,
            @RequestParam(required = false) String channel,
            @RequestParam(required = false) String slaStatus,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        Long targetCompanyId = TenantContext.isSuperAdmin() && companyId != null
                ? companyId
                : TenantContext.getCompanyId();
        TenantContext.assertAccessTo(targetCompanyId);

        MisFilterDto filter = MisFilterDto.builder()
                .companyId(targetCompanyId)
                .departmentId(departmentId)
                .status(status)
                .priority(priority)
                .channel(channel)
                .slaStatus(slaStatus)
                .search(search)
                .build();

        return ResponseEntity.ok(misService.getTrackingData(targetCompanyId, filter, PageRequest.of(page, size)));
    }

    @GetMapping("/summary")
    public ResponseEntity<MisSummaryDto> getSummary(@RequestParam(required = false) Long companyId) {
        Long targetCompanyId = TenantContext.isSuperAdmin() && companyId != null
                ? companyId
                : TenantContext.getCompanyId();
        TenantContext.assertAccessTo(targetCompanyId);

        return ResponseEntity.ok(misService.getMisSummary(targetCompanyId));
    }

    @GetMapping("/export/excel")
    public void exportExcel(
            @RequestParam(required = false) Long companyId,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String priority,
            @RequestParam(required = false) String channel,
            @RequestParam(required = false) String slaStatus,
            @RequestParam(defaultValue = "100000") int rows,
            HttpServletResponse response
    ) throws IOException {
        Long targetCompanyId = TenantContext.isSuperAdmin() && companyId != null
                ? companyId
                : TenantContext.getCompanyId();
        TenantContext.assertAccessTo(targetCompanyId);

        // Cap at 200,000 max for safety
        int safeRows = Math.min(Math.max(rows, 10), 200000);

        MisFilterDto filter = MisFilterDto.builder()
                .companyId(targetCompanyId)
                .departmentId(departmentId)
                .status(status)
                .priority(priority)
                .channel(channel)
                .slaStatus(slaStatus)
                .build();

        log.info("Starting Streaming SXSSFWorkbook Excel export for company {} with {} rows...", targetCompanyId, safeRows);
        misService.exportToExcel(targetCompanyId, filter, safeRows, response);
    }
}
