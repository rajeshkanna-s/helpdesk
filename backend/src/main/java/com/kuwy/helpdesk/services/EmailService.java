package com.kuwy.helpdesk.services;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import jakarta.mail.internet.MimeMessage;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {

    @Autowired(required = false)
    private JavaMailSender mailSender;

    @Value("${spring.mail.username:support@kuwy.in}")
    private String defaultFromAddress;

    public void sendCustomerOtp(String toEmail, String otpCode, String companyName) {
        String subject = "[" + companyName + "] Your Verification Code: " + otpCode;
        String htmlBody = "<div style='font-family:sans-serif;max-width:540px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;'>"
                + "<h2 style='color:#0d6efd;margin-top:0;'>" + companyName + " Support Portal</h2>"
                + "<p>You requested a one-time verification code to access your customer support tickets.</p>"
                + "<div style='background:#f1f5f9;padding:16px;border-radius:8px;text-align:center;font-size:28px;font-weight:bold;letter-spacing:6px;color:#0f172a;margin:20px 0;'>"
                + otpCode
                + "</div>"
                + "<p style='color:#64748b;font-size:13px;'>This code will expire in 5 minutes. If you did not request this, you can safely ignore this email.</p>"
                + "</div>";

        sendHtmlEmail(toEmail, subject, htmlBody);
    }

    public void sendTicketConfirmation(String toEmail, String ticketNumber, String subjectText, String companyName) {
        String subject = "[" + ticketNumber + "] Support Request Received: " + subjectText;
        String htmlBody = "<div style='font-family:sans-serif;max-width:540px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;'>"
                + "<h3 style='color:#0f172a;margin-top:0;'>Your request has been received</h3>"
                + "<p>Thank you for contacting <strong>" + companyName + "</strong> support. Your ticket reference is <strong>#" + ticketNumber + "</strong>.</p>"
                + "<p>Our certified support team will respond in accordance with your category SLA.</p>"
                + "<p style='color:#64748b;font-size:13px;'>To track the status or add comments, log in to your customer portal.</p>"
                + "</div>";

        sendHtmlEmail(toEmail, subject, htmlBody);
    }

    public void sendAgentReplyNotification(String toEmail, String ticketNumber, String replyContent, String companyName) {
        String subject = "Update on [" + ticketNumber + "] from " + companyName + " Support";
        String htmlBody = "<div style='font-family:sans-serif;max-width:540px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;'>"
                + "<h3 style='color:#0f172a;margin-top:0;'>New response on ticket #" + ticketNumber + "</h3>"
                + "<div style='background:#f8fafc;padding:16px;border-left:4px solid #0d6efd;margin:16px 0;font-size:14px;color:#1e293b;'>"
                + replyContent
                + "</div>"
                + "<p style='color:#64748b;font-size:13px;'>You can reply directly via the customer portal.</p>"
                + "</div>";

        sendHtmlEmail(toEmail, subject, htmlBody);
    }

    public void sendHtmlEmail(String toEmail, String subject, String htmlContent) {
        if (mailSender != null) {
            try {
                MimeMessage message = mailSender.createMimeMessage();
                MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
                helper.setFrom(defaultFromAddress);
                helper.setTo(toEmail);
                helper.setSubject(subject);
                helper.setText(htmlContent, true);
                mailSender.send(message);
                log.info("Dispatched email to [{}] with subject '{}'", toEmail, subject);
                return;
            } catch (Exception e) {
                log.warn("Failed to dispatch email via SMTP (will record as simulated dispatch): {}", e.getMessage());
            }
        }
        // Simulated / Local development dispatch log
        log.info("[SIMULATED EMAIL DISPATCH] To: {} | Subject: '{}' | Content length: {} chars",
                toEmail, subject, htmlContent.length());
    }
}
