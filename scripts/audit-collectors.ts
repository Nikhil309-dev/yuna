/**
 * Yuna V2 — collector / button audit.
 *
 * Dispatches each command, captures every message-component collector it
 * creates, then fires candidate customIds (harvested from the source tree) at
 * each collector's filter. Anything that reaches a handler is executed against
 * a mock component interaction. Reports handlers that throw.
 *
 * Usage: npx tsx scripts/audit-collectors.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'yuna-coll-'));
process.env.TOKEN = 'x'.repeat(70);
process.env.CLIENT_ID = '123456789012345678';
process.env.DATABASE_PATH = path.join(TEST_DIR, 'coll.yuna');

const ROOT = path.resolve(process.cwd(), 'src');
const GUILD = '100000000000000001';
const TEST_USER = '555000000000000001';
const BOT = '123456789012345678';

const failures: string[] = [];
let emitted = 0;
let handled = 0;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Harvest plausible customIds from the source and expand templates. */
function harvestCustomIds(): string[] {
  const ids = new Set<string>();
  const re = /setCustomId\(\s*([`"'])([\s\S]*?)\1/g;
  const expand = (raw: string) => {
    let s = raw
      .replace(/\$\{[^}]*guild[^}]*\}/gi, GUILD)
      .replace(/\$\{[^}]*user[^}]*\}/gi, TEST_USER)
      .replace(/\$\{[^}]*page[^}]*\}/gi, '1')
      .replace(/\$\{[^}]*index[^}]*\}/gi, '0')
      .replace(/\$\{[^}]*\}/g, 'x');
    return s;
  };
  for (const file of walk(ROOT)) {
    const src = fs.readFileSync(file, 'utf8');
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(src))) {
      const raw = m[2];
      if (!raw) continue;
      // full expanded id
      ids.add(expand(raw));
      // leading static prefix (before first ${)
      if (raw.includes('${')) ids.add(raw.slice(0, raw.indexOf('${')));
    }
  }
  // common extras
  ['ms_0', 'q_' + GUILD + '_0', 'vol_' + GUILD, 'hist_' + TEST_USER, 'plinfo_select', 'ping_refresh'].forEach((x) => ids.add(x));
  return [...ids].filter(Boolean);
}

async function main() {
  const { config } = await import('../src/config/config');
  const { YunaClient } = await import('../src/core/YunaClient');
  const db = (await import('../src/database/Database')).db;
  const { CommandLoader } = await import('../src/loaders/CommandLoader');
  const { Middleware } = await import('../src/core/Middleware');

  (config as any).ownerIds = [TEST_USER];
  db.guilds.ensureGuild(GUILD);
  db.premium.grantUserPremium(TEST_USER, TEST_USER, Date.now() + 86_400_000, 'audit');
  db.premium.grantGuildPremium(GUILD, TEST_USER, null);

  const client = new YunaClient();
  const loader = new CommandLoader(client as any);
  await loader.load();

  const mkUser = (id: string, username = 'tester') => ({
    id, username, discriminator: '0001', bot: false,
    displayAvatarURL: () => 'https://x/a.png', send: async () => ({ id: 'dm1' }), toString: () => `<@${id}>`,
  });
  const mkChannel = (id: string, type = 0) => ({
    id, type, name: 'channel', isTextBased: () => true, permissionsFor: () => ({ has: () => true }),
    send: async () => mkMessageStub(), messages: { fetch: async () => null },
  });

  // ---- collector capture ---------------------------------------------------
  interface Captured { emitter: EventEmitter; filter: (i: any) => boolean; handler: ((i: any) => any) | null; }
  let captured: Captured[] = [];
  const mkCollector = (options: any = {}) => {
    const emitter: any = new EventEmitter();
    emitter.stop = () => {};
    const entry: Captured = { emitter, filter: typeof options.filter === 'function' ? options.filter : () => true, handler: null };
    const origOn = emitter.on.bind(emitter);
    emitter.on = (evt: string, fn: any) => { if (evt === 'collect' && typeof fn === 'function') entry.handler = fn; return origOn(evt, fn); };
    captured.push(entry);
    return emitter;
  };

  function mkMessageStub(id = 'm1') {
    return {
      id, edit: async () => {}, delete: async () => {}, reply: async () => mkMessageStub(),
      createMessageComponentCollector: (o: any) => mkCollector(o),
    };
  }

  const voiceChannel = { ...mkChannel('vc1', 2), members: new Map() };
  const meMember: any = { id: BOT, voice: { channel: voiceChannel, channelId: 'vc1' }, permissions: { has: () => true }, permissionsIn: () => ({ has: () => true }) };
  const guild: any = {
    id: GUILD, name: 'Test Guild', ownerId: TEST_USER,
    members: { me: meMember, cache: { get: () => meMember, has: () => true, set: () => {}, size: 1 } },
    channels: { cache: { get: () => mkChannel('tc1'), has: () => true, size: 1 }, fetch: async () => mkChannel('tc1'), create: async () => mkChannel('c') },
    roles: { cache: { get: () => ({ id: '9', name: 'r' }), has: () => true, size: 1 } },
    iconURL: () => null,
  };

  const track = { identifier: 'tr1', info: { identifier: 'tr1', title: 'Song', author: 'A', length: 120_000, duration: 120_000, uri: 'https://e/1', artworkUrl: null, sourceName: 'youtube' }, requester: { id: TEST_USER } };
  const queue: any = { tracks: [track], previous: [], current: track, size: 1, add: async () => {}, remove: async () => {}, move: async () => {}, clear: async () => {}, shuffle: async () => {}, splice: async () => {} };
  const player: any = new Proxy(
    {
      guildId: GUILD, voiceChannelId: 'vc1', textChannelId: 'tc1', queue, position: 1000, volume: 100, repeatMode: 'off', playing: true, connected: true, paused: false,
      play: async () => {}, pause: async () => {}, resume: async () => {}, skip: async () => {}, seek: async () => {}, stopPlaying: async () => {}, destroy: async () => {}, connect: async () => {}, disconnect: async () => {}, setVolume: () => {}, setRepeatMode: () => {}, update: async () => {}, set: () => {}, get: () => undefined, setData: () => {}, getData: () => undefined,
      filterManager: { data: {}, setEQ: async () => {}, applyPlayerFilters: async () => {}, resetFilters: async () => {} },
      filters: {}, node: { connected: true }, toJSON: () => ({}),
    },
    { get(t, p) { if (p in t) return (t as any)[p]; return async () => undefined; } },
  );

  Object.defineProperty(client, 'music', { value: { getPlayer: () => player, createPlayer: () => player, search: async () => ({ tracks: [track] }), players: new Map([[GUILD, player]]), lavalink: { nodeManager: { nodes: new Map() } } }, configurable: true });
  Object.defineProperty(client, 'user', { value: mkUser(BOT, 'Yuna'), configurable: true });
  Object.defineProperty(client, 'users', { value: { cache: new Map([[TEST_USER, mkUser(TEST_USER)]]), fetch: async (id: string) => mkUser(id) }, configurable: true });
  Object.defineProperty(client, 'guilds', { value: { cache: new Map([[GUILD, guild]]), fetch: async () => guild }, configurable: true });
  Object.defineProperty(client, 'ws', { value: { ping: 42 }, configurable: true });
  Object.defineProperty(client, 'shard', { value: { ids: [0] }, configurable: true });

  function makeComponentInteraction(customId: string, kind: 'button' | 'select' = 'button'): any {
    const values = kind === 'select' ? ['0'] : [];
    const isSelect = kind === 'select';
    const replies: any[] = [];
    const interaction: any = {
      client, customId, values,
      user: mkUser(TEST_USER), member: { id: TEST_USER, voice: { channel: voiceChannel, channelId: 'vc1' }, permissions: { has: () => true } },
      guild, guildId: GUILD, channel: mkChannel('tc1'), message: { id: 'm1', edit: async () => {} },
      isStringSelectMenu: () => isSelect,
      isSelectMenu: () => isSelect,
      isAnySelectMenu: () => isSelect,
      isUserSelectMenu: () => false, isRoleSelectMenu: () => false, isChannelSelectMenu: () => false, isMentionableSelectMenu: () => false,
      isButton: () => !isSelect, isMessageComponent: () => true, isModalSubmit: () => false,
      deferred: false, replied: false, isRepliable: () => true,
      deferUpdate: async () => { interaction.deferred = true; },
      update: async (p: any) => { replies.push(p); interaction.replied = true; },
      editReply: async (p: any) => { replies.push(p); interaction.replied = true; return mkMessageStub(); },
      reply: async (p: any) => { replies.push(p); interaction.replied = true; return mkMessageStub(); },
      followUp: async (p: any) => { replies.push(p); interaction.replied = true; return mkMessageStub(); },
      fetchReply: async () => mkMessageStub(),
      showModal: async () => {},
      awaitModalSubmit: async () => { throw new Error('modal expired'); },
    };
    return interaction;
  }

  function makeSlashInteraction(cmdName: string, data: any) {
    const values = new Map<string, any>();
    const sub = (data?.options || []).find((o: any) => o.type === 1);
    const group = (data?.options || []).find((o: any) => o.type === 2);
    const flat = data?.options || [];
    const fill = (o: any) => {
      if (o.type === 3) values.set(o.name, o.choices?.[0]?.value ?? 'test');
      else if (o.type === 4 || o.type === 10) values.set(o.name, 1);
      else if (o.type === 5) values.set(o.name, true);
      else if (o.type === 6) values.set(o.name, mkUser(TEST_USER));
    };
    for (const o of flat) fill(o);
    if (sub) (sub.options || []).forEach(fill);
    if (group) (group.options || []).forEach((g: any) => (g.options || []).forEach(fill));

    const interaction: any = {
      type: 2, client, commandName: cmdName, user: mkUser(TEST_USER),
      member: { id: TEST_USER, voice: { channel: voiceChannel, channelId: 'vc1' }, permissions: { has: () => true } },
      guild, channel: mkChannel('tc1'), channelId: 'tc1',
      options: {
        getSubcommand: () => sub?.name ?? (() => { throw new Error('none'); })(),
        getSubcommandGroup: () => group?.name ?? null,
        getString: (n: string) => (values.get(n) == null ? null : String(values.get(n))),
        getInteger: (n: string) => (values.get(n) == null ? null : Number(values.get(n))),
        getNumber: (n: string) => (values.get(n) == null ? null : Number(values.get(n))),
        getBoolean: (n: string) => (values.get(n) == null ? null : Boolean(values.get(n))),
        getUser: (n: string) => values.get(n) ?? null,
        getChannel: (n: string) => null, getRole: (n: string) => null, getMentionable: (n: string) => null,
        getAttachment: (n: string) => null, getFocused: () => 'test',
      },
      inGuild: () => true, deferred: false, replied: false, isRepliable: () => true,
      response: { createMessageComponentCollector: (o: any) => mkCollector(o) },
      deferReply: async () => { interaction.deferred = true; },
      reply: async () => { interaction.replied = true; return mkMessageStub(); },
      editReply: async () => { interaction.replied = true; return mkMessageStub(); },
      followUp: async () => { interaction.replied = true; return mkMessageStub(); },
      fetchReply: async () => mkMessageStub(),
      deleteReply: async () => {}, showModal: async () => {},
    };
    return interaction;
  }

  const commands = [...client.commands.values()] as any[];
  const slashCmds = commands.filter((c) => c.slash?.enabled);
  const slashEvent = (await import('../src/events/discord/guild/slashcmd.ts')).default;
  const candidateIds = harvestCustomIds();
  console.log(`\n\u001b[35m━━━ COLLECTOR AUDIT: ${slashCmds.length} commands · ${candidateIds.length} candidate ids ━━━\u001b[0m`);

  for (const cmd of slashCmds) {
    try { Middleware.anti.clearBlacklist(TEST_USER, cmd.name, GUILD); } catch {}
    try { (db.cooldowns as any).reset(TEST_USER, cmd.name, GUILD); } catch {}
    captured = [];
    const interaction = makeSlashInteraction(cmd.name, cmd.slash.data);
    const orig = cmd.onError;
    cmd.onError = async () => {};
    try { await slashEvent.execute(interaction, client as any); } catch {}
    finally { cmd.onError = orig; }

    if (captured.length === 0) continue;

    for (const entry of captured) {
      if (!entry.handler) continue;
      for (const customId of candidateIds) {
        for (const kind of ['button', 'select'] as const) {
          let passes = false;
          const probe = makeComponentInteraction(customId, kind);
          try { passes = !!entry.filter(probe); } catch { continue; }
          if (!passes) continue;
          emitted++;
          handled++;
          try {
            await (entry.handler as any)(makeComponentInteraction(customId, kind));
          } catch (err: any) {
            failures.push(`${cmd.name} · ${customId} [${kind}]: ${err?.message || err}`);
            console.log(`  \u001b[31m✖\u001b[0m ${cmd.name} · ${customId} [${kind}] — ${String(err?.message || err).slice(0, 120)}`);
          }
        }
      }
    }
  }

  console.log(`\n\u001b[35m════════════ COLLECTOR SUMMARY ════════════\u001b[0m`);
  console.log(`  Handlers fired: \u001b[32m${handled}\u001b[0m / ${emitted} candidates matched filters`);
  console.log(`  Handler crashes: \u001b[31m${failures.length}\u001b[0m`);
  for (const f of failures) console.log(`   \u001b[31m✖\u001b[0m ${f}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => { console.error('collector audit crashed:', err); process.exit(2); });
