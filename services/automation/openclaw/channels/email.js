'use strict';

const RISK_SUBJECT_PREFIX = {
  CRITICAL: '[CRITICAL]',
  HIGH: '[HIGH]',
  MEDIUM: '[MEDIUM]',
  LOW: '[LOW]',
};

function buildEmailHtml(payload, message) {
  const riskLevel = String(payload.riskLevel || 'MEDIUM').toUpperCase();
  const lines = message.split('\n').map((line) => `<p style="margin:4px 0;">${line}</p>`).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Space Mono',Consolas,monospace;background:#0d1420;color:#e2e8f0;padding:24px;">
  <div style="max-width:600px;margin:0 auto;background:#111827;border-radius:12px;padding:24px;border:1px solid #1e293b;">
    <h2 style="color:#00e5ff;margin-top:0;">LogiFlow — ${riskLevel} Alert</h2>
    <div style="font-size:13px;line-height:1.6;">${lines}</div>
    <hr style="border:none;border-top:1px solid #1e293b;margin:16px 0;">
    <p style="font-size:10px;color:#64748b;">LogiFlow Automation · OpenClaw · ${new Date().toISOString()}</p>
  </div>
</body>
</html>`.trim();
}

async function dispatchEmail(context, message, payload) {
  const smtpEndpoint =
    process.env.EMAIL_WEBHOOK_URL ||
    context?.config?.emailWebhookUrl;

  const recipients =
    process.env.EMAIL_RECIPIENTS ||
    context?.config?.emailRecipients;

  if (!smtpEndpoint || !recipients) {
    return { channel: 'email', sent: false, reason: 'not-configured' };
  }

  const riskLevel = String(payload.riskLevel || 'MEDIUM').toUpperCase();
  const prefix = RISK_SUBJECT_PREFIX[riskLevel] || RISK_SUBJECT_PREFIX.MEDIUM;

  try {
    const body = JSON.stringify({
      to: recipients.split(',').map((e) => e.trim()),
      subject: `${prefix} LogiFlow Alert — ${payload.eventType}`,
      html: buildEmailHtml(payload, message),
      text: message,
    });

    const response = await fetch(smtpEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      return { channel: 'email', sent: false, reason: `http-${response.status}` };
    }

    return { channel: 'email', sent: true };
  } catch (error) {
    return { channel: 'email', sent: false, reason: error.message };
  }
}

module.exports = { dispatchEmail, buildEmailHtml };
