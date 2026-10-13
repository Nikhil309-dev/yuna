import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventUtils } from '../src/utils/EventUtils';

// resolvePosition bridges nodes whose websocket never emits `playerUpdate`
// frames: it reads the authoritative REST state. These cases lock the fallback
// behaviour that keeps the progress bar moving on such nodes.

test('uses websocket position when no node REST is available', async () => {
  assert.equal(await EventUtils.resolvePosition({ position: 1234 }), 1234);
  assert.equal(await EventUtils.resolvePosition({}), 0);
});

test('prefers the node REST position when the socket is silent', async () => {
  const player = {
    position: 0,
    guildId: '1',
    node: { sessionId: 's', request: async () => ({ state: { position: 42000 } }) },
  };
  assert.equal(await EventUtils.resolvePosition(player), 42000);
});

test('never moves the bar backwards', async () => {
  const player = {
    position: 60000,
    guildId: '1',
    node: { sessionId: 's', request: async () => ({ state: { position: 50000 } }) },
  };
  assert.equal(await EventUtils.resolvePosition(player), 60000);
});

test('falls back to the websocket position when REST fails', async () => {
  const player = {
    position: 3000,
    guildId: '1',
    node: { sessionId: 's', request: async () => { throw new Error('boom'); } },
  };
  assert.equal(await EventUtils.resolvePosition(player), 3000);
});
