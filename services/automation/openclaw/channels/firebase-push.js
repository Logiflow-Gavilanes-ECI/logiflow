'use strict';

async function dispatchFirebasePush(context, message, payload) {
  const gatewayUrl =
    process.env.GATEWAY_URL ||
    context?.config?.gatewayUrl ||
    'http://localhost:3002';

  const gatewayApiKey =
    process.env.GATEWAY_INTERNAL_KEY ||
    context?.config?.gatewayInternalKey;

  if (!gatewayApiKey) {
    return { channel: 'firebase-push', sent: false, reason: 'not-configured' };
  }

  const riskLevel = String(payload.riskLevel || 'MEDIUM').toUpperCase();
  const vehicles = Array.isArray(payload.affectedVehicles)
    ? payload.affectedVehicles
    : [];

  try {
    const body = JSON.stringify({
      title: `${riskLevel} Alert — LogiFlow`,
      body: message.substring(0, 200),
      data: {
        type: 'risk_alert',
        eventType: String(payload.eventType),
        riskLevel,
        vehicleIds: vehicles.join(','),
      },
      vehicleIds: vehicles,
    });

    const response = await fetch(`${gatewayUrl}/api/v1/notifications/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gatewayApiKey}`,
      },
      body,
    });

    if (!response.ok) {
      return { channel: 'firebase-push', sent: false, reason: `http-${response.status}` };
    }

    return { channel: 'firebase-push', sent: true };
  } catch (error) {
    return { channel: 'firebase-push', sent: false, reason: error.message };
  }
}

module.exports = { dispatchFirebasePush };
