/**
 * Yuna V2 — dynamic dispatch audit.
 *
 * Drives EVERY command through the real interactionCreate dispatcher (slash)
 * and the real messageCreate dispatcher (prefix) with a rich mock, across
 * several input scenarios (happy / missing / huge / unicode). Reports:
 *   • commands whose handler throws (unhandled crash)
 *   • commands that defer but never respond (user stuck on "loading")
 *
 * Usage: npx tsx scripts/audit-dispatch.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'yuna-disp-'));
process.env.TOKEN = 'x'.repeat(70);
process.env.CLIENT_ID = '123456789012345678';
process.env.DATABASE_PATH = path.join(TEST_DIR, 'disp.yuna');

const GUILD = '100000000000000001';
const TEST_USER = '555000000000000001';
const BOT = '123456789012345678';

type Mode = 'happy' | 'missing' | 'huge' | 'unicode';
const MODES: Mode[] = ['happy', 'missing', 'huge', 'unicode'];
const HUGE = 'x'.repeat(4000);
const UNICODE = '🎵 مرحبا 日本語 ǝɹʇ Ñoño <@123> @everyone `code` \\n\\t😀';

const crashes: string[] = [];
const silent: string[] = [];
let runs = 0;

function report(cmd: string, mode: string, kind: string, detail = '') {
  const line = `${cmd} [${mode}]${detail ? ` — ${detail}` : ''}`;
  if (kind === 'crash') { crashes.push(line); console.log(`  \u001b[31m✖\u001b[0m ${line}`); }
  else { silent.push(line); console.log(`  \u001b[33m⚠\u001b[0m ${line}`); }
}

function reportStack(cmd: string, mode: string, err: any) {
  const stack = String(err?.stack || err).split('\n').slice(0, 10).join(' | ');
  console.log(`      \u001b[90m↳ ${stack.slice(0, 600)}\u001b[0m`);
}

async function main() {
  const { config } = await import('../src/config/config');
  const { YunaClient } = await import('../src/core/YunaClient');
  const db = (await import('../src/database/Database')).db;
  const { CommandLoader } = await import('../src/loaders/CommandLoader');

  (config as any).ownerIds = [TEST_USER];
  db.guilds.ensureGuild(GUILD);
  db.premium.grantUserPremium(TEST_USER, TEST_USER, Date.now() + 86_400_000, 'audit');
  db.premium.grantGuildPremium(GUILD, TEST_USER, null);

  const client = new YunaClient();
  const loader = new CommandLoader(client as any);
  await loader.load();

  // ---- mock player ---------------------------------------------------------
  const track = { identifier: 'tr1', encoded: 'enc', info: { identifier: 'tr1', title: 'Test Song', author: 'Artist', length: 120_000, duration: 120_000, uri: 'https://example.com/tr1', artworkUrl: 'https://example.com/a.png', sourceName: 'youtube' }, requester: { id: TEST_USER } };
  const queue: any = {
    tracks: [track, { ...track, identifier: 'tr2', info: { ...track.info, identifier: 'tr2', title: 'Second' } }],
    previous: [], current: track, size: 2, duration: 240_000,
    add: async (t: any) => { const a = Array.isArray(t) ? t : [t]; queue.tracks.push(...a); queue.size = queue.tracks.length; },
    remove: async (i: number) => { queue.tracks.splice(i, 1); queue.size = queue.tracks.length; },
    move: async (from: number, to: number) => { const [x] = queue.tracks.splice(from, 1); queue.tracks.splice(to, 0, x); },
    clear: async () => { queue.tracks = []; queue.size = 0; },
    shuffle: async () => { queue.tracks.reverse(); },
    splice: async (i: number, n: number, ...t: any[]) => { queue.tracks.splice(i, n, ...t); },
  };
  const player: any = {
    guildId: GUILD, voiceChannelId: 'vc1', textChannelId: 'tc1',
    queue, position: 10_000, volume: 100, repeatMode: 'off', playing: true, connected: true, paused: false,
    play: async () => {}, pause: async () => {}, resume: async () => {}, skip: async () => {},
    seek: async () => {}, stopPlaying: async () => {}, destroy: async () => {}, connect: async () => {},
    disconnect: async () => {}, setVolume: () => {}, setRepeatMode: () => {}, update: async () => {},
    set: () => {}, get: () => undefined, setData: () => {}, getData: () => undefined,
    filterManager: {
      data: {}, setEQ: async () => {}, applyPlayerFilters: async () => {}, resetFilters: async () => {},
      setTimescale: async () => {}, clearFilters: async () => {},
    },
    filters: { timescale: {}, equalizer: {}, karaoke: {}, tremolo: {}, vibrato: {}, rotation: {}, distortion: {}, channelMix: {}, lowPass: {}, volume: 1 },
    node: { connected: true, options: {}, id: 'node1', sessionId: 'sess1' },
    toJSON: () => ({}),
  };
  const safePlayer = new Proxy(player, {
    get(target, prop) {
      if (prop in target) return (target as any)[prop];
      if (typeof prop === 'string' && /^(get|set)/.test(prop)) return () => undefined;
      return async () => undefined;
    },
  });

  const mkUser = (id: string, username = 'tester') => ({
    id, username, discriminator: '0001', globalName: username, bot: false,
    displayAvatarURL: () => 'https://example.com/avatar.png', defaultAvatarURL: 'https://example.com/a.png',
    send: async () => ({ id: 'dm1', edit: async () => {}, delete: async () => {} }),
    createDM: async () => ({ send: async () => ({ id: 'dm1' }) }), toString: () => `<@${id}>`,
  });
  const mkChannel = (id: string, type = 0) => ({
    id, type, name: 'channel', isTextBased: () => true, isVoiceBased: () => type === 2,
    permissionsFor: () => ({ has: () => true }),
    send: async (_p: any) => ({ id: 'm1', edit: async () => {}, delete: async () => {}, createMessageComponentCollector: () => new EventEmitter() }),
    messages: { fetch: async () => null },
  });
  const voiceChannel = { ...mkChannel('vc1', 2), members: new Map(), userLimit: 0, joinable: true, full: false };
  const selfUser = mkUser(BOT, 'Yuna');

  Object.defineProperty(client, 'music', {
    value: { getPlayer: () => safePlayer, createPlayer: () => safePlayer, search: async () => ({ tracks: [track] }), players: new Map([[GUILD, safePlayer]]), lavalink: { nodeManager: { nodes: new Map() }, search: async () => ({ tracks: [track] }) } },
    configurable: true,
  });
  Object.defineProperty(client, 'user', { value: selfUser, configurable: true });
  Object.defineProperty(client, 'users', { value: { cache: new Map([[TEST_USER, mkUser(TEST_USER)]]), fetch: async (id: string) => mkUser(id), resolve: (id: string) => mkUser(id) }, configurable: true });
  Object.defineProperty(client, 'ws', { value: { ping: 42 }, configurable: true });
  Object.defineProperty(client, 'shard', { value: { ids: [0] }, configurable: true });

  const meMember: any = {
    id: BOT, user: selfUser, displayName: 'Yuna',
    voice: { channel: voiceChannel, channelId: 'vc1' },
    permissions: { has: () => true, missing: () => [] }, permissionsIn: () => ({ has: () => true }), roles: { cache: new Map() },
  };
  const guild: any = {
    id: GUILD, name: 'Test Guild', ownerId: TEST_USER,
    members: { me: meMember, cache: { get: (id: string) => (id === BOT ? meMember : mkUser(id)), has: () => true, set: () => {}, size: 1 }, fetch: async () => meMember },
    channels: { cache: { get: () => mkChannel('tc1'), has: () => true, size: 1 }, fetch: async () => mkChannel('tc1'), create: async () => mkChannel('newch') },
    roles: { cache: { get: () => ({ id: '9001', name: 'role' }), has: () => true, size: 1 }, everyone: { id: GUILD } },
    commands: { set: async () => {} }, iconURL: () => null, bannerURL: () => null, fetch: async () => undefined,
  };
  const guildsCache = new Map([[GUILD, guild]]);
  Object.defineProperty(client, 'guilds', { value: { cache: guildsCache, fetch: async () => guild }, configurable: true });

  // ---- option factory ------------------------------------------------------
  function fillOptions(option: any, mode: Mode): any {
    if (mode === 'missing') return null;
    if (mode === 'huge') {
      if ([3, 6, 7, 8, 9, 11].includes(option.type)) return HUGE;
      return option.choices?.[0]?.value ?? 1;
    }
    if (mode === 'unicode') return UNICODE;
    switch (option.type) {
      case 3: return option.choices?.[0]?.value ?? 'test';
      case 4: case 10: return option.choices?.[0]?.value ?? 1;
      case 5: return true;
      case 6: return mkUser(TEST_USER);
      case 7: return mkChannel('tc1');
      case 8: return { id: '9001', name: 'role', permissions: { has: () => true } };
      case 9: return mkUser(TEST_USER);
      case 11: return { url: 'https://example.com/f.png', name: 'f.png', size: 1000, contentType: 'image/png' };
      default: return 'test';
    }
  }

  function makeAccessors(data: any, mode: Mode) {
    const values = new Map<string, any>();
    const sub = (data?.options || []).find((o: any) => o.type === 1);
    const group = (data?.options || []).find((o: any) => o.type === 2);
    const flat = data?.options || [];
    for (const o of flat) if (o.type >= 3) values.set(o.name, fillOptions(o, mode));
    if (sub) for (const o of (sub.options || [])) values.set(o.name, fillOptions(o, mode));
    if (group) for (const g of (group.options || [])) { values.set(g.name, fillOptions(g, mode)); for (const o of (g.options || [])) values.set(o.name, fillOptions(o, mode)); }

    const val = (n: string, cast: (v: any) => any) => (values.has(n) ? cast(values.get(n)) : null);
    return {
      getSubcommand: () => sub?.name ?? (() => { throw new Error('no subcommand'); })(),
      getSubcommandGroup: () => group?.name ?? null,
      getString: (n: string) => val(n, (v) => (v == null ? null : String(v))),
      getInteger: (n: string) => val(n, (v) => (v == null ? null : Number(v))),
      getNumber: (n: string) => val(n, (v) => (v == null ? null : Number(v))),
      getBoolean: (n: string) => val(n, (v) => (v == null ? null : Boolean(v))),
      getUser: (n: string) => values.get(n) ?? null,
      getMember: () => meMember,
      getChannel: (n: string) => values.get(n) ?? null,
      getRole: (n: string) => values.get(n) ?? null,
      getMentionable: (n: string) => values.get(n) ?? null,
      getAttachment: (n: string) => values.get(n) ?? null,
      getFocused: () => 'test',
    };
  }

  const mkMessageStub = (id = 'm1') => ({ id, edit: async () => {}, delete: async () => {}, createMessageComponentCollector: () => new EventEmitter(), reply: async () => ({}) });

  function makeInteraction(cmdName: string, data: any, mode: Mode) {
    const replies: any[] = [];
    const interaction: any = {
      type: 2, client, commandName: cmdName, commandId: '1',
      user: mkUser(TEST_USER),
      member: { id: TEST_USER, user: mkUser(TEST_USER), permissions: { has: () => true, missing: () => [] }, permissionsIn: () => ({ has: () => true }), voice: { channel: voiceChannel, channelId: 'vc1' }, roles: { cache: new Map() }, displayName: 'tester' },
      guild, channel: mkChannel('tc1'), channelId: 'tc1',
      options: makeAccessors(data, mode),
      inGuild: () => true, inCachedGuild: () => true, isChatInputCommand: () => true, isRepliable: () => true,
      deferred: false, replied: false,
      response: { createMessageComponentCollector: () => new EventEmitter(), sendMessageComponentReply: async () => {} },
      deferReply: async () => { interaction.deferred = true; },
      reply: async (p: any) => { replies.push(p); interaction.replied = true; return mkMessageStub(); },
      editReply: async (p: any) => { replies.push(p); interaction.replied = true; return mkMessageStub(); },
      followUp: async (p: any) => { replies.push(p); interaction.replied = true; return mkMessageStub(); },
      fetchReply: async () => mkMessageStub(),
      deleteReply: async () => {}, showModal: async () => {},
    };
    return { interaction, replies };
  }

  const commands = [...client.commands.values()] as any[];
  const slashCmds = commands.filter((c) => c.slash?.enabled);
  const slashEvent = (await import('../src/events/discord/guild/slashcmd.ts')).default;
  const { Middleware } = await import('../src/core/Middleware');

  // Between runs: clear cooldowns + the auto-blacklist so every scenario
  // actually reaches the command body instead of being throttled out.
  function resetThrottle(cmdName: string) {
    try { Middleware.anti.clearBlacklist(TEST_USER, cmdName, GUILD); } catch {}
    // `reset()` only clears violations; expire the cooldown itself with a past TTL.
    try { db.cooldowns.set(TEST_USER, cmdName, GUILD, -1000); } catch {}
    try { (db.cooldowns as any).reset(TEST_USER, cmdName, GUILD); } catch {}
    // Destructive audit runs (e.g. /blacklist) must not poison later commands —
    // otherwise every subsequent command is silently blocked by the middleware.
    try { db.users.unblacklistUser(TEST_USER); } catch {}
    try { db.guilds.unblacklistGuild(GUILD); } catch {}
  }

  console.log(`\n\u001b[35m━━━ SLASH FUZZ: ${slashCmds.length} commands × ${MODES.length} modes ━━━\u001b[0m`);
  for (const mode of MODES) {
    for (const cmd of slashCmds) {
      runs++;
      resetThrottle(cmd.name);
      const { interaction } = makeInteraction(cmd.name, cmd.slash.data, mode);
      let crash: any = null;
      const orig = cmd.onError;
      cmd.onError = async (_c: any, e: any) => { crash = e; };
      try { await slashEvent.execute(interaction, client as any); }
      catch (e) { crash = crash ?? e; }
      finally { cmd.onError = orig; }
      if (crash) { report(cmd.name, mode, 'crash', String(crash?.message || crash).slice(0, 110)); reportStack(cmd.name, mode, crash); }
      else if (interaction.deferred && !interaction.replied) report(cmd.name, mode, 'silent');
    }
  }

  // ---- non-owner pass: commands that silently ignore unauthorized users ----
  console.log(`\n\u001b[35m━━━ NO-AUTH PASS (non-owner) ━━━\u001b[0m`);
  (config as any).ownerIds = [];
  for (const cmd of slashCmds) {
    runs++;
    resetThrottle(cmd.name);
    const { interaction } = makeInteraction(cmd.name, cmd.slash.data, 'happy');
    let crash: any = null;
    const orig = cmd.onError;
    cmd.onError = async (_c: any, e: any) => { crash = e; };
    try { await slashEvent.execute(interaction, client as any); }
    catch (e) { crash = crash ?? e; }
    finally { cmd.onError = orig; }
    if (crash) report(cmd.name, 'no-auth', 'crash', String(crash?.message || crash).slice(0, 110));
    else if (interaction.deferred && !interaction.replied) report(cmd.name, 'no-auth', 'silent', 'deferred, no reply for unauthorized user');
  }
  (config as any).ownerIds = [TEST_USER];

  // ---- prefix path ---------------------------------------------------------
  console.log(`\n\u001b[35m━━━ PREFIX FUZZ ━━━\u001b[0m`);
  const prefixEvent = (await import('../src/events/discord/guild/Prefixcmd.ts')).default;
  const prefixCmds = commands.filter((c) => typeof c.execute === 'function');
  const prefix = db.getPrefixes(GUILD)[0] || '.';
  for (const argMode of ['happy', 'missing'] as Mode[]) {
    for (const cmd of prefixCmds) {
      runs++;
      resetThrottle(cmd.name);
      const replies: any[] = [];
      const content = argMode === 'happy' ? `${prefix}${cmd.name} test` : `${prefix}${cmd.name}`;
      const message: any = {
        id: 'msg1', content, createdTimestamp: Date.now(), client,
        author: mkUser(TEST_USER), member: { id: TEST_USER, permissions: { has: () => true }, voice: { channel: voiceChannel, channelId: 'vc1' } },
        guild, channel: mkChannel('tc1'),
        mentions: {
          users: { first: () => undefined, get: () => undefined, has: () => false, size: 0 },
          members: { first: () => undefined, get: () => undefined, has: () => false, size: 0 },
          channels: { first: () => undefined, get: () => undefined, has: () => false, size: 0 },
          roles: { first: () => undefined, get: () => undefined, has: () => false, size: 0 },
          everyone: false, repliedUser: null,
        },
        reply: async (p: any) => { replies.push(p); return mkMessageStub(); },
        react: async () => {}, edit: async () => {},
      };
      let crash: any = null;
      const orig = cmd.onError;
      cmd.onError = async (_c: any, e: any) => { crash = e; };
      try { await prefixEvent.execute(message, client as any); }
      catch (e) { crash = crash ?? e; }
      finally { cmd.onError = orig; }
      if (crash) report(cmd.name, `prefix/${argMode}`, 'crash', String(crash?.message || crash).slice(0, 110));
    }
  }

  console.log(`\n\u001b[35m════════════ DISPATCH SUMMARY ════════════\u001b[0m`);
  console.log(`  Runs:     ${runs}`);
  console.log(`  Silent:   \u001b[33m${silent.length}\u001b[0m`);
  console.log(`  Crashed:  \u001b[31m${crashes.length}\u001b[0m`);
  for (const c of crashes) console.log(`   \u001b[31m✖\u001b[0m ${c}`);
  process.exit(crashes.length || silent.length ? 1 : 0);
}

main().catch((err) => { console.error('dispatch audit crashed:', err); process.exit(2); });
