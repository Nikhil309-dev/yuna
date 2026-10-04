# Yuna V2 Launch-Readiness Audit

**Repository:** `nikcodex/yuna`  
**Audited commit:** `a586a1f` (`main`)  
**Audit date:** 2026-10-04  
**Scope:** GitHub tracker/history, source tree, configuration, CI, dependencies, persistence, security hygiene, build, and runtime harness.

## Executive verdict

> **Before this audit: not ready for launch.**
>
> **After the local remediation changes in this working tree: code-level launch candidate, but not yet production-certified.**

The code now passes the available automated checks, but live Discord/Lavalink behavior, production credentials, permissions, and deployment observability still require a staging run with real services.

## GitHub status

- **Open issues:** none returned by GitHub (`gh issue list --state all` returned `[]`).
- **Pull requests:** four PRs, all merged; no open PRs.
- **Security advisories:** no repository advisory endpoint was available for this account/repository (GitHub returned 404), so dependency scanning was performed locally with `npm audit`.

No GitHub issue tracker does **not** mean no defects; several launch blockers were found in the repository itself.

## Validation results

| Check | Result |
|---|---:|
| `npm ci` | Pass |
| `npm run typecheck` | Pass |
| `npm run build` | Pass |
| `npm test` runtime harness | **Pass: 183/183 checks** |
| `npm run bench` | **Pass: database, cache, filters, and canvas benchmark completed** |
| `npm audit --audit-level=moderate` | **Pass: 0 vulnerabilities** |
| `git diff --check` | Pass |
| Event loader smoke coverage | 19 events loaded, 0 failures |
| Command loader smoke coverage | 88 commands loaded, 0 failures |

The first test attempt used `npm ci --ignore-scripts`, which intentionally skipped the native `better-sqlite3` build and failed to load its binding. Re-running with ordinary `npm ci`—the CI configuration—passed all 183 checks.

The final matrix was rerun after all fixes and ended with `FINAL_VALIDATION=PASS`. Docker was not installed in this sandbox, so `docker compose config` could not be executed; the Compose file was inspected statically and the container was not started.

The benchmark initially exposed two real defects: it used plain Node to import TypeScript files, and it did not provide the dummy configuration required by the offline database import. The benchmark now runs through `tsx`, uses an in-memory database, and supplies non-network dummy configuration. The final benchmark completed successfully with approximately 255k SQLite writes/sec, 582k point reads/sec, 4.2M cache operations/sec, and successful canvas generation.

## Findings and remediation

### Fixed: CI called a deleted test script — launch blocker

The workflow ran `npm test`, but the latest commit had removed the `test` script and its runtime harness. CI would fail immediately with `Missing script: "test"`.

**Remediation:** restored the existing runtime harness as `scripts/runtime-test.ts` and restored `npm test`; CI now also runs `npm run build`.

### Fixed: documented Discord token variable did not match runtime code — launch blocker

`.env.example` documented `DISCORD_TOKEN`, while the application only read `TOKEN` or lowercase `token`. A fresh setup following the documented instructions would exit at startup.

**Remediation:** runtime now accepts `DISCORD_TOKEN` first, while retaining backward compatibility with `TOKEN` and `token`.

### Fixed: live user/guild database artifacts were committed — privacy/release blocker

The repository tracked populated SQLite databases and WAL/SHM files, including runtime state such as:

- 44 guild rows;
- 8 user rows across the legacy database files;
- 101 economy rows in the unified database;
- 97 track-play rows;
- premium, liked-track, scheduler, cooldown, and anti-abuse state.

These are deployment artifacts and potentially personal/user data, not source code.

**Remediation:** removed the tracked database artifacts from the working tree and added ignore rules for `database/data/`, `database/scheduler.json`, and `database/*.yuna`.

**Important:** removing files from the latest commit does not erase them from Git history. Before publishing a cleaned repository, rewrite/remove the historical database blobs if they contain real user data, then rotate any credentials that may have been present elsewhere in history.

### Fixed: dependency vulnerabilities — security blocker

Initial `npm audit` reported **10 vulnerabilities: 6 high and 4 moderate**, including issues in Axios, Undici, `tar-fs`, `form-data`, `brace-expansion`, and Express transitive dependencies.

**Remediation:** applied lockfile-compatible updates with `npm audit fix --package-lock-only`, removed the unused discontinued `crypto-js` dependency, and verified:

```text
found 0 vulnerabilities
```

### Fixed: Lavalink was exposed on every host interface — deployment security issue

Docker published port 9000 as `9000:9000`, despite documentation describing Lavalink as local-only. That exposed a Lavalink endpoint protected only by the shared default password.

**Remediation:** Docker now binds `127.0.0.1:9000:9000`.

### Fixed: declared benchmark command was broken

`npm run bench` invoked plain Node against TypeScript source imports and exited before running. After switching the command to `tsx`, correcting source extensions, and making the benchmark self-contained, it completes successfully without Discord or Lavalink access.

### Remaining: default Lavalink password is weak and committed in configuration

The bundled local setup uses `youshallnotpass` in multiple files. This is acceptable only for isolated local development. It must not be reused on a public or multi-tenant deployment.

**Required before production:** set a strong secret through deployment configuration, keep the Docker port private, and ensure remote Lavalink nodes use unique credentials and TLS where applicable.

### Remaining: licensing statement is contradictory

`package.json` declares `MIT`, while the README says “This project is proprietary. All rights reserved.” These grant materially different permissions.

**Required before release:** choose the intended license and make `package.json`, README, and any `LICENSE` file agree. This is an ownership/legal decision and was intentionally not changed automatically.

### Remaining: no live-service certification in this sandbox audit

The automated harness uses mocks and isolated temporary databases. It does not prove:

- Discord gateway login and shard behavior with the production bot;
- command registration against Discord API;
- Lavalink v4 connectivity and YouTube source operation;
- voice join/play/skip/reconnect behavior over a real network;
- third-party source credentials (Spotify, LavaSrc, JioSaavn fallback);
- production backup restore and monitoring.

These require a staging bot and Lavalink node with non-production credentials.

## Changes currently present in the working tree

- `.github/workflows/ci.yml` — adds build validation and restores test execution.
- `.gitignore` — ignores all runtime database state.
- `docker-compose.yml` — binds Lavalink to localhost only.
- `package.json` / `package-lock.json` — restores the test command, updates vulnerable transitive dependencies, removes unused `crypto-js`.
- `readme.md` — documents `DISCORD_TOKEN` consistently.
- `src/config/config.ts` — accepts `DISCORD_TOKEN` with backward-compatible fallbacks.
- `scripts/runtime-test.ts` — restored comprehensive runtime harness.
- tracked database/WAL/SHM/scheduler artifacts — removed from the shipped tree.

No changes were pushed to GitHub by this audit.

## Release checklist

Before launch:

1. Review and commit the local remediation changes.
2. Purge sensitive historical database blobs from Git history if they contain real user data.
3. Resolve the MIT-versus-proprietary license contradiction.
4. Replace the default Lavalink password and verify port/network isolation.
5. Run a staging deployment with real Discord and Lavalink credentials.
6. Exercise `/play`, queue controls, filters, playlists, premium/economy commands, localization, 24/7 reconnect, and shutdown/restart recovery.
7. Confirm Discord bot intents and permissions match the deployed bot configuration.
8. Verify backup creation and restore from a clean database.
9. Add production health/error monitoring and a rollback procedure.

## Final assessment

**The repository is not “ready for launch” solely because GitHub has no open issues.** The local source and test state are now healthy: typecheck, build, 183 runtime checks, and dependency audit all pass. The remaining release gates are primarily production certification, secret hardening, historical data cleanup, and the licensing decision.
