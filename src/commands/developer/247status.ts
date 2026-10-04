import { Command, CommandContext } from '#core/Command';
import { MessageFlags } from 'discord.js';
import { db } from '#database/Database';
import { buildContainer } from '#ui/Theme';
import { isOwner } from '#core/AccessControl';
import { i18n } from '#utils/i18n';

class Status247Command extends Command {
  constructor() {
    super({
      name: '247status',
      description: 'Check the status of all active 24/7 sessions across guilds',
      usage: '247status',
      aliases: ['247s'],
      category: 'developer',
      examples: ['247status'],
      cooldown: 5,
      access: { ownerOnly: true },
      slash: {
        enabled: true,
        autoDefer: true,
        data: {
          name: '247status',
          description: 'Developer command to check 24/7 connection health',
        },
      },
    });
  }

  async execute(ctx: CommandContext) {
    if (!isOwner((ctx as any).user?.id || (ctx as any).author?.id)) return;

    const guilds247 = db.guild.getValid247Guilds();
    if (!guilds247 || guilds247.length === 0) {
      const container = buildContainer({
        title: '24/7 Status',
        content: i18n.cmd('No guilds currently have 24/7 mode active.'),
        icon: '📡'
      });
      return this._reply(ctx, { components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    let activeCount = 0;
    let offlineCount = 0;
    let details = '';

    for (const guildData of guilds247) {
      const player = ctx.client.music?.getPlayer(guildData.id);
      const guild = ctx.client.guilds.cache.get(guildData.id);
      const name = guild ? guild.name : i18n.cmd("Unknown ({id})", { id: guildData.id });

      if (player && player.connected) {
        activeCount++;
        details += i18n.cmd("🟢 **{name}**: Connected (Ch: <#{channel}>)", { name, channel: player.voiceChannelId }) + "\n";
      } else {
        offlineCount++;
        details += i18n.cmd("🔴 **{name}**: Offline / Waiting to reconnect", { name }) + "\n";
      }
    }

    const content = i18n.cmd("**Total 24/7 Guilds:** {count}\n", { count: guilds247.length }) +
                    i18n.cmd("**Active:** {active} | **Offline:** {offline}\n\n", { active: activeCount, offline: offlineCount }) +
                    details.substring(0, 3000);

    const container = buildContainer({
      title: '24/7 Connection Health',
      content: content,
      icon: '📡'
    });

    return this._reply(ctx, { components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  async slashExecute(ctx: CommandContext) {
    return this.execute(ctx);
  }

  async _reply(ctx: any, payload: any) {
    // `execute` hands us the whole command context, not a reply target —
    // resolve the interaction/message first or every reply throws.
    const context = ctx?.interaction || ctx?.message || ctx;
    if (context.editReply && (context.deferred || context.replied)) {
      return await context.editReply(payload);
    }
    return await context.reply(payload);
  }
}

export default new Status247Command();

// Made by Nikhil Under CodeX Devs
