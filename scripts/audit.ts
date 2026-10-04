/**
 * Yuna V2 — deep audit harness (static analysis layer).
 *
 * Complements scripts/runtime-test.ts. Focuses on things that are hard to see
 * by reading individual files:
 *   • command contract validity (names, slash data, handlers)
 *   • customId coverage (every set id is handled somewhere)
 *   • i18n parity (every locale has the same keys + same placeholders)
 *   • hardcoded user-facing English that bypasses the i18n system
 *
 * Usage: npx tsx scripts/audit.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'src');
const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'yuna-audit-'));
process.env.TOKEN = 'x'.repeat(70);
process.env.CLIENT_ID = '123456789012345678';
process.env.DATABASE_PATH = path.join(TEST_DIR, 'audit.yuna');

const failures: string[] = [];
const warnings: string[] = [];
let passCount = 0;

function ok(name: string) {
  passCount++;
  console.log(`  \u001b[32m✔\u001b[0m ${name}`);
}
function fail(name: string, detail = '') {
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`  \u001b[31m✖\u001b[0m ${name}${detail ? ` — ${detail}` : ''}`);
}
function warn(name: string, detail = '') {
  warnings.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`  \u001b[33m⚠\u001b[0m ${name}${detail ? ` — ${detail}` : ''}`);
}
function check(name: string, cond: boolean, detail = '') {
  cond ? ok(name) : fail(name, detail);
}
function section(name: string) {
  console.log(`\n\u001b[35m━━━ ${name} ━━━\u001b[0m`);
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

async function main() {
  const files = walk(ROOT);
  const sources = new Map<string, string>();
  for (const f of files) sources.set(f, fs.readFileSync(f, 'utf8'));

  // ==========================================================================
  section('A. COMMAND CONTRACT');
  const { YunaClient } = await import('../src/core/YunaClient');
  const client = new YunaClient();
  const { CommandLoader } = await import('../src/loaders/CommandLoader');
  const loader = new CommandLoader(client as any);
  await loader.load();
  // Events must load too so global component handlers (player buttons) register.
  const { EventLoader } = await import('../src/loaders/EventLoader');
  await new EventLoader(client as any).load();
  check('command loader has no failures', loader.failedCommands.length === 0, JSON.stringify(loader.failedCommands.slice(0, 5)));

  const commands = [...client.commands.values()] as any[];
  let missingName = 0, missingCat = 0, noHandler = 0, badSlash = 0;
  for (const c of commands) {
    if (!c.name || typeof c.name !== 'string') missingName++;
    if (!c.category) missingCat++;
    if (typeof c.execute !== 'function' && typeof c.slashExecute !== 'function') noHandler++;
    if (c.slash?.enabled) {
      if (!c.slash.data || !c.slash.data.name) badSlash++;
    }
  }
  check('every command has a name', missingName === 0, `${missingName} missing`);
  check('every command has a category', missingCat === 0, `${missingCat} missing`);
  check('every command has execute() or slashExecute()', noHandler === 0, `${noHandler} missing`);
  check('every slash-enabled command has slash data', badSlash === 0, `${badSlash} missing`);

  const names = [...client.commands.keys()];
  const dupNames = names.filter((n, i) => names.indexOf(n) !== i);
  check('no duplicate command names', dupNames.length === 0, dupNames.join(','));
  const slashNames = commands.filter((c) => c.slash?.enabled).map((c) => c.slash.data?.name);
  const dupSlash = slashNames.filter((n: string, i: number) => slashNames.indexOf(n) !== i);
  check('no duplicate slash names', dupSlash.length === 0, dupSlash.join(','));

  // ==========================================================================
  section('B. CUSTOM ID COVERAGE');
  // Collect every id "set" anywhere, plus every id "matched" anywhere.
  const setIds = new Map<string, string[]>(); // id → files
  const matchStrings: string[] = [];
  const setRe = /setCustomId\(\s*([`"'])([\s\S]*?)\1/g;
  for (const [file, src] of sources) {
    let m: RegExpExecArray | null;
    setRe.lastIndex = 0;
    while ((m = setRe.exec(src))) {
      const raw = m[2];
      const key = raw.includes('${') ? raw.slice(0, raw.indexOf('${')) : raw;
      if (!key) continue;
      if (!setIds.has(key)) setIds.set(key, []);
      setIds.get(key)!.push(path.relative(ROOT, file));
    }
    // filter strings: startsWith/endsWith/=== against quoted literals
    const filtRe = /(?:startsWith|endsWith)\(\s*([`"'])(.*?)\1\)/g;
    while ((m = filtRe.exec(src))) matchStrings.push(m[2]);
    const eqRe = /customId\s*===\s*([`"'])(.*?)\1/g;
    while ((m = eqRe.exec(src))) matchStrings.push(m[2]);
  }

  const registeredPatterns: string[] = [...(client as any).components?.handlers?.keys?.() ?? []].map(String);
  const allText = [...sources.values()].join('\n');
  const occurrences = (s: string) => s ? allText.split(s).length - 1 : 0;
  const orphanIds: string[] = [];
  for (const [id, files] of setIds.entries()) {
    const matchedByFilter = matchStrings.some((f) => f === id || (id && f.startsWith(id)) || (f && id.startsWith(f)));
    const matchedByPattern = registeredPatterns.some((p) => id.startsWith(p) || p === id);
    // modal ids are handled via awaitModalSubmit(modalId)
    const matchedByModal = [...sources.values()].some((s) => s.includes(`awaitModalSubmit`) && s.includes(id));
    // An id that appears only once in the whole tree is set but never compared.
    const appearsOnlyOnce = occurrences(id) <= 1;
    if (!matchedByFilter && !matchedByPattern && !matchedByModal && appearsOnlyOnce) orphanIds.push(`${id} (${files[0]})`);
  }
  if (orphanIds.length === 0) ok(`all ${setIds.size} customIds have a handler`);
  else warn(`${orphanIds.length} customId(s) with no obvious handler`, orphanIds.slice(0, 25).join(' | '));

  const idsWithSlot = [...setIds.entries()].filter(([id, files]) => files.length > 1);
  if (idsWithSlot.length) warn('same customId set in multiple files', idsWithSlot.map(([i, f]) => `${i}[${f.length}]`).join(', '));

  // ==========================================================================
  section('C. I18N PARITY');
  const { UI_STRINGS, MW_STRINGS, MENTION_STRINGS, COMMON_STRINGS, TITLE_STRINGS, BODY_STRINGS } = await import('../src/locales/ui-strings');
  const { i18n } = await import('../src/utils/i18n');
  const locales = [...i18n.getLocales().keys()];
  check('10 locales bundled', locales.length === 10, `got ${locales.length}`);

  const { TITLE_EXTRA } = await import('../src/locales/title-strings-extra');
  const { CMD_STRINGS } = await import('../src/locales/command-strings');
  const { SLASH_STRINGS } = await import('../src/locales/slash-strings');
  const catalogs: Array<[string, Record<string, Record<string, string>>]> = [
    ['UI', UI_STRINGS as any], ['MW', MW_STRINGS as any], ['MENTION', MENTION_STRINGS as any],
    ['COMMON', COMMON_STRINGS as any], ['BODY', BODY_STRINGS as any], ['TITLE', TITLE_STRINGS as any],
    ['TITLE_EXTRA', TITLE_EXTRA as any], ['CMD', CMD_STRINGS as any], ['SLASH', SLASH_STRINGS as any],
  ];

  for (const [label, cat] of catalogs) {
    const baseKeys = Object.keys(cat['en-US'] || {});
    for (const loc of locales) {
      const keys = Object.keys(cat[loc] || {});
      const missing = baseKeys.filter((k) => !(k in (cat[loc] || {})));
      const extra = keys.filter((k) => !baseKeys.includes(k));
      if (missing.length) fail(`[${label}] ${loc} missing ${missing.length} keys`, missing.slice(0, 8).join(','));
      if (extra.length) warn(`[${label}] ${loc} has ${extra.length} extra keys`, extra.slice(0, 8).join(','));
    }
  }

  // placeholder parity
  const phRe = /\{(\w+)\}/g;
  const phOf = (s: string) => { const set = new Set<string>(); let m; phRe.lastIndex = 0; while ((m = phRe.exec(s))) set.add(m[1]); return [...set].sort().join(','); };
  let placeholderIssues = 0;
  for (const [label, cat] of catalogs) {
    const base = cat['en-US'] || {};
    for (const loc of locales) {
      if (loc === 'en-US') continue;
      for (const [k, v] of Object.entries(cat[loc] || {})) {
        const expected = phOf(base[k] ?? '');
        const actual = phOf(v);
        if (expected !== actual) {
          placeholderIssues++;
          if (placeholderIssues <= 12) warn(`[${label}] ${loc} '${k}' placeholders differ`, `en={${expected}} ${loc}={${actual}}`);
        }
      }
    }
  }
  check('placeholder parity across locales', placeholderIssues === 0, `${placeholderIssues} mismatches`);

  // locale phrase files
  for (const loc of locales) {
    const data = i18n.getLocales().get(loc)!;
    if (!data.meta?.name || !data.meta?.nativeName) fail(`locale ${loc} has meta`);
  }
  ok('every locale exposes meta (name + nativeName)');

  // ==========================================================================
  section('D. HARDCODED ENGLISH HEURISTIC');
  // Look at command files for user-facing string literals that are clearly
  // English prose and do not pass through i18n/ctx.t/phrases.
  const englishish = (s: string) => /[A-Za-z]{3,}\s+[A-Za-z]{2,}/.test(s) && /^(You|The|No|This|Could|Please|Unable|Cannot|Unknown|An |Your|Enter|Select|Invalid|Only|Already|Now|Here|All|Are|Set|Track|Queue|Music|Player|Playlist|Volume|Filter|Cooldown|Premium|Success|Error|Failed|Loading|Skipped|Removed|Applied|Cleared|Status|Action|Overview|Results|Details|Examples|Name|Author|Duration|Position|Reason|Target|Usage|Total|Command|Song|Permissions|Node|Search|Audio|Available|Added|Started|Partial|Limits|Tips|Current|Entire|Some|Both|Building|Connecting|Query|Both)/.test(s);
  // Unambiguous single-word UI labels — always rendered to the user verbatim.
  const LABEL_RE = /^(Status|Action|Overview|Results|Details|Examples|Usage|Name|Author|Duration|Position|Reason|Target|Total|Users|Guilds|Current|Remaining|Skip|Loop|Volume|Queue|Track|Playlist|Filter|Effect|Enable|Disable|On|Off|Yes|No)$/;
  // Split a template literal into its STATIC parts, skipping ${...} spans.
  // Brace-depth aware so nested interpolations (e.g. `${xs.map(p => `\\`${p}\\`)}`)
  // are consumed as one span instead of leaking code fragments as "prose".
  const staticSegments = (raw: string): string[] => {
    const segs: string[] = [];
    let buf = '', depth = 0;
    for (let i = 0; i < raw.length; i++) {
      const two = raw.slice(i, i + 2);
      if (depth === 0 && two === '${') { segs.push(buf); buf = ''; depth = 1; i++; continue; }
      if (depth > 0) {
        if (two === '${') depth++;
        else if (raw[i] === '{') depth++;
        else if (raw[i] === '}') { depth--; if (depth === 0) i++; }
        continue;
      }
      buf += raw[i];
    }
    segs.push(buf);
    return segs;
  };
  let hardcoded = 0;
  let internalLogs = 0;
  for (const [file, src] of sources) {
    if (!file.startsWith(path.join(ROOT, 'commands')) && !file.startsWith(path.join(ROOT, 'events'))) continue;
    const lines = src.split('\n');
    const lineOf = (idx: number) => src.slice(0, idx).split('\n').length - 1;
    // A line is "internal" when it sits inside a logger/console statement —
    // those strings are diagnostics, never rendered to a Discord user.
    const isInternalLine = (ln: number) => {
      const ctx = lines[ln] || '';
      if (/logger\??\.|console\.|DiscordLogger|\.logError|logCmdRun/.test(ctx)) return true;
      if (ln > 0 && /logger\??\.|console\.|DiscordLogger/.test(lines[ln - 1] || '') && /^\s*["'\`]/.test(ctx)) return true;
      for (let k = ln; k >= Math.max(0, ln - 8); k--) {
        const line = lines[k] || '';
        if (/logger\??\.|console\.|DiscordLogger/.test(line)) return true;
        if (k < ln && /;\s*$/.test(line) && !/,\s*$/.test(line)) break;
      }
      return false;
    };
    // Localized call sites: routing text through i18n is exactly what we want.
    const isLocalizedLine = (ln: number) => /i18n|\.tr\(|ctx\.t\(|phrases\.|translateTitle|build(Error|Success|Info|Warning|Loading)/.test(lines[ln] || '');
    const report = (ln: number, s: string) => {
      hardcoded++;
      if (hardcoded <= 400) warn(`user-facing English: ${path.relative(ROOT, file)}:${ln + 1}`, `"${s.slice(0, 70)}"`);
    };

    // ---- (1) plain string literals (no interpolation) -----------------------
    const re = /(["'`])([^"'`\n]{10,140})\1/g;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(src))) {
      const s = m[2];
      if (s.includes('${')) continue;
      const ln = lineOf(m.index);
      const ctxLine = lines[ln] || '';
      // Skip internal logging, case labels, customIds, imports, throws, comments.
      if (/logger\??\.|console\.|DiscordLogger|\.logError|logCmdRun|setCustomId|^\s*case\s|^\s*import\s|throw new Error/.test(ctxLine)) { internalLogs++; continue; }
      if (/logger\??\.|console\.|DiscordLogger/.test(lines[ln - 1] || '') && /^\s*["']/.test(ctxLine)) { internalLogs++; continue; }
      // sentinel comparisons against thrown repository errors (never displayed)
      if (/^\s*(\}\s*)?(else\s+)?if\s*\(?\s*(error|err|e)\.message\s*===/.test(ctxLine)) { internalLogs++; continue; }
      if (/^\s*(\/\/|\*|\/\*)/.test(ctxLine)) continue;
      if (isLocalizedLine(ln)) continue;
      if (!englishish(s)) continue;
      report(ln, s);
    }

    // ---- (2) TEMPLATE literals: static prose between ${...} interpolations ---
    // Rule: prose living inside a template literal is never localizable, so the
    // whole template must be routed through i18n.cmd(...) instead.
    const segRe = /`([^`]*)`/g;
    re.lastIndex = 0;
    while ((m = segRe.exec(src))) {
      const raw = m[1];
      if (!raw.includes('${')) continue;
      const ln = lineOf(m.index);
      if (isInternalLine(ln)) { internalLogs++; continue; }
      if (isLocalizedLine(ln)) continue;
      for (const seg of staticSegments(raw)) {
        const t = seg.replace(/[\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
        if (t.length < 6) continue;
        // strip markdown / box-drawing decoration before judging
        const c = t.replace(/[*_`#>]/g, '').replace(/^[\s│├└┌┐┘─•\-–]+/, '').trim();
        if (c.length < 4) continue;
        if (/^https?:\/\/\S+$/.test(c)) continue;                 // bare URL
        const words = c.split(/[\s,]+/).filter((w) => /[A-Za-z]{2,}/.test(w));
        if (words.length >= 2) { report(ln, t); break; }          // multi-word prose
        if (LABEL_RE.test(c)) { report(ln, t); break; }           // single-word UI label
      }
    }
  }
  // Every user-facing string must route through i18n — no backlog allowed.
  check('no hardcoded user-facing English', hardcoded === 0, `${hardcoded} unlocalized (internal log/sentinel lines skipped: ${internalLogs})`);

  // ==========================================================================
  console.log(`\n\u001b[35m════════════ AUDIT SUMMARY ════════════\u001b[0m`);
  console.log(`  Passed:   \u001b[32m${passCount}\u001b[0m`);
  console.log(`  Warnings: \u001b[33m${warnings.length}\u001b[0m`);
  console.log(`  Failures: \u001b[31m${failures.length}\u001b[0m`);
  if (failures.length) {
    console.log('\n  Failed checks:');
    for (const f of failures) console.log(`   \u001b[31m✖\u001b[0m ${f}`);
  }
  console.log(`\n  Commands audited: ${commands.length} | customIds: ${setIds.size} | locales: ${locales.length}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error('audit crashed:', err);
  process.exit(2);
});
