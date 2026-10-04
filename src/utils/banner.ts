import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { pink, purple, mint, yellow, cyan, gray, white } from '#utils/logger';

export function showBanner(client: any) {
  let djsVersion = '14.x';
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'node_modules/discord.js/package.json'), 'utf8')
    );
    djsVersion = pkg.version;
  } catch (_) {}

  const cmdCount = client?.commands ? client.commands.size : 0;
  const slashCount = client?.commandLoader?.slashCommands?.size
    ?? (client?.commands ? Array.from(client.commands.values()).filter((c: any) => c?.slash?.enabled ?? c?.enabledSlash).length : cmdCount);
  const eventCount = client?.eventsCount || 15;
  const clusterId = client?.cluster ? `Cluster ${client.cluster.id}` : 'Standalone';
  const tag = client?.user?.tag || 'Yuna#0000';

  console.log('');
  console.log(pink('   ╭────────────────────────────────────────────────────────────────────────╮'));
  console.log(pink('   │') + chalk.bold.hex('#ff79c6')('   🌸  Y U N A   V 2   ·   S A K U R A   M U S I C   E N G I N E       ') + pink('│'));
  console.log(pink('   ├────────────────────────────────────────────────────────────────────────┤'));
  console.log(pink('   │') + `  ${gray('Identity:')}      ${white.bold(tag)} ${gray('(' + clusterId + ')')}`.padEnd(80) + pink('│'));
  console.log(pink('   │') + `  ${gray('Developer:')}     ${mint('Nikhil')} ${gray('(kai._.dev)')}`.padEnd(80) + pink('│'));
  console.log(pink('   │') + `  ${gray('Architecture:')}  ${purple('V2 Decoupled Engine · Discord Components V2')}`.padEnd(80) + pink('│'));
  console.log(pink('   │') + `  ${gray('Database:')}      ${cyan('Unified WAL Mode')} ${gray('(database/yuna.yuna)')}`.padEnd(80) + pink('│'));
  console.log(pink('   │') + `  ${gray('Environment:')}   ${yellow('Node ' + process.version)} ${gray('· Discord.js v' + djsVersion)}`.padEnd(80) + pink('│'));
  console.log(pink('   │') + `  ${gray('Registry:')}      ${mint(cmdCount + ' Commands')} ${gray('(' + slashCount + ' Slash)')} ${gray('·')} ${mint(eventCount + ' Events')}`.padEnd(80) + pink('│'));
  console.log(pink('   ╰────────────────────────────────────────────────────────────────────────╯'));
  console.log('');
}

export default showBanner;

// Made by Nikhil Under CodeX Devs
