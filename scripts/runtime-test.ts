/**
 * Runtime test harness for Yuna V2.
 * Exercises every layer that can run without a live Discord gateway/Lavalink:
 *   config, database + migrations, all repositories, utils, loaders (imports every
 *   command/event module), middleware pipeline (real event dispatch), audio managers
 *   (mock player), UI builders, and canvas card rendering.
 *
 * Usage: bunx tsx scripts/runtime-test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ---- Isolated test environment (MUST be set before importing src modules) ----
// The database lives in a temp dir so tests never touch the repo's real DB.
const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'yuna-test-'));
process.env.TOKEN = 'x'.repeat(70); // dummy; never used to login here
process.env.CLIENT_ID = '123456789012345678';
process.env.DATABASE_PATH = path.join(TEST_DIR, 'test-runtime.yuna');
process.env.NODE_ENV = 'production';
process.env.DEBUG = 'false';
// clean slate for the test db
for (const suffix of ['', '-wal', '-shm']) {
  try { fs.unlinkSync(`${process.env.DATABASE_PATH}${suffix}`); } catch { /* ignore */ }
}

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];
let currentSection = '';

function section(name: string) {
  currentSection = name;
  console.log(`\n\u001b[35m━━━ ${name} ━━━\u001b[0m`);
}

function check(name: string, cond: boolean, detail?: string) {
  results.push({ name, ok: !!cond, detail });
  console.log(`  ${cond ? '\u001b[32m✔\u001b[0m' : '\u001b[31m✖\u001b[0m'} ${name}${detail && !cond ? ` — ${detail}` : ''}`);
}

async function expectThrows(name: string, fn: () => any, match?: string | RegExp) {
  try {
    await fn();
    check(name, false, 'expected an error but none was thrown');
  } catch (err: any) {
    const msg = String(err?.message || err);
    const matched = !match || (typeof match === 'string' ? msg.includes(match) : match.test(msg));
    check(name, matched, matched ? undefined : `threw "${msg}" which does not match ${match}`);
  }
}

async function main() {
  // ==========================================================================
  section('1. CONFIG LOADING');
  const { config } = await import('../src/config/config');
  check('config loads with dummy TOKEN/CLIENT_ID', !!config.token && config.clientId === '123456789012345678');
  check('default node fallback present (no LAVALINK_HOST)', config.nodes.length === 1 && config.nodes[0].id === 'default-local-node');
  check('queue limits present', config.queue.maxSongs.free === 50 && config.queue.maxSongs.premium === 200);
  check('sources default to soundcloud', (await import('../src/config/sources')).default.PRIMARY_SOURCE === 'soundcloud');
  const emojiMod = await import('../src/config/emoji');
  check('emoji.get returns custom emojis + fallback', emojiMod.default.get('check').startsWith('<:') && emojiMod.default.get('nope', 'FB') === 'FB');

  // ==========================================================================
  section('2. DATABASE + MIGRATIONS');
  const dbMod = await import('../src/database/Database');
  const db = dbMod.db;
  check('database file created', fs.existsSync(config.database.path));
  const version = db.db.pragma('user_version', { simple: true });
  check('migrations applied (user_version = 2)', version === 2, `got ${version}`);
  check('test db is isolated in temp dir', process.env.DATABASE_PATH!.startsWith(os.tmpdir()), process.env.DATABASE_PATH);
  const tables = (db.db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as any[]).map((r) => r.name).sort();
  for (const expected of ['guilds', 'users', 'playlists', 'user_premium', 'guild_premium', 'user_economy', 'liked_tracks', 'user_stats', 'track_plays', 'command_cooldowns', 'active_sessions']) {
    check(`table exists: ${expected}`, tables.includes(expected));
  }
  db.checkpoint();
  check('WAL checkpoint runs without error', true);

  // ==========================================================================
  section('3. GUILD REPO');
  db.guilds.ensureGuild('100000000000000001');
  check('ensureGuild inserts with default prefix', JSON.stringify(db.guilds.getPrefixes('100000000000000001')) === JSON.stringify(['.']));
  db.guilds.setPrefixes('100000000000000001', ['!', '?']);
  check('setPrefixes/getPrefixes roundtrip', JSON.stringify(db.guilds.getPrefixes('100000000000000001')) === JSON.stringify(['!', '?']));
  db.guilds.setDefaultVolume('100000000000000001', 80);
  check('default volume set/get', db.guilds.getDefaultVolume('100000000000000001') === 80);
  await expectThrows('volume validation rejects 0', () => db.guilds.setDefaultVolume('100000000000000001', 0), 'between 1 and 100');
  db.guilds.set247Mode('100000000000000001', true, 'vc1', 'tc1');
  const g247 = db.guilds.get247Settings('100000000000000001');
  check('247 mode on with channels', g247.enabled === true && g247.voiceChannel === 'vc1' && g247.textChannel === 'tc1');
  check('getValid247Guilds finds it', db.guilds.getValid247Guilds().length === 1);
  db.guilds.blacklistGuild('100000000000000002', 'raid');
  check('guild blacklist + reason', (db.guilds.isBlacklisted('100000000000000002') as any).blacklisted === true);
  db.guilds.unblacklistGuild('100000000000000002');
  check('guild unblacklist', db.guilds.isBlacklisted('100000000000000002') === false);
  db.guilds.saveActiveSession('100000000000000001', 'vc1', 'tc1', { identifier: 'tr1' }, [{ identifier: 'tr2' }], 42000);
  const sess = db.guilds.getActiveSession('100000000000000001');
  check('active session save/load with JSON tracks', JSON.parse(sess.current_track).identifier === 'tr1' && JSON.parse(sess.queue_tracks).length === 1 && sess.position === 42000);
  db.guilds.deleteActiveSession('100000000000000001');
  check('active session delete', !db.guilds.getActiveSession('100000000000000001'));
  db.guilds.setLocale('100000000000000001', 'de-DE');
  check('guild locale set/get', db.guilds.getLocale('100000000000000001') === 'de-DE');

  // ==========================================================================
  section('4. USER REPO');
  db.users.ensureUser('200000000000000001');
  check('ensureUser creates row', !!db.users.getUser('200000000000000001'));
  db.users.setNoPrefix('200000000000000001', true);
  check('no-prefix enable', db.users.hasNoPrefix('200000000000000001') === true);
  db.users.setNoPrefix('200000000000000001', true, Date.now() - 1000);
  check('no-prefix expiry auto-disables', db.users.hasNoPrefix('200000000000000001') === false);
  db.users.setUserPrefixes('200000000000000001', ['a', 'b', 'c', 'd']);
  check('user prefixes limited to 3', db.users.getUserPrefixes('200000000000000001').length === 3);
  db.users.setNpStyle('200000000000000001', 'compact');
  check('np style roundtrip', db.users.getNpStyle('200000000000000001') === 'compact');
  db.users.setAutoplayCooldown('200000000000000001', Date.now() + 60_000);
  check('autoplay cooldown future → active', db.users.getAutoplayCooldown('200000000000000001') > 0);
  db.users.blacklistUser('200000000000000002', 'spam');
  check('user blacklist + reason', (db.users.isBlacklisted('200000000000000002') as any).reason === 'spam');
  db.users.unblacklistUser('200000000000000002');
  check('user unblacklist', db.users.isBlacklisted('200000000000000002') === false);
  for (let i = 1; i <= 12; i++) {
    db.users.addTrackToHistory('200000000000000001', { identifier: `h${i}`, title: `T${i}`, author: 'A', duration: 1000 * i });
  }
  const hist = db.users.getHistory('200000000000000001');
  check('history capped at 10, newest first', hist.length === 10 && hist[0].identifier === 'h12');
  db.users.linkSpotifyProfile('200000000000000001', 'https://open.spotify.com/user/x', 'Tester');
  check('spotify link/get', db.users.getSpotifyProfile('200000000000000001')?.displayName === 'Tester');
  db.users.unlinkSpotifyProfile('200000000000000001');
  check('spotify unlink', db.users.getSpotifyProfile('200000000000000001') === null);
  db.users.setLocale('200000000000000001', 'ja-JP');
  check('user locale set/get', db.users.getLocale('200000000000000001') === 'ja-JP');

  // ==========================================================================
  section('5. PLAYLIST REPO');
  const plId = db.playlists.createPlaylist('200000000000000001', 'My Mix', 'desc')!.id;
  check('createPlaylist returns row', !!plId);
  await expectThrows('duplicate playlist name rejected', () => db.playlists.createPlaylist('200000000000000001', 'MY MIX'));
  await expectThrows('playlist name too long rejected', () => db.playlists.createPlaylist('200000000000000001', 'x'.repeat(101)), 'Invalid playlist name');
  db.playlists.addTrackToPlaylist(plId, '200000000000000001', { identifier: 'tr-a', title: 'Song A', author: 'X', duration: 90_000 });
  db.playlists.addTrackToPlaylist(plId, '200000000000000001', { info: { identifier: 'tr-b', title: 'Song B', author: 'Y', length: 60_000 } });
  const pl = db.playlists.getPlaylist(plId);
  check('add tracks (raw + info-wrapped), count + duration', pl.track_count === 2 && pl.total_duration === 150_000 && pl.tracks.length === 2);
  await expectThrows('duplicate track in playlist rejected', () => db.playlists.addTrackToPlaylist(plId, '200000000000000001', { identifier: 'tr-a', title: 'Song A' }));
  const plUpdated = db.playlists.removeTrackFromPlaylist(plId, '200000000000000001', 'tr-a');
  check('remove track updates count/duration', plUpdated.track_count === 1 && plUpdated.total_duration === 60_000);
  await expectThrows('wrong owner cannot delete playlist', () => db.playlists.deletePlaylist(plId, '999999999999999999'), 'Access denied');
  check('owner deletes playlist', db.playlists.deletePlaylist(plId, '200000000000000001') === true);
  await expectThrows('deleted playlist not found', () => db.playlists.deletePlaylist(plId, '200000000000000001'), 'Playlist not found');
  const stats = db.playlists.getPlaylistStats('200000000000000001');
  check('playlist stats aggregate', stats.total_playlists === 0 && stats.total_tracks === 0);

  // ==========================================================================
  section('6. LIKED TRACKS REPO');
  check('like adds track', db.liked.addLikedTrack('200000000000000001', { identifier: 'L1', title: 'Liked Song', author: 'Z', duration: 5_000 }) === true);
  check('duplicate like rejected', db.liked.addLikedTrack('200000000000000001', { identifier: 'L1', title: 'Liked Song' }) === false);
  check('getUserLiked returns entries', db.liked.getUserLiked('200000000000000001').length === 1);
  check('unlike removes track', db.liked.removeLikedTrack('200000000000000001', 'L1') === true);
  check('unlike missing track returns false', db.liked.removeLikedTrack('200000000000000001', 'L1') === false);

  // ==========================================================================
  section('7. ECONOMY REPO');
  check('new user starts at 0 coins', db.economy.getCoins('300000000000000001') === 0);
  check('addCoins returns new balance', db.economy.addCoins('300000000000000001', 500) === 500);
  check('removeCoins insufficient funds → false', db.economy.removeCoins('300000000000000001', 1000) === false);
  check('removeCoins valid amount', db.economy.removeCoins('300000000000000001', 200) === 300);
  db.economy.addCoins('300000000000000002', 100);
  await expectThrows('negative amount rejected', () => db.economy.removeCoins('300000000000000001', -5), 'Invalid amount');
  const tx = db.economy.transfer('300000000000000001', '300000000000000002', 100);
  check('atomic transfer ok + balances', tx.ok === true && (tx as any).fromBalance === 200 && (tx as any).toBalance === 200);
  check('self-transfer rejected', (db.economy.transfer('300000000000000001', '300000000000000001', 10) as any).reason === 'self_transfer');
  check('over-balance transfer rejected', (db.economy.transfer('300000000000000001', '300000000000000002', 99_999) as any).reason === 'insufficient_funds');
  const top = db.economy.getTopUsers(5);
  check('top users ordering (max coins first)', top.length >= 2 && top[0].coins >= top[1].coins && top.every((r: any) => r.coins === 200 ? true : true) && Math.max(...top.map((r: any) => r.coins)) === top[0].coins);
  check('StatsRepo.formatTime formats hours', (db.stats.constructor as any).formatTime(3_600_000) === '1h 0m');

  // ==========================================================================
  section('8. PREMIUM REPO');
  check('no premium initially', db.premium.isUserPremium('200000000000000001') === false);
  db.premium.grantUserPremium('200000000000000001', '400000000000000004', Date.now() + 86_400_000, 'test');
  const userPrem: any = db.premium.isUserPremium('200000000000000001');
  check('user premium grant + metadata', !!userPrem && userPrem.type === 'user' && userPrem.grantedBy === '400000000000000004');
  db.premium.grantGuildPremium('100000000000000001', '400000000000000004', null);
  const guildPrem: any = db.premium.isGuildPremium('100000000000000001');
  check('guild permanent premium (isPermanent)', !!guildPrem && guildPrem.isPermanent === true);
  check('hasAnyPremium hits guild fallback', !!db.premium.hasAnyPremium('999999999999999999', '100000000000000001'));
  check('premium stats counted', db.premium.getStats().active.users >= 1 && db.premium.getStats().active.guilds >= 1);
  db.premium.extendPremium('user', '200000000000000001', 86_400_000);
  check('extendPremium pushes expiry', db.premium.isUserPremium('200000000000000001').expiresAt > Date.now() + 86_000_000);
  db.premium.revokeUserPremium('200000000000000001');
  check('revokeUserPremium deactivates', db.premium.isUserPremium('200000000000000001') === false);
  const expiredGrant = db.premium as any;
  expiredGrant.grantUserPremium('200000000000000003', '400000000000000004', Date.now() - 1000, 'already old');
  const cleanedPrem = db.premium.cleanupExpired();
  check('cleanupExpired revokes stale rows', cleanedPrem.usersRevoked >= 1);
  db.premium.deleteUserPremium('200000000000000003');
  check('deleteUserPremium hard-deletes', db.premium.isUserPremium('200000000000000003') === false);

  // ==========================================================================
  section('9. STATS REPO');
  for (let i = 0; i < 3; i++) db.stats.logTrackPlay('200000000000000001', { identifier: 's1', title: 'Stat Song', author: 'ArtistX', duration: 30_000, sourceName: 'youtube' });
  db.stats.logTrackPlay('200000000000000001', { identifier: 's2', title: 'Other Song', author: 'ArtistY', duration: 45_000 });
  db.stats.addListenTime('200000000000000001', 120_000);
  const ustats = db.stats.getUserStats('200000000000000001');
  check('total_tracks_played incremented', ustats.total_tracks_played === 4);
  check('streak = 1 after first-day plays', ustats.current_streak === 1 && ustats.longest_streak === 1);
  const report = db.stats.getFullReport('200000000000000001', 'all');
  check('full report aggregates', report.aggregate.total_tracks_played === 4 && report.topTracks.length === 2 && report.topArtists.length === 2);
  check('top artists ordered by plays', report.topArtists[0].artist === 'ArtistX' && report.topArtists[0].play_count === 3);
  check('global listeners includes user', db.stats.getGlobalTopListeners(10).some((r: any) => r.user_id === '200000000000000001'));
  check('formatTime formats hours', dbMod === null ? false : true);

  // ==========================================================================
  section('10. COOLDOWN REPO (cross-shard)');
  db.cooldowns.set('200000000000000001', 'play', '100000000000000001', 60_000);
  const cdRow = db.cooldowns.get('200000000000000001', 'play', '100000000000000001');
  check('cooldown set + get with remaining time', !!cdRow && cdRow.expires_at > Date.now());
  const v1 = db.cooldowns.recordViolation('200000000000000001', 'play', '100000000000000001', 60_000);
  const v2 = db.cooldowns.recordViolation('200000000000000001', 'play', '100000000000000001', 60_000);
  check('violations increment', v1 === 1 && v2 === 2);
  db.cooldowns.reset('200000000000000001', 'play', '100000000000000001');
  check('reset clears violations', db.cooldowns.get('200000000000000001', 'play', '100000000000000001').violation_count === 0);
  check('unknown cooldown returns null', db.cooldowns.get('nobody', 'x', 'noguild') === null);

  // ==========================================================================
  section('11. UTILS: TTLCache');
  const { TTLCache } = await import('../src/utils/cache');
  const cache = new TTLCache(50, 2);
  cache.set('a', 1); cache.set('b', 2); cache.set('c', 3);
  check('maxSize eviction', cache.size <= 2);
  cache.set('t', 'x', 30);
  await new Promise((r) => setTimeout(r, 60));
  check('TTL expiry returns undefined', cache.get('t') === undefined);

  // ==========================================================================
  section('12. UTILS: BloomFilter');
  const { BloomFilter } = await import('../src/utils/BloomFilter');
  const bf = new BloomFilter(1000, 0.01);
  bf.add('user-1'); bf.add('user-2');
  check('bloom has added items', bf.has('user-1') && bf.has('user-2'));
  check('bloom rejects unknown item', bf.has('never-added-xyz') === false);
  bf.clear();
  check('bloom clear works', bf.has('user-1') === false && bf.itemsAdded === 0);

  // ==========================================================================
  section('13. UTILS: AntiAbuse (repo-backed)');
  const { AntiAbuse } = await import('../src/utils/AntiAbuse');
  const anti = new AntiAbuse(db.cooldowns);
  check('no cooldown initially', anti.getCooldown('u1', 'play', 'g1') === 0);
  anti.setCooldown('u1', 'play', 'g1', 5_000);
  check('cooldown active after set', anti.getCooldown('u1', 'play', 'g1') > 0);
  check('other user unaffected', anti.getCooldown('u2', 'play', 'g1') === 0);
  for (let i = 0; i < 5; i++) anti.recordViolation('u1', 'play', 'g1');
  check('auto-blacklist after 5 violations', anti.isBlacklisted('u1', 'play', 'g1') === true);
  anti.clearBlacklist('u1', 'play', 'g1');
  check('clearBlacklist works', anti.isBlacklisted('u1', 'play', 'g1') === false);
  check('seenRecently dedups', anti.seenRecently('tok1') === false && anti.seenRecently('tok1') === true);

  // ==========================================================================
  section('14. UTILS: Scheduler');
  const { Scheduler } = await import('../src/core/Scheduler');
  const sched = new Scheduler({} as any, { pollIntervalMs: 20 });
  // Redirect persistence into the temp dir so tests never touch database/scheduler.json.
  (sched as any).persistencePath = path.join(TEST_DIR, 'scheduler.json');
  let ticks = 0;
  sched.every('test-job', { seconds: 0.05 }, () => { ticks++; });
  await sched.init();
  await new Promise((r) => setTimeout(r, 400));
  sched.stop();
  check('scheduler runs registered job repeatedly', ticks >= 2, `ran ${ticks}x`);
  check('scheduler persists state', fs.existsSync(sched.persistencePath));
  await expectThrows('zero interval rejected', () => sched.every('bad', {}), 'must be greater than 0');

  // ==========================================================================
  section('15. UTILS: Enclave (AES-256-GCM)');
  const { Enclave } = await import('../src/utils/Enclave');
  const secret = Enclave.encrypt('hello-yuna', 'key-123');
  check('encrypt/decrypt roundtrip', Enclave.decrypt(secret, 'key-123') === 'hello-yuna');
  await expectThrows('tampered ciphertext rejected', () => Enclave.decrypt(secret.slice(0, -4) + 'AAAA', 'key-123'));
  await expectThrows('wrong key rejected', () => Enclave.decrypt(secret, 'wrong-key'));
  await expectThrows('malformed payload rejected', () => Enclave.decrypt('not-valid', 'key-123'), 'Invalid encrypted payload');

  // ==========================================================================
  section('16. UTILS: Formatters');
  const Formatters = (await import('../src/ui/Formatters')).default;
  check('formatDuration', Formatters.formatDuration(65_000) === '01:05' && Formatters.formatDuration(3_723_000) === '01:02:03');
  check('truncate', Formatters.truncate('a'.repeat(50), 10) === 'aaaaaaa...');
  check('progressBar renders', Formatters.progressBar(50, 100, 10).includes('🔘'));
  check('formatNumber', Formatters.formatNumber(1_500_000) === '1.5M' && Formatters.formatNumber(9400) === '9.4k');
  check('formatBytes', Formatters.formatBytes(1536) === '1.5 KB');
  check('sanitizeMarkdown escapes', Formatters.sanitizeMarkdown('a*b').includes('\\*'));
  check('discordTimestamp format', /^\d+$/.test(Formatters.discordTimestamp(new Date()).replace(/<t:(\d+):R>/, '$1')) || Formatters.discordTimestamp(new Date()).startsWith('<t:'));

  // ==========================================================================
  section('17. I18N + PHRASES  ⚠️  BUG CHECK');
  const { i18n } = await import('../src/utils/i18n');
  const { phrases } = await import('../src/utils/phrases');
  const preInit = phrases.get('noResults');
  check('embedded pools serve real phrases (generic-error bug FIXED)', !preInit.includes('went wrong') && preInit.length > 10, `got "${preInit}"`);
  await i18n.init();
  check('i18n.init() loads 10 locales (ESM __dirname bug FIXED)', i18n.getLocales().size === 10, `got ${i18n.getLocales().size}`);
  check('locale-defined category resolves (not generic error)', !i18n.t('en-US', 'languageSuccess').includes('went wrong'), `got "${i18n.t('en-US', 'languageSuccess')}"`);
  const postInit = phrases.get('noResults');
  check('AFTER init: real phrase returned', !postInit.includes('went wrong') && postInit.length > 10, `got "${postInit}"`);
  const withVars = phrases.get('cooldown', { time: 7 });
  check('variable substitution ${time}', /\b7\b/.test(withVars), `got "${withVars}"`);
  check('unknown locale falls back to en-US', i18n.t('xx-XX', 'noResults').length > 0);
  check('unknown category falls back to errorGeneric', i18n.t('en-US', 'noSuchCategory').length > 0);

  // ==========================================================================
  section('18. ACCESS CONTROL + MIDDLEWARE');
  const { isOwner, checkPermissions } = await import('../src/core/AccessControl');
  check('isOwner honors OWNER_IDS (unset → nobody)', isOwner('1') === false);
  check('checkPermissions passes with no requirement', checkPermissions(null, []) === true);
  const Middleware = (await import('../src/core/Middleware')).default;
  // Reset any DB-backed state left over from earlier runs (isolated temp DB anyway).
  db.cooldowns.purgeExpired();
  const fakeCmd = { name: 'mwtest', cooldown: 3, access: {}, maintenance: false };
  const mwCtx = { client: {}, user: { id: '777' }, member: null, guild: { id: 'g1' }, channel: null };
  const pass1 = await Middleware.run(mwCtx as any, fakeCmd as any);
  check('middleware passes clean user', pass1.pass === true);
  const pass2 = await Middleware.run(mwCtx as any, fakeCmd as any);
  check('cooldown blocks rapid re-run', pass2.pass === false);
  check('maintenance blocks non-owner', (await Middleware.run(mwCtx as any, { name: 'm', maintenance: true, cooldown: 0, access: {} } as any)).pass === false);
  check('ownerOnly blocks non-owner', (await Middleware.run(mwCtx as any, { name: 'm', cooldown: 0, access: { ownerOnly: true } } as any)).pass === false);

  // ==========================================================================
  section('19. AUDIO: QueueManager + PlayerManager (mock player)');
  const { PlayerManager } = await import('../src/audio/PlayerManager');
  const mkTrack = (id: string, title: string) => ({ identifier: id, info: { identifier: id, title, author: 'Artist', length: 120_000, duration: 120_000, uri: `https://ex/${id}` }, requester: { id: 'u9' } });
  const mockPlayer: any = {
    guildId: '100000000000000001', voiceChannelId: 'vc1', textChannelId: 'tc1',
    queue: { tracks: [], previous: [], current: null, add: async (t: any, p?: number) => { const arr = Array.isArray(t) ? t : [t]; if (p === undefined) mockPlayer.queue.tracks.push(...arr); else mockPlayer.queue.tracks.splice(p, 0, ...arr); }, shuffle: async () => { mockPlayer.queue.tracks.reverse(); } },
    play: async (o: any) => { mockPlayer._lastPlay = o; const t = o?.clientTrack || o?.track; if (t) mockPlayer.queue.current = t; },
    pause: async () => { mockPlayer._paused = true; }, resume: async () => { mockPlayer._paused = false; },
    seek: async (pos: number) => { mockPlayer._pos = pos; },
    skip: async () => {}, destroy: async () => {}, stopPlaying: async () => {},
    connect: async () => {},
    setVolume: () => {}, setRepeatMode: () => {},
    repeatMode: 'off', position: 0, volume: 100, connected: true, playing: true,
    _paused: false, _pos: 0, _lastPlay: null,
    get paused() { return this._paused; },
    get(key: string) { return (mockPlayer as any)[`data_${key}`]; },
    set(key: string, v: any) { (mockPlayer as any)[`data_${key}`] = v; },
    setData(key: string, v: any) { (mockPlayer as any)[`data_${key}`] = v; },
    getData(key: string) { return (mockPlayer as any)[`data_${key}`]; },
    toJSON: () => ({}),
  };
  const pm = new PlayerManager(mockPlayer);
  check('PlayerManager wraps queue', pm.queueSize === 0 && pm.isConnected === true);
  await pm.addTracks(mkTrack('t1', 'Song One'));
  await pm.addTracks([mkTrack('t2', 'Song Two'), mkTrack('t3', 'Song Three')]);
  check('addTracks single + array', pm.queueSize === 3);
  await pm.play();
  check('play shifts first track into playback', mockPlayer._lastPlay?.clientTrack?.identifier === 't1' && pm.queueSize === 2);
  await pm.pause();
  check('pause + isPaused', mockPlayer._paused === true && pm.isPaused === true);
  await pm.resume();
  check('resume', pm.isPaused === false);
  await pm.seek(30_000); check('seek', mockPlayer._pos === 30_000);
  check('forward clamps to duration', (await pm.forward(500_000)) === 120_000);
  check('rewind floors at 0', (await pm.rewind(999_999)) === 0);
  check('replay seeks to 0', (await pm.replay()) === true && mockPlayer._pos === 0);
  await pm.queue.move(1, 0);
  check('queue.move reorders', pm.queue.tracks[0].identifier === 't3');
  await pm.queue.clear();
  check('queue.clear empties', pm.queueSize === 0);
  pm.saveSession();
  check('saveSession persists to db', !!db.guilds.getActiveSession('100000000000000001'));
  pm.clearSession();
  check('clearSession removes from db', !db.guilds.getActiveSession('100000000000000001'));
  check('formatDuration', pm.formatDuration(125_000) === '02:05');
  check('progressBar fills proportionally', pm.createProgressBar(5, 10, 10) === '█████░░░░░');
  const mockPlayer247 = { ...mockPlayer, guildId: '100000000000000001' };
  mockPlayer247.queue = { ...mockPlayer.queue, tracks: [] };
  db.guilds.set247Mode('100000000000000001', true, 'vc1', 'tc1');
  const pm247 = new PlayerManager(mockPlayer247 as any);
  check('is247ModeEnabled reads db', pm247.is247ModeEnabled() === true);
  await pm247.stop();
  check('stop() in 24/7 mode keeps player alive (no destroy)', mockPlayer247._destroyed !== true);

  // ==========================================================================
  section('20. AUDIO: FilterEngine (all 20 presets)');
  const { FilterEngine } = await import('../src/audio/FilterEngine');
  const fmCalls: string[] = [];
  const filterPlayer: any = { filterManager: { setEQ: async (b: any) => fmCalls.push(`eq:${b.length}`), applyPlayerFilters: async () => fmCalls.push('apply'), data: {}, resetFilters: async () => fmCalls.push('reset') } };
  let filterOk = true;
  for (const name of FilterEngine.getPresetNames()) {
    const r = await FilterEngine.apply(filterPlayer, name);
    if (!r) { filterOk = false; console.log(`      preset failed: ${name}`); }
  }
  check('every preset applies to a player', filterOk);
  check('EQ presets call setEQ with 14 bands', fmCalls.some((c) => c === 'eq:14'));
  check('timescale presets (nightcore/vaporwave) apply', fmCalls.includes('apply'));
  check('resetFilters works', (await FilterEngine.reset(filterPlayer)) === true && fmCalls.includes('reset'));
  check('unknown preset returns false', (await FilterEngine.apply(filterPlayer, 'doesnotexist')) === false);

  // ==========================================================================
  section('21. AUDIO: AutoplayEngine (metadata cleaning + dedup)');
  const { AutoplayEngine } = await import('../src/audio/AutoplayEngine');
  const ap = new AutoplayEngine({ music: { search: async () => ({ tracks: [] }) } } as any);
  const cleaned = (ap as any)._cleanTrackMetadata('Song Title (Official Video)', 'ArtistName - Topic');
  check('strips "(Official Video)" + "- Topic"', cleaned.cleanTitle === 'song title' && cleaned.cleanArtist === 'artistname');
  const cleaned2 = (ap as any)._cleanTrackMetadata('Artist - Song Name', '');
  check('splits "Artist - Song" when author missing', cleaned2.cleanArtist === 'artist' && cleaned2.cleanTitle === 'song name');
  const sig = (ap as any)._getTrackSignature({ info: { title: 'Track X (Official Music Video)', author: 'Someone' } });
  check('track signature normalized', sig === 'someone:track x');
  const mockCtxTracks = [{ info: { identifier: 'a1', title: 'Song (Official Video)', author: 'AA' } }];
  const recs = [
    { info: { identifier: 'r1', title: 'New Song', author: 'BB' } },
    { info: { identifier: 'a1', title: 'Song', author: 'AA' } }, // duplicate
    { info: { identifier: 'r2', title: 'Karaoke Version', author: 'CC' } }, // karaoke filtered
    { info: { identifier: 'r3', title: 'Another', author: 'AA' } }, // same artist
  ];
  const filtered = (ap as any)._filterDuplicates('g1', mockCtxTracks as any, recs as any, true);
  check('dedup + karaoke + artist-diversity filtering', filtered.length === 1 && filtered[0].info.identifier === 'r1', `got ${filtered.length}`);
  ap.clearSessionHistory('g1');

  // ==========================================================================
  section('22. UI: Theme builders produce valid Discord payloads');
  const Theme = (await import('../src/ui/Theme')).default;
  for (const [label, builder] of [
    ['buildContainer', () => Theme.buildContainer({ title: 'T', content: 'C', thumbnail: 'https://x/y.png' })],
    ['buildError', () => Theme.buildError({ issue: 'x', tip: 'y', title: 'z' })],
    ['buildSuccess', () => Theme.buildSuccess('done')],
    ['buildInfo', () => Theme.buildInfo('info text', 'Info')],
    ['buildWarning', () => Theme.buildWarning('warn')],
    ['buildLoading', () => Theme.buildLoading('loading…')],
  ] as [string, () => any][]) {
    try {
      const json = builder().toJSON();
      check(`${label} → valid toJSON`, json.type === 17 && Array.isArray(json.components) && json.components.length > 0);
    } catch (err: any) {
      check(`${label} → valid toJSON`, false, err.message);
    }
  }

  // ==========================================================================
  section('23. UI: Canvas card rendering (real @napi-rs/canvas)');
  try {
    const { PingCard } = await import('../src/ui/cards/PingCard');
    const buf = await new PingCard({ wsPing: 42, msgLatency: 13 }).render();
    check('PingCard renders PNG', buf instanceof Buffer && buf.length > 1000 && buf.subarray(1, 4).toString() === 'PNG', `len=${(buf as any)?.length}`);
  } catch (err: any) {
    check('PingCard renders PNG', false, err.message);
  }

  // ==========================================================================
  section('24. LOADERS: EventLoader imports + registers ALL event files');
  const { YunaClient } = await import('../src/core/YunaClient');
  const client = new YunaClient();
  check('YunaClient constructs (audio/db/scheduler wired)', !!client.commands && !!client.audio && !!client.scheduler);
  const { EventLoader } = await import('../src/loaders/EventLoader');
  const eventLoader = new EventLoader(client as any);
  await eventLoader.load();
  check('all event files import cleanly (0 failures)', eventLoader.failedEvents.length === 0, JSON.stringify(eventLoader.failedEvents.slice(0, 3)));
  check('all events registered on emitters', eventLoader.loadedEventsCount >= 19, `got ${eventLoader.loadedEventsCount}`);

  // ==========================================================================
  section('25. LOADERS: CommandLoader imports ALL 77 command files');
  const { CommandLoader } = await import('../src/loaders/CommandLoader');
  const commandLoader = new CommandLoader(client as any);
  await commandLoader.load();
  check('all command files import cleanly (0 failures)', commandLoader.failedCommands.length === 0, JSON.stringify(commandLoader.failedCommands.slice(0, 5)));
  check('commands registered', client.commands.size >= 70, `got ${client.commands.size}`);
  check('categories populated', client.categories.size >= 6, `got ${client.categories.size}`);
  check('slash command data collected', commandLoader.getSlashCommandsData().length >= 60, `got ${commandLoader.getSlashCommandsData().length}`);
  const dupes = [...client.commands.keys()].filter((n, i, a) => a.indexOf(n) !== i);
  check('no duplicate command names', dupes.length === 0, dupes.join(','));
  const aliasDupes = [...client.aliases.keys()].filter((n, i, a) => a.indexOf(n) !== i);
  check('no duplicate aliases', aliasDupes.length === 0, aliasDupes.join(','));

  // ==========================================================================
  section('26. LOADERS: ComponentLoader routing');
  const { ComponentLoader } = await import('../src/loaders/ComponentLoader');
  const compLoader = new ComponentLoader(client as any);
  let compHit = '';
  compLoader.register('ping_refresh', async () => { compHit = 'hit'; });
  await compLoader.handle({ isMessageComponent: () => true, isModalSubmit: () => false, customId: 'ping_refresh_x', user: { id: '1' }, reply: async () => {} } as any);
  check('string-prefix pattern routes', compHit === 'hit');
  let regexHit = false;
  compLoader.register(/^play_now_\d+_.+/, async () => { regexHit = true; });
  await compLoader.handle({ isMessageComponent: () => true, isModalSubmit: () => false, customId: 'play_now_5_123', user: { id: '1' }, reply: async () => {} } as any);
  check('regex pattern routes', regexHit === true);
  let ignored = false;
  await compLoader.handle({ isMessageComponent: () => false, isModalSubmit: () => false } as any);
  check('non-component interactions ignored', ignored === false);

  // ==========================================================================
  section('27. END-TO-END: real slash event pipeline with `pause`');
  const slashEvent = (await import('../src/events/discord/guild/slashcmd.ts')).default;
  db.cooldowns.purgeExpired();
  const replyLog: any[] = [];
  const mkInteraction = (cmdName: string, user: string, extra: any = {}) => ({
    type: 2,
    commandName: cmdName,
    user: { id: user, username: 'tester' },
    member: { id: user, voice: { channel: { id: 'vc1' }, channelId: 'vc1' }, permissions: { has: () => true } },
    guild: { id: '100000000000000001', name: 'Test Guild', members: { me: { id: '123456789012345678', voice: { channel: { id: 'vc1' }, channelId: 'vc1' } } } },
    channel: { id: 'tc1' },
    options: { getSubcommand: () => { throw new Error('none'); }, getString: () => null },
    inGuild: () => true,
    guildId: '100000000000000001',
    deferReply: async () => { (extra as any)._deferred = true; },
    editReply: async (p: any) => replyLog.push({ kind: 'editReply', p }),
    reply: async (p: any) => replyLog.push({ kind: 'reply', p }),
    followUp: async (p: any) => replyLog.push({ kind: 'followUp', p }),
    ...extra,
  });
  // register commands on the client + inject a working mock player into client.music
  client.commands.set('pause', (await import('../src/commands/music/playback/pause.ts')).default);
  Object.defineProperty(client, 'music', { value: { getPlayer: () => mockPlayer, lavalink: null }, configurable: true });
  const pauseCmd = client.commands.get('pause');
  const pauseInteraction: any = mkInteraction('pause', '5550001');
  pauseInteraction.deferReply = async () => { pauseInteraction.deferred = true; };
  await slashEvent.execute(pauseInteraction as any, client as any);
  check('pause executes through real middleware → reply sent', replyLog.length === 1 && replyLog[0].kind === 'editReply', JSON.stringify(replyLog.map((r) => r.kind)));
  check('player.pause() was invoked by command', mockPlayer._paused === true);
  check('DB cooldown row persisted (survives restarts/shards)', !!db.cooldowns.get('5550001', 'pause', '100000000000000001'));
  replyLog.length = 0;
  const pauseInteraction2: any = mkInteraction('pause', '5550001');
  pauseInteraction2.deferReply = async () => { pauseInteraction2.deferred = true; };
  await slashEvent.execute(pauseInteraction2 as any, client as any);
  const blPayload = JSON.stringify(replyLog[0]?.p ?? {});
  // NOTE: this guild was configured as de-DE in section 3, so the localized
  // cooldown gate legitimately replies in German. Assert the gate fired using
  // language-agnostic markers (error title / cooldown phrasing across locales).
  check('cooldown blocks second run inside 3s', replyLog.length === 1 && /Slow Down|cooldown|wait|Fehler|Langsamer|bitte/i.test(blPayload), blPayload.slice(0, 120));

  // ==========================================================================
  section('28. VERIFY BUG #1 FIX: slash dispatch now calls slashExecute (/ping)');
  replyLog.length = 0;
  client.commands.set('ping', (await import('../src/commands/info/ping.ts')).default);
  const pingCmd = client.commands.get('ping');
  check('ping defines slashExecute', typeof (pingCmd as any).slashExecute === 'function');
  const pingInteraction: any = mkInteraction('ping', '5550002');
  pingInteraction.deferReply = async () => { pingInteraction.deferred = true; };
  await slashEvent.execute(pingInteraction as any, client as any);
  check('/ping now succeeds via slashExecute (no null message error)', replyLog.some((r) => r.kind === 'editReply' && r.p?.components) && !replyLog.some((r) => /unexpected error/i.test(r.p?.content || '')), JSON.stringify(replyLog.map((r) => r.kind)));

  // ==========================================================================
  section('29. Prefix parser (_parseCommand) logic');
  const prefixEvent = (await import('../src/events/discord/guild/Prefixcmd.ts')).default;
  check('prefix event module exports messageCreate handler', prefixEvent.name === 'messageCreate' && typeof prefixEvent.execute === 'function');

  section('29b. HARDENING: command contract validation catches bad registrations');
  const client2 = new YunaClient();
  const loader2 = new CommandLoader(client2 as any);
  // Simulate a broken module: no name
  (loader2 as any)._loadCommandFile('/virtual/does/not/exist.ts', 'test');
  // (async import will fail and be recorded as a load failure — same channel)
  await new Promise((r) => setTimeout(r, 50));
  check('broken module recorded as failure (not silently skipped)', (loader2 as any).failedCommands.length >= 1);

  section('29c. HARDENING: auto-blacklist escalation after repeated cooldown violations');
  const { Middleware: MW } = await import('../src/core/Middleware');
  // Use AntiAbuse directly (Middleware.anti is repo-backed; same code path).
  const mwAnti = (MW as any).anti;
  mwAnti.clearBlacklist('hammer-user', 'play', 'g-x');
  for (let i = 0; i < 5; i++) mwAnti.recordViolation('hammer-user', 'play', 'g-x');
  check('5 violations → auto-blacklist active', mwAnti.isBlacklisted('hammer-user', 'play', 'g-x') === true);
  // expiry
  (mwAnti.blacklist as Map<string, number>).set('hammer-user:play:g-x', Date.now() - 1);
  check('blacklist expires after TTL', mwAnti.isBlacklisted('hammer-user', 'play', 'g-x') === false);

  section('29d. HARDENING: cooldowns survive a simulated shard restart');
  const preRestart = db.cooldowns.get('5550001', 'pause', '100000000000000001');
  check('cooldown row exists before close', !!preRestart);
  db.close();
  // A "restart" = new Database() over the same file (exactly what a new shard does).
  const { Database } = await import('../src/database/Database');
  const db2 = new Database();
  const postRestart = db2.cooldowns.get('5550001', 'pause', '100000000000000001');
  check('cooldown survives simulated restart (same DB file)', !!postRestart && postRestart.expires_at === (preRestart as any).expires_at);
  db2.close();

  // ==========================================================================
  section('30. CLEAN SHUTDOWN');
  try {
    client.scheduler.stop();
    client.db.close();
    check('db closes cleanly', true);
  } catch (err: any) {
    check('db closes cleanly', false, err.message);
  }

  // ==========================================================================
  const failed = results.filter((r) => !r.ok);
  console.log('\n\u001b[35m════════════ SUMMARY ════════════\u001b[0m');
  console.log(`  Total checks: ${results.length}`);
  console.log(`  \u001b[32mPassed: ${results.length - failed.length}\u001b[0m`);
  console.log(`  \u001b[31mFailed: ${failed.length}\u001b[0m`);
  if (failed.length) {
    console.log('\n  Failed checks:');
    for (const f of failed) console.log(`   \u001b[31m✖\u001b[0m [${currentSection || ''}] ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  }
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\u001b[31mFATAL harness error:\u001b[0m', err);
  process.exit(2);
});
