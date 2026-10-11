# AGENTS.md — Yuna (Discord music bot)

## Stack
- TypeScript (ESM, `tsx`), discord.js v14 (Components V2), lavalink-client (Player), SQLite.
- Entry: `src/shard.ts` (shard manager) → `src/index.ts` (cluster) → loaders in `src/loaders/`.
- Build: `npm run build` (tsc → `dist/`). Tests: `npx tsc --noEmit` + `YUNA_ENV_FILE=.env node --import tsx scripts/runtime-test.ts`.
- Path aliases: `#core`, `#audio`, `#ui`, `#utils`, `#config`, `#commands`, `#database`, `#locales`.

## Local Lavalink
- `sudo docker compose up -d`. Bridge networking has no egress in this sandbox, so the
  service uses `network_mode: host` and binds `127.0.0.1:9000` (password `youshallnotpass`).
- First start downloads the youtube-source plugin from Maven; host networking is required for that.

## i18n / phrases (important)
- Two lookup styles: `i18n.t(locale, category)` = randomized **phrase pool**;
  `i18n.ui/tr(locale, key)` = deterministic **UI string**; `i18n.cmd(english)` = per-command string.
- English phrase pools live in `src/utils/phrasePools.ts` (`EN_POOLS`) and are re-exported by
  `src/utils/phrases.ts` (`phrases` = `{ ...EN_POOLS, get(), has() }`). There is **no** full
  `en-US.ts` pool file — only `errorGeneric` / `languagePreviewTest` / `languageSuccess` there.
- `i18n.t` resolution order: locale file → `EN_POOLS` → `ui.error.title` ("Error").
  Never call `i18n.t` for a category that only exists in `EN_POOLS` expecting it to work without
  that fallback — this was the cause of English cooldown cards showing a bare `> Error`.
- An unknown category intentionally degrades to `ui.error.title`; use `phrases.has(cat)` to tell a
  real phrase from the fallback.

## Conventions
- Commands default-export `new SomeCommand()` extending `#core/Command`; declare `slash` data inline.
- Components V2 cards: single `ContainerBuilder` per message, `flags: MessageFlags.IsComponentsV2`.
- Card shells live in `src/ui/Theme.ts` (`buildContainer`, `buildError`, `buildSuccess`, `buildResult`,
  `buildBlocked`, …). Brand footer: `Built with ♥ under CodeX Development`.
- Files end with `// Made by Nikhil Under CodeX Devs`.
