'use strict';

const { dispatchTelegram } = require('./telegram');
const { dispatchDiscord } = require('./discord');
const { dispatchSlack } = require('./slack');
const { dispatchEmail } = require('./email');
const { dispatchFirebasePush } = require('./firebase-push');

const ALL_CHANNELS = [
  { name: 'telegram', dispatch: dispatchTelegram },
  { name: 'discord', dispatch: dispatchDiscord },
  { name: 'slack', dispatch: dispatchSlack },
  { name: 'email', dispatch: dispatchEmail },
  { name: 'firebase-push', dispatch: dispatchFirebasePush },
];

async function dispatchToAllChannels(context, message, payload) {
  const results = [];

  for (const channel of ALL_CHANNELS) {
    try {
      const result = await channel.dispatch(context, message, payload);
      results.push(result);
    } catch (error) {
      results.push({
        channel: channel.name,
        sent: false,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

function summarizeResults(results) {
  const sent = results.filter((r) => r.sent);
  const failed = results.filter((r) => !r.sent);

  return {
    totalChannels: results.length,
    sent: sent.length,
    failed: failed.length,
    channels: results,
  };
}

module.exports = {
  dispatchToAllChannels,
  summarizeResults,
  ALL_CHANNELS,
};
