import { AttachmentBuilder, MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { Middleware } from "#core/Middleware";
import { logger } from "#utils/logger";
import { DiscordLogger } from "#utils/DiscordLogger";
import { db } from "#database/Database";
import { i18n } from "#utils/i18n.js";
import { localeFor, runWithLocale } from "#utils/locale.js";
import { PlayerManager } from "#audio/PlayerManager";
import { config } from "#config/config";
import emoji from "#config/emoji";
import os from "os";
import { BannerCard } from "#ui/cards/BannerCard";
import { buildYunaContainer } from "#ui/Theme";

function _parseCommand(message: any, client: any) {
  const content = message.content.trim();
  const mentionPrefixRegex = new RegExp(`^<@!?${client.user.id}>\\s+`);
  const mentionMatch = content.match(mentionPrefixRegex);

  let commandText = null;

  if (mentionMatch) {
    commandText = content.slice(mentionMatch[0].length).trim();
  } else {
    if (db.isUserPremium(message.author.id)) {
      const userPrefix = db
        .getUserPrefixes(message.author.id)
        .find((p: string) => content.startsWith(p));
      if (userPrefix) {
        commandText = content.slice(userPrefix.length).trim();
      }
    }

    if (commandText === null) {
      const guildPrefix = db
        .getPrefixes(message.guild.id)
        .find((p) => content.startsWith(p));
      if (guildPrefix) {
        commandText = content.slice(guildPrefix.length).trim();
      }
    }

    if (commandText === null && db.hasNoPrefix(message.author.id)) {
      commandText = content;
    }

    if (commandText === null) {
      if (/^(yuna|yuki)/i.test(content)) {
        const match = content.match(/^(yuna|yuki)/i);
        commandText = content.slice(match[0].length).trim();
      }
    }
  }

  if (commandText === null) return null;

  const parts = commandText.split(/\s+/);
  const commandName = parts.shift()?.toLowerCase();

  return commandName ? { commandName, args: parts } : null;
}

export default {
  name: "messageCreate",
  async execute(message: any, client: any) {
    if (message.author.bot || !message.guild) return;

    if (db.isUserBlacklisted(message.author.id) || db.isGuildBlacklisted(message.guild.id)) return;

    const mentionRegex = new RegExp(`^<@!?${client.user.id}>\\s*$`);
    if (mentionRegex.test(message.content.trim())) {
      const mentionLocale = localeFor(message.author.id, message.guild.id);
      const mt = (key: string, replacements: Record<string, any> = {}) => i18n.ui(mentionLocale, key, replacements);
      const guildPrefixes = db.getPrefixes(message.guild.id);
      const userPrefixes = db.getUserPrefixes(message.author.id);

      const supportButton = new ButtonBuilder()
        .setLabel(mt("mention.support"))
        .setURL(config.links?.supportServer || "https://discord.gg/XYwwyDKhec")
        .setStyle(ButtonStyle.Link);

      const inviteButton = new ButtonBuilder()
        .setLabel(mt("mention.invite"))
        .setURL(`https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`)
        .setStyle(ButtonStyle.Link);

      const row = new ActionRowBuilder().addComponents(supportButton, inviteButton);

      const memoryUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
      const guildCount = client.guilds.cache.size;

      let lavalinkStatus = mt("mention.lavalinkDisconnected");
      let lavalinkColor = emoji.get("cross") || "❌";

      if (client.music && client.music.lavalink) {
        const connectedNodes = Array.from((client.music.lavalink as any).nodeManager.nodes.values()).filter((n: any) => n.connected);
        if (connectedNodes.length > 0) {
          lavalinkStatus = mt("mention.lavalinkConnected");
          lavalinkColor = emoji.get("check") || "✅";
        }
      }

      let content = `**${mt("mention.tagline")}**\n\n`;
      content += `┌─ **${emoji.get("info")} ${mt("mention.configuration")}**\n`;
      content += `├─ ${mt("mention.myPrefix")}: \`${guildPrefixes[0]}\` (${mt("mention.or")} \`yuna\`)\n`;
      if (userPrefixes.length > 0) {
        content += `├─ ${mt("mention.yourPrefixes")}: ${userPrefixes.map((p: string) => `\`${p}\``).join(', ')}\n`;
      }
      content += `├─ ${mt("mention.slashSupported")} (\`/help\`, \`/play\`)\n`;
      content += `└─ ${mt("mention.helpCommand")}: \`${guildPrefixes[0]}help\` ${mt("mention.or")} \`/help\`\n\n`;

      content += `┌─ **${emoji.get("music")} ${mt("mention.systemStats")}**\n`;
      content += `├─ ${mt("mention.servers")}: ${guildCount.toLocaleString()}\n`;
      content += `├─ ${mt("mention.memory")}: ${memoryUsage} MB\n`;
      content += `└─ ${mt("mention.lavalink")}: ${lavalinkStatus} ${lavalinkColor}`;

      try {
        const bannerBuffer = BannerCard ? await BannerCard.renderBanner() : null;
        const attachment = bannerBuffer ? new AttachmentBuilder(bannerBuffer, { name: 'yuna-banner.png' }) : null;

        const containerOpts = {
          title: mt("mention.title", { bot: client.user.username }),
          content: content,
          thumbnail: client.user.displayAvatarURL({ size: 256 }),
          components: [row],
          icon: '🌸'
        };
        if (attachment) {
          (containerOpts as any).image = 'attachment://yuna-banner.png';
        }

        const container = buildYunaContainer(containerOpts);

        const replyOpts = {
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        };
        if (attachment) {
          (replyOpts as any).files = [attachment];
        }

        return message.reply(replyOpts);
      } catch (err) {
        logger.error('MentionResponse', 'Error rendering banner:', err);
        const fallbackContainer = buildYunaContainer({
          title: mt("mention.title", { bot: client.user.username }),
          content: content,
          thumbnail: client.user.displayAvatarURL({ size: 256 }),
          components: [row],
          icon: '🌸'
        });
        return message.reply({
          components: [fallbackContainer],
          flags: MessageFlags.IsComponentsV2,
        });
      }
    }

    const commandInfo = _parseCommand(message, client);
    if (!commandInfo) return;

    const { commandName, args } = commandInfo;
    let command = client.commands.get(commandName);
    if (!command) {
      const aliasTarget = client.aliases.get(commandName);
      if (aliasTarget) {
        command = client.commands.get(aliasTarget);
      }
    }
    if (!command) return;

    const player = client.music?.getPlayer(message.guild.id);
    const ctx = {
      interaction: null,
      client,
      message,
      author: message.author,
      options: null,
      args,
      guild: message.guild,
      user: message.author,
      member: message.member,
      channel: message.channel,
      player,

      pm: player ? new PlayerManager(player) : null,
      locale: localeFor(message?.author?.id, message?.guild?.id),
      t: (category: string, replacements: Record<string, unknown> = {}) => i18n.t(localeFor(message?.author?.id, message?.guild?.id), category, replacements)
    };

    try {
      const middlewareResult = await runWithLocale(ctx.locale, () => Middleware.run(ctx, command));
      if (!middlewareResult.pass) {
        return message.reply(middlewareResult.response);
      }

      if (db.economy) {
        db.economy.addCoins(message.author.id, 1);
      }

      const proceed = await command.beforeExecute(ctx);
      if (!proceed) return;

      await runWithLocale(ctx.locale, async () => {
          await command.execute(ctx);
        });
      await command.afterExecute(ctx);
      DiscordLogger.logCmdRun(client, { user: message.author, commandName: command.name, guild: message.guild, type: 'Prefix', args });

    } catch (error) {
      DiscordLogger.logError(client, { context: `PrefixCmd:${command.name}`, error, message: `Error running ${command.name}` });
      if (typeof command.onError === 'function') {
        await command.onError(ctx, error);
      } else {
        logger.error("MessageCreate", `Error executing command '${command.name}'`, error);
      }
      // The base onError() only logs — make sure the user still gets feedback.
      await message.reply(i18n.ui(ctx.locale, "common.unexpected")).catch(() => {});
    }
  },
};

// Made by Nikhil Under CodeX Devs
