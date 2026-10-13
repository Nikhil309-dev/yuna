import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// EventLoader invokes player/node handlers as (...nativeArgs, lavalink, client).
// A previous "remove unused code" pass dropped payload/musicManager params as if
// they were unused, which shifts `client` onto an earlier argument. Any handler
// that reads `client` then sees a payload/manager object and throws. These tests
// lock the positional contract so that regression cannot come back silently.
//
// Native emit arities are taken from lavalink-client:
//   playerCreate(player) · playerDestroy(player, reason)
//   playerMove(player, oldChannelId, newChannelId) · playerUpdate(old, new)
//   queueEnd/trackStart/trackEnd/trackError/trackStuck(player, track, payload)
//   node connect(node) · disconnect(node, reason) · error(node, error)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const eventsDir = path.join(root, 'src', 'events');

const NATIVE_ARITY: Record<string, Record<string, number>> = {
  player: {
    playerCreate: 1,
    playerDestroy: 2,
    playerMove: 3,
    playerUpdate: 2,
    queueEnd: 3,
    trackStart: 3,
    trackEnd: 3,
    trackError: 3,
    trackStuck: 3,
  },
  node: { connect: 1, disconnect: 2, error: 2, reconnecting: 1 },
};

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

// Returns { params, body } for the first execute() method, or null.
function parseExecute(src: string): { params: string[]; body: string } | null {
  const m = src.match(/async\s+execute\s*\(([\s\S]*?)\)\s*\{/);
  if (!m || typeof m.index !== 'number') return null;
  const params = m[1].trim() ? m[1].split(',').map((s) => s.trim()) : [];
  return { params, body: src.slice(m.index + m[0].length) };
}

for (const [kind, arities] of Object.entries(NATIVE_ARITY)) {
  const dir = path.join(eventsDir, kind);
  if (!fs.existsSync(dir)) continue;

  for (const file of walk(dir)) {
    const name = path.basename(file, '.ts');
    const native = arities[name];
    const rel = path.relative(root, file);
    const src = fs.readFileSync(file, 'utf8');
    const parsed = parseExecute(src);
    if (!parsed || native === undefined) continue;

    test(`${rel}: client stays in the last position`, () => {
      // Only enforce the contract when the handler actually consumes `client`;
      // a handler that ignores it may legitimately declare fewer parameters.
      if (!/\bclient\b/.test(parsed.body)) return;

      const last = parsed.params.at(-1)?.split(/[:=]/)[0].trim();
      assert.equal(
        last,
        'client',
        `${rel}: reads \`client\` but the last parameter is \`${last ?? '(none)'}\`. ` +
          `EventLoader appends (lavalink, client) after the ${native} native arg(s).`,
      );
      assert.ok(
        parsed.params.length >= native + 2,
        `${rel}: reads \`client\` with ${parsed.params.length} params, but ${native} ` +
          `native arg(s) + (lavalink, client) need at least ${native + 2}.`,
      );
    });
  }
}
