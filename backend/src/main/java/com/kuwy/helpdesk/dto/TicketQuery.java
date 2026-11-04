package com.kuwy.helpdesk.dto;

import com.kuwy.helpdesk.models.Ticket;
import lombok.Getter;
import lombok.Setter;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

@Getter
@Setter
public class TicketQuery {
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    private Long companyId;
    private String status;
    private Long agentId;
    private int page;
    private int size = 25;
    private String sortBy = "createdAt";
    private String order = "desc";
    private String q;
    private String priority;
    private Long departmentId;
    private boolean unassigned;
    private String customerEmail;
    private Long contactId;
    private String channel;
    private String from;
    private String to;
    private String slaStatus;

    public void validate() {
        if (page < 0 || page > 100_000 || !Set.of(1, 25, 50, 100).contains(size)) {
            throw new IllegalArgumentException("page must be 0..100000 and size must be 1, 25, 50 or 100.");
        }
        if ((companyId != null && companyId <= 0) || (agentId != null && agentId <= 0)
                || (departmentId != null && departmentId <= 0) || (contactId != null && contactId <= 0)) {
            throw new IllegalArgumentException("Ticket filter IDs must be positive.");
        }
        if (unassigned && agentId != null) {
            throw new IllegalArgumentException("agentId cannot be combined with unassigned=true.");
        }
        q = text(q, 250, "q");
        customerEmail = text(customerEmail, 254, "customerEmail");
        if (customerEmail != null && !EMAIL.matcher(customerEmail).matches()) {
            throw new IllegalArgumentException("customerEmail must be a valid email address.");
        }
        status = enumName(status, Ticket.TicketStatus.class, "status");
        priority = enumName(priority, Ticket.TicketPriority.class, "priority");
        channel = enumName(channel, Ticket.TicketChannel.class, "channel");
        slaStatus = enumName(slaStatus, Ticket.SlaStatus.class, "slaStatus");
        sortBy = text(sortBy, 16, "sortBy");
        sortBy = switch (sortBy == null ? "createdat" : sortBy.toLowerCase(Locale.ROOT)) {
            case "createdat" -> "createdAt";
            case "updatedat" -> "updatedAt";
            case "priority" -> "priority";
            default -> throw new IllegalArgumentException("sortBy must be createdAt, updatedAt or priority.");
        };
        order = text(order, 4, "order");
        order = order == null ? "desc" : order.toLowerCase(Locale.ROOT);
        if (!Set.of("asc", "desc").contains(order)) {
            throw new IllegalArgumentException("order must be asc or desc.");
        }
        from = text(from, 40, "from");
        to = text(to, 40, "to");
        LocalDateTime start = fromDateTime();
        LocalDateTime end = toDateTime();
        if (start != null && end != null && start.isAfter(end)) {
            throw new IllegalArgumentException("from must not be after to.");
        }
    }

    public LocalDateTime fromDateTime() { return dateTime(from, false); }
    public LocalDateTime toDateTime() { return dateTime(to, true); }

    private static String text(String value, int limit, String field) {
        if (value != null && value.length() > limit) {
            throw new IllegalArgumentException(field + " must not exceed " + limit + " characters.");
        }
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static <E extends Enum<E>> String enumName(String value, Class<E> type, String field) {
        String normalized = text(value, 32, field);
        if (normalized == null) return null;
        try {
            return Enum.valueOf(type, normalized.toUpperCase(Locale.ROOT)).name();
        } catch (IllegalArgumentException invalid) {
            throw new IllegalArgumentException("Invalid ticket " + field + ".");
        }
    }

    private static LocalDateTime dateTime(String value, boolean endOfDay) {
        if (value == null) return null;
        try {
            LocalDateTime parsed = value.length() == 10
                    ? LocalDate.parse(value).atTime(endOfDay ? LocalTime.of(23, 59, 59, 999_999_000) : LocalTime.MIN)
                    : LocalDateTime.parse(value);
            if (parsed.getYear() < 1000 || parsed.getYear() > 9999) throw new DateTimeException("Out of range");
            return parsed;
        } catch (DateTimeException invalid) {
            throw new IllegalArgumentException("from/to must be ISO local dates or date-times with years 1000..9999.");
        }
    }
}
