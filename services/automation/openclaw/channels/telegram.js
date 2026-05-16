'use strict';

async function dispatchTelegram(context, message) {
  if (context && typeof context.sendMessage === 'function') {
    await context.sendMessage(message);
    return { channel: 'telegram', sent: true };
  }

  if (
    context &&
    context.telegram &&
    typeof context.telegram.sendMessage === 'function' &&
    (context.chatId || context.payload?.chatId)
  ) {
    const chatId = context.chatId || context.payload.chatId;
    await context.telegram.sendMessage(chatId, message);
    return { channel: 'telegram', sent: true };
  }

  return { channel: 'telegram', sent: false, reason: 'transport-unavailable' };
}

module.exports = { dispatchTelegram };
