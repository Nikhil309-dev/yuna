// ESM launcher (package.json has "type": "module") that boots the TypeScript
// shard manager through the project-local `tsx`. Its only job is to be a plain
// `.js` file: a Pterodactyl-style panel's `[[ "${MAIN_FILE}" == "*.js" ]]` test
// (quoted, so effectively literal) only ever matches the literal string "*.js",
// so the panel's `node` branch is dead and it always falls through to
// `ts-node --esm`. Running `node boot.js` explicitly bypasses that branch.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const shardEntry = join(projectRoot, 'src', 'shard.ts');

const tsxBin = join(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tsx.cmd' : 'tsx',
);

if (!existsSync(tsxBin)) {
  console.error('[boot] Project-local tsx not found. Run `npm install` first.');
  process.exit(1);
}

const passthrough = process.argv.slice(2);

const child = spawn(tsxBin, ['--expose-gc', '--max-old-space-size=2048', shardEntry, ...passthrough], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: process.env,
});

let forwarding = false;
const forward = (signal) => {
  if (forwarding || !child.pid) return;
  forwarding = true;
  try {
    child.kill(signal);
  } catch {
    /* child already gone */
  }
};
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => forward(signal));
}

child.on('error', (error) => {
  console.error('[boot] Failed to launch tsx:', error?.message || error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
