export interface EmailPayload {
    to: string;
    subject: string;
    text?: string;
    html?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<{ success: boolean; id?: string }> {
    // Stub implementation / ready for SMTP or SES provider
    console.log(`[EMAIL] To: ${payload.to} | Subject: ${payload.subject}`);
    return { success: true, id: `msg_${Date.now()}` };
}
