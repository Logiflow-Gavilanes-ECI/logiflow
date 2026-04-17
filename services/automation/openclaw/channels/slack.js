'use strict';

const SLACK_RISK_COLORS = {
  CRITICAL: '#ff0000',
  HIGH: '#ff6b35',
  MEDIUM: '#ffcc00',
  LOW: '#22c55e',
};

function buildSlackPayload(payload, message) {
  const riskLevel = String(payload.riskLevel || 'MEDIUM').toUpperCase();
  const color = SLACK_RISK_COLORS[riskLevel] || SLACK_RISK_COLORS.MEDIUM;

  return {
    attachments: [
      {
        color,
        title: `${riskLevel} ALERT — LogiFlow`,
        text: message,
        footer: 'LogiFlow Automation · OpenClaw',
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };
}

async function dispatchSlack(context, message, payload) {
  const webhookUrl =
    process.env.SLACK_WEBHOOK_URL ||
    context?.config?.slackWebhookUrl;

  if (!webhookUrl) {
    return { channel: 'slack', sent: false, reason: 'not-configured' };
  }

  try {
    const body = JSON.stringify(buildSlackPayload(payload, message));

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      return { channel: 'slack', sent: false, reason: `http-${response.status}` };
    }

    return { channel: 'slack', sent: true };
  } catch (error) {
    return { channel: 'slack', sent: false, reason: error.message };
  }
}

module.exports = { dispatchSlack, buildSlackPayload };
