import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags
} from 'discord.js';
import { config } from '#config/config';
import { logger } from '#utils/logger';
import emoji from '#config/emoji';

function card(header: string, body: string) {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(header))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
}

export class DiscordLogger {
  static getChannel(client: any, channelId: any) {
    if (!client || !channelId) return null;
    return client.channels?.cache?.get(channelId) || null;
  }

  static async sendLog(client: any, channelId: any, container: any) {
    try {
      const channel = this.getChannel(client, channelId);
      if (!channel) return;
      await channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    } catch (err: any) {
      logger.debug('DiscordLogger', `Failed to send log to channel ${channelId}: ${err?.message}`);
    }
  }

  static async logGuildJoin(client: any, guild: any) {
    const channelId = config.logChannels?.guildJoin;
    if (!channelId) return;

    const container = card(
      `${emoji.get('check') || '✅'} **New Guild Joined**`,
      `**${emoji.get('folder')} Server Info**\n` +
        `├─ **Name:** ${guild.name}\n` +
        `├─ **ID:** \`${guild.id}\` \n` +
        `├─ **Members:** ${guild.memberCount.toLocaleString()}\n` +
        `└─ **Owner:** <@${guild.ownerId}> (\`${guild.ownerId}\`)\n\n` +
        `**Total Servers Now:** ${client.guilds?.cache?.size || 'N/A'}`
    );

    await this.sendLog(client, channelId, container);
  }

  static async logGuildLeave(client: any, guild: any) {
    const channelId = config.logChannels?.guildLeave;
    if (!channelId) return;

    const container = card(
      `${emoji.get('cross') || '❌'} **Guild Removed**`,
      `**${emoji.get('folder')} Server Info**\n` +
        `├─ **Name:** ${guild.name}\n` +
        `├─ **ID:** \`${guild.id}\` \n` +
        `└─ **Members:** ${guild.memberCount?.toLocaleString() || 'N/A'}\n\n` +
        `**Total Servers Now:** ${client.guilds?.cache?.size || 'N/A'}`
    );

    await this.sendLog(client, channelId, container);
  }

  static async logCmdRun(client: any, { user, commandName, guild, type = 'Prefix', args = [] }: { user: any; commandName: string; guild: any; type?: string; args?: string[] }) {
    const channelId = config.logChannels?.cmdRun;
    if (!channelId) return;

    const argsText = args.length > 0 ? `\`${args.join(' ')}\`` : '*None*';

    const container = card(
      `⚡ **Command Executed**`,
      `**${emoji.get('folder')} Command Details**\n` +
        `├─ **Command:** \`${commandName}\` (${type})\n` +
        `├─ **User:** ${user.username} (\`${user.id}\`)\n` +
        `├─ **Guild:** ${guild ? `${guild.name} (\`${guild.id}\`)` : 'Direct Message'}\n` +
        `└─ **Arguments:** ${argsText}`
    );

    await this.sendLog(client, channelId, container);
  }

  static async logError(client: any, { context, error, message }: { context: string; error?: any; message?: string }) {
    const channelId = config.logChannels?.errorLogs;
    if (!channelId) return;

    const errorDetails = error ? `\`\`\`js\n${(error.stack || error.toString()).slice(0, 800)}\n\`\`\`` : '*No Stack Trace*';

    const container = card(
      `${emoji.get('cross') || '⚠️'} **System Error Caught**`,
      `**${emoji.get('folder')} Context:** \`${context}\` \n` +
        `**Message:** ${message || 'Error occurred'}\n\n` +
        `**Trace:**\n${errorDetails}`
    );

    await this.sendLog(client, channelId, container);
  }

  static async logMusic(client: any, { event, guild, track, requester }: { event: string; guild?: any; track?: any; requester?: any }) {
    const channelId = config.logChannels?.musicLogs;
    if (!channelId) return;

    const trackTitle = track?.title || track?.info?.title || 'Unknown Track';
    const author = track?.author || track?.info?.author || 'Unknown Artist';

    const container = card(
      `🎵 **Music Event: ${event}**`,
      `**${emoji.get('folder')} Track Details**\n` +
        `├─ **Title:** ${trackTitle}\n` +
        `├─ **Artist:** ${author}\n` +
        `├─ **Guild:** ${guild ? `${guild.name} (\`${guild.id}\`)` : 'N/A'}\n` +
        `└─ **Requested By:** ${requester ? `${requester.displayName || requester.username} (\`${requester.id}\`)` : 'Autoplay'}`
    );

    await this.sendLog(client, channelId, container);
  }

  static async logAbuseBlacklist(client: any, { action, targetId, targetType = 'User', reason, admin }: { action: string; targetId: string; targetType?: string; reason?: string; admin?: any }) {
    const channelId = config.logChannels?.abuseBlacklist;
    if (!channelId) return;

    const container = card(
      `🛡️ **Anti-Abuse / Blacklist Action**`,
      `**${emoji.get('folder')} Audit Log**\n` +
        `├─ **Action:** ${action}\n` +
        `├─ **Target:** ${targetType} (\`${targetId}\`)\n` +
        `├─ **Reason:** ${reason || 'Excessive Cooldown Violations'}\n` +
        `└─ **Executed By:** ${admin ? `${admin.username} (\`${admin.id}\`)` : 'System Automated Guard'}`
    );

    await this.sendLog(client, channelId, container);
  }

  static async logClusterLavalink(client: any, { title, message, status = 'INFO' }: { title: string; message: string; status?: string }) {
    const channelId = config.logChannels?.clusterLavalink;
    if (!channelId) return;

    const container = card(
      `🌐 **Cluster / Lavalink: ${title}**`,
      `**Status:** \`${status}\` \n` +
        `**Details:** ${message}`
    );

    await this.sendLog(client, channelId, container);
  }
}

// Made by Nikhil Under CodeX Devs
