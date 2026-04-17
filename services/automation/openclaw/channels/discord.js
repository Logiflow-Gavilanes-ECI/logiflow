'use strict';

const DISCORD_RISK_COLORS = {
  CRITICAL: 0xff0000,
  HIGH: 0xff6b35,
  MEDIUM: 0xffcc00,
  LOW: 0x22c55e,
};

function buildDiscordEmbed(payload, message) {
  const riskLevel = String(payload.riskLevel || 'MEDIUM').toUpperCase();
  const color = DISCORD_RISK_COLORS[riskLevel] || DISCORD_RISK_COLORS.MEDIUM;

  return {
    embeds: [
      {
        title: `${riskLevel} ALERT — LogiFlow`,
        description: message,
        color,
        footer: { text: 'LogiFlow Automation · OpenClaw' },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

async function dispatchDiscord(context, message, payload) {
  const webhookUrl =
    process.env.DISCORD_WEBHOOK_URL ||
    context?.config?.discordWebhookUrl;

  if (!webhookUrl) {
    return { channel: 'discord', sent: false, reason: 'not-configured' };
  }

  try {
    const body = JSON.stringify(buildDiscordEmbed(payload, message));

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      return { channel: 'discord', sent: false, reason: `http-${response.status}` };
    }

    return { channel: 'discord', sent: true };
  } catch (error) {
    return { channel: 'discord', sent: false, reason: error.message };
  }
}

module.exports = { dispatchDiscord, buildDiscordEmbed };
