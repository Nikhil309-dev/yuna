# AGENTS.md — Yuna (Discord music bot)

## Stack
- TypeScript (ESM, `tsx`), discord.js v14 (Components V2), lavalink-client (Player), SQLite.
- Entry: `src/shard.ts` (shard manager) → `src/index.ts` (cluster) → loaders in `src/loaders/`.
- Build: `npm run build` (tsc → `dist/`); verify with `npm run typecheck`. Test scripts were removed for the clean launch build.
- Path aliases: `#core`, `#audio`, `#ui`, `#utils`, `#config`, `#commands`, `#database`, `#locales`.

## Local Lavalink
- `sudo docker compose up -d`. Bridge networking has no egress in this sandbox, so the
  service uses `network_mode: host` and binds `127.0.0.1:9000` (password `youshallnotpass`).
- First start downloads the youtube-source plugin from Maven; host networking is required for that.

## Startup on Pterodactyl / Nexio Host (read before touching the launch command)
- The panel's start command tests `[[ "${MAIN_FILE}" == "*.js" ]]` **with the glob quoted**, so it is a
  *literal* string compare: `"*.js"` is only true for the literal string `*.js`, never for a real
  filename. The panel's `node` branch is therefore dead and it **always** runs its `else` branch:
  global `ts-node --esm "/home/container/${MAIN_FILE}"`. Changing `MAIN_FILE` cannot reach the `node` branch.
- The panel's ts-node is made to work **from the repo alone** (no command edit, no env var):
  - `typescript` is pinned to **5.9.3** (the JS compiler API ts-node needs). Under `7.0.x` — the native
    Go port — `ts.sys` is `undefined`, so ts-node throws
    `Cannot read properties of undefined (reading 'fileExists')` during `readConfig()`, before any app
    code runs. Do not move the project's `typescript` back to 7.x.
  - `ts-node@10.9.2` is a **runtime dependency** (the panel resolves it globally, but having it pinned
    keeps local runs identical).
  - **`MAIN_FILE=boot.js`.** ts-node's ESM resolver cannot follow the repo's extensionless relative
    imports or `#alias` imports (it needs explicit `.js`), so `ts-node --esm src/shard.ts` still fails
    with `ERR_MODULE_NOT_FOUND`. `boot.js` has no relative imports; it launches the project-local `tsx`
    on `src/shard.ts`, which resolves both import styles.
- `boot.js` is a plain ESM launcher: it spawns the project-local `tsx` with
  `--expose-gc --max-old-space-size=2048` on `src/shard.ts`, forwarding signals and exit codes. Run it
  directly with `node boot.js`.
- `tsx` must stay a **runtime** dependency: `NODE_ENV=production npm install` skips devDependencies,
  which would otherwise leave `node_modules/.bin/tsx` missing on the host. `ts-node` and `typescript`
  are runtime deps for the same reason.
- Two working launch paths, both verified reaching the ClusterManager:
  - `node /home/container/boot.js` (primary).
  - the panel's locked `ts-node --esm "/home/container/boot.js"` (works with `MAIN_FILE=boot.js`).
- Recommended (cleaner) panel command, if the panel allows editing: replace the final `if/else` with
  `/usr/local/bin/node /home/container/boot.js ${NODE_ARGS}`.

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
  A `SectionBuilder` MUST carry an accessory (`setThumbnailAccessory`/`setButtonAccessory`) or
  discord.js throws `Received one or more errors` — use a plain `TextDisplayBuilder` for accessory-less
  bodies. Ephemeral component replies need `IsComponentsV2 | MessageFlags.Ephemeral` (bare
  `ephemeral: true` with components does not render).
- Card shells live in `src/ui/Theme.ts` (`buildContainer`, `buildError`, `buildSuccess`, `buildResult`,
  `buildBlocked`, …). Brand footer: `Built with ♥ under CodeX Development`.
- Logging: `DiscordLogger` (`src/utils/DiscordLogger.ts`) posts per-domain cards to `config.logChannels.*`
  (`LOG_*` env). `logger` (`src/utils/logger.ts`) also mirrors INFO/SUCCESS/WARN/ERROR to `WEBHOOK_URL`
  via a debounced `WebhookLogger` (reads env directly to dodge the `config`→`logger` import cycle).
- Files end with `// Made by Nikhil Under CodeX Devs`.
