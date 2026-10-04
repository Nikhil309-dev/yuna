import type { Message, Interaction, CommandInteraction } from 'discord.js';
import type { YunaClient } from '#core/YunaClient';
import { Command } from "#core/Command";
import { db } from "#database/Database";
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ThumbnailBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";

import { config } from "#config/config";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import { componentCollectorSource } from "#ui/Components";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";

const ITEMS_PER_PAGE = 5;

class PremiumCommand extends Command {
  constructor() {
    super({
      name: "premium",
      description: "Manage premium subscriptions for users and guilds (Owner Only)",
      usage: "premium <grant|revoke|stats|cleanup> [type] [id] [duration] [reason]",
      aliases: ["prem"],
      category: "developer",
      examples: [
        "premium grant user 123456789 30d Premium granted",
        "premium grant guild 987654321 perm Guild premium",
        "premium revoke user 123456789",
        "premium stats",
        "premium cleanup"
      ],
      access: { ownerOnly: true }
    });
  }

  async execute({ client, message, args }: any) {
    try {
      if (!config.ownerIds?.includes(message.author.id)) {
        return this._sendError(message, "Access Denied", i18n.cmd("This command is restricted to bot owners only."));
      }

      if (!args.length) {
        const sent = await message.reply({
          components: [this._createHelpContainer()],
          flags: MessageFlags.IsComponentsV2,
          fetchReply: true
        });
        return this._setupHelpCollector(sent, message.author.id, client);
      }

      const action = args[0].toLowerCase();

      switch (action) {
        case "grant":
          return await this._handleGrant(client, message, args.slice(1));
        case "revoke":
          return await this._handleRevoke(client, message, args.slice(1));
        case "stats":
          return await this._handleStats(client, message);
        case "cleanup":
          return await this._handleCleanup(client, message);
        default:
          return this._sendError(
            message,
            i18n.translateTitle("Invalid Action"),
            i18n.cmd("Unknown action: `{action}`\n\n**Valid actions:**", { action }) +
              "\n" + i18n.cmd("├─ `grant` - Grant premium to user/guild") +
              "\n" + i18n.cmd("├─ `revoke` - Revoke premium from user/guild") +
              "\n" + i18n.cmd("├─ `stats` - View premium statistics") +
              "\n" + i18n.cmd("└─ `cleanup` - Remove expired premiums"),
          );
      }
    } catch (error: any) {
      logger.error("PremiumCommand", "Premium command error:", error);
      return this._sendError(message, "Error", i18n.cmd("An unexpected error occurred:\n```\n{error}\n```", { error: error.message }));
    }
  }

  async _handleGrant(client: any, message: any, args: any) {
    if (args.length < 2) {
      return this._sendError(
        message,
        i18n.translateTitle("Usage Error"),
        i18n.cmd("**Command Format:**") +
          "\n`premium grant <user|guild> <id> [duration] [reason]`\n\n" +
          i18n.cmd("**Duration Options:**") + "\n" +
          i18n.cmd("├─ `1d` - 1 day") + "\n" +
          i18n.cmd("├─ `7d` - 7 days") + "\n" +
          i18n.cmd("├─ `30d` - 30 days (default)") + "\n" +
          i18n.cmd("└─ `perm` - Permanent")
      );
    }

    const type = args[0].toLowerCase();
    let id = args[1];

    if (id.startsWith("<@") && id.endsWith(">")) {
      id = id.slice(2, -1);
      if (id.startsWith("!")) id = id.slice(1);
    }

    const durationArg = args[2] || "30d";
    const reason = args.slice(3).join(" ") || i18n.cmd("Premium granted by owner");

    if (!["user", "guild"].includes(type)) {
      return this._sendError(
          message,
          i18n.translateTitle("Invalid Type"),
          i18n.cmd("Type must be either `user` or `guild`.") + "\n\n" +
            i18n.cmd("**Examples:**") + "\n" +
            i18n.cmd("├─ `premium grant user 123456789 30d`") + "\n" +
            i18n.cmd("└─ `premium grant guild 987654321 perm`"),
        );
    }

    let expiresAt = null;
    if (durationArg.toLowerCase() !== "perm" && durationArg.toLowerCase() !== "permanent") {
      const duration = this._parseDuration(durationArg);
      if (!duration) {
        return this._sendError(
            message,
            i18n.translateTitle("Invalid Duration"),
            i18n.cmd("**Valid durations:**") + "\n" +
              i18n.cmd("├─ `1d` - 1 day") + "\n" +
              i18n.cmd("├─ `7d` - 7 days") + "\n" +
              i18n.cmd("├─ `30d` - 30 days") + "\n" +
              i18n.cmd("└─ `perm` - Permanent"),
          );
      }
      expiresAt = Date.now() + duration;
    }

    try {
      if (type === "user") {
        db.premium.grantUserPremium(id, message.author.id, expiresAt, reason);
      } else {
        db.premium.grantGuildPremium(id, message.author.id, expiresAt, reason);
      }

      const expiryText = expiresAt
        ? `<t:${Math.floor(expiresAt / 1000)}:R>`
        : i18n.cmd("Never (Permanent)");

      return this._sendSuccess(
        message,
        i18n.translateTitle("Premium Granted"),
        i18n.cmd("**Successfully granted {type} premium!**", { type }) +
          "\n\n" +
          i18n.cmd("**{emoji} Details:**", { emoji: emoji.get("folder") }) +
          "\n" + i18n.cmd("├─ **Target:** `{id}`", { id }) +
          "\n" + i18n.cmd("├─ **Type:** {type}", { type: type.charAt(0).toUpperCase() + type.slice(1) }) +
          "\n" + i18n.cmd("├─ **Expires:** {expires}", { expires: expiryText }) +
          "\n" + i18n.cmd("└─ **Reason:** {reason}", { reason })
      );
    } catch (error: any) {
      logger.error("PremiumCommand", "Error granting premium:", error);
      return this._sendError(message, "Database Error", `\`\`\`\n${error.message}\n\`\`\``);
    }
  }

  async _handleRevoke(client: any, message: any, args: any) {
    if (args.length < 2) {
      return this._sendError(
        message,
        i18n.translateTitle("Usage Error"),
        i18n.cmd("**Command Format:**") +
          "\n`premium revoke <user|guild> <id>`\n\n" +
          i18n.cmd("**Examples:**") + "\n" +
          i18n.cmd("├─ `premium revoke user 123456789`") + "\n" +
          i18n.cmd("└─ `premium revoke guild 987654321`"),
      );
    }

    const type = args[0].toLowerCase();
    let id = args[1];

    if (id.startsWith("<@") && id.endsWith(">")) {
      id = id.slice(2, -1);
      if (id.startsWith("!")) id = id.slice(1);
    }

    if (!["user", "guild"].includes(type)) {
      return this._sendError(
          message,
          i18n.translateTitle("Invalid Type"),
          i18n.cmd("Type must be either `user` or `guild`.") + "\n\n" +
            i18n.cmd("**Examples:**") + "\n" +
            i18n.cmd("├─ `premium revoke user 123456789`") + "\n" +
            i18n.cmd("└─ `premium revoke guild 987654321`"),
        );
    }

    try {
      if (type === "user") {
        db.premium.revokeUserPremium(id);
      } else {
        db.premium.revokeGuildPremium(id);
      }

      return this._sendSuccess(
        message,
        i18n.translateTitle("Premium Revoked"),
        i18n.cmd("**Successfully revoked {type} premium!**", { type }) +
          "\n\n" +
          i18n.cmd("**{emoji} Details:**", { emoji: emoji.get("folder") }) +
          "\n" + i18n.cmd("├─ **Target:** `{id}`", { id }) +
          "\n" + i18n.cmd("└─ **Type:** {type}", { type: type.charAt(0).toUpperCase() + type.slice(1) })
      );
    } catch (error: any) {
      logger.error("PremiumCommand", "Error revoking premium:", error);
      return this._sendError(message, "Database Error", `\`\`\`\n${error.message}\n\`\`\``);
    }
  }

  async _handleStats(client: any, message: any) {
    try {
      const stats = db.premium.getStats();
      const userPremiums = db.premium.getAllUserPremiums();
      const guildPremiums = db.premium.getAllGuildPremiums();

      const sent = await message.reply({
        components: [this._createStatsContainer(stats, userPremiums, guildPremiums, 0, 0)],
        flags: MessageFlags.IsComponentsV2,
        fetchReply: true
      });

      this._setupStatsCollector(sent, message.author.id, stats, userPremiums, guildPremiums);
    } catch (error: any) {
      logger.error("PremiumCommand", "Error fetching stats:", error);
      return this._sendError(message, "Database Error", `\`\`\`\n${error.message}\n\`\`\``);
    }
  }

  async _handleCleanup(client: any, message: any) {
    try {
      const result = db.premium.cleanupExpired();

      return this._sendSuccess(
        message,
        "Cleanup Complete",
        i18n.cmd("**Cleanup operation successful!**\n\n**{emoji} Results:**\n├─ **User premiums removed:** {users}\n├─ **Guild premiums removed:** {guilds}\n└─ **Total cleaned:** {total}", { emoji: emoji.get("folder"), users: result.usersRevoked, guilds: result.guildsRevoked, total: result.total })
      );
    } catch (error: any) {
      logger.error("PremiumCommand", "Error during cleanup:", error);
      return this._sendError(message, "Cleanup Error", `\`\`\`\n${error.message}\n\`\`\``);
    }
  }

  _createHelpContainer() {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(i18n.cmd("### {emoji} {title}", { emoji: emoji.get("info"), title: i18n.translateTitle("Premium Management") }))
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = i18n.cmd(
      "**Available premium management commands:**\n\n" +
      "**{check} Commands:**\n" +
      "├─ `premium grant <user|guild> <id> [duration] [reason]`\n" +
      "├─ `premium revoke <user|guild> <id>`\n" +
      "├─ `premium stats`\n" +
      "└─ `premium cleanup`\n\n" +
      "**{folder} Duration Examples:**\n" +
      "├─ `1d` - 1 day\n" +
      "├─ `7d` - 7 days\n" +
      "├─ `30d` - 30 days\n" +
      "└─ `perm` - Permanent\n\n" +
      "**{add} Usage Examples:**\n" +
      "├─ `premium grant user 123456789 30d VIP user`\n" +
      "├─ `premium grant guild 987654321 perm Server boost`\n" +
      "├─ `premium revoke user 123456789`\n" +
      "└─ `premium stats`",
      { check: emoji.get("check"), folder: emoji.get("folder"), add: emoji.get("add") }
    );

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder()
          .setCustomId("prem_stats")
          .setLabel(i18n.cmd("View Statistics"))
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(emoji.get("folder"))
      )
    );

    return container;
  }

  _createStatsContainer(stats: any, userPremiums: any, guildPremiums: any, userPage: any, guildPage: any) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(i18n.cmd("### {emoji} {title}", { emoji: emoji.get("folder"), title: i18n.translateTitle("Premium Statistics") }))
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    let content = i18n.cmd("**Overview:**\n") +
      i18n.cmd("├─ **Users:** {total} ({active} active)\n", { total: stats.total.users, active: stats.active.users }) +
      i18n.cmd("├─ **Guilds:** {total} ({active} active)\n", { total: stats.total.guilds, active: stats.active.guilds }) +
      i18n.cmd("├─ **Total Active:** {count}\n", { count: stats.active.total }) +
      i18n.cmd("└─ **Total Registered:** {count}\n\n", { count: stats.total.total });

    const userStart = userPage * ITEMS_PER_PAGE;
    const userEnd = Math.min(userStart + ITEMS_PER_PAGE, userPremiums.length);
    const guildStart = guildPage * ITEMS_PER_PAGE;
    const guildEnd = Math.min(guildStart + ITEMS_PER_PAGE, guildPremiums.length);

    if (userPremiums.length > 0) {
      content += i18n.cmd("**{emoji} User Premiums ({from}-{to} of {total}):**\n", { emoji: emoji.get("check"), from: userStart + 1, to: userEnd, total: userPremiums.length });
      if (userEnd > userStart) {
        userPremiums.slice(userStart, userEnd).forEach((prem: any, index: any) => {
          const expiry = prem.expires_at ? `<t:${Math.floor(prem.expires_at / 1000)}:R>` : i18n.cmd("Permanent");
          const isLast = index === (userEnd - userStart - 1) && guildPremiums.length === 0;
          content += `${isLast ? '└─' : '├─'} \`${prem.user_id}\` - ${expiry}\n`;
        });
      }
    }

    if (guildPremiums.length > 0) {
      content += i18n.cmd("\n**{emoji} Guild Premiums ({from}-{to} of {total}):**\n", { emoji: emoji.get("add"), from: guildStart + 1, to: guildEnd, total: guildPremiums.length });
      if (guildEnd > guildStart) {
        guildPremiums.slice(guildStart, guildEnd).forEach((prem: any, index: any) => {
          const expiry = prem.expires_at ? `<t:${Math.floor(prem.expires_at / 1000)}:R>` : i18n.cmd("Permanent");
          const isLast = index === (guildEnd - guildStart - 1);
          content += `${isLast ? '└─' : '├─'} \`${prem.guild_id}\` - ${expiry}\n`;
        });
      }
    }

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const buttons = [];

    if (userPremiums.length > ITEMS_PER_PAGE || guildPremiums.length > ITEMS_PER_PAGE) {
      if (userPage > 0 || guildPage > 0) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId("prem_prev")
            .setLabel(i18n.cmd("Previous"))
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(emoji.get("reset"))
        );
      }

      if (userEnd < userPremiums.length || guildEnd < guildPremiums.length) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId("prem_next")
            .setLabel(i18n.cmd("Next"))
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(emoji.get("add"))
        );
      }
    }

    buttons.push(
      new ButtonBuilder()
        .setCustomId("prem_help")
        .setLabel(i18n.cmd("Back to Help"))
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get("info"))
    );

    if (buttons.length > 0) {
      container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons));
    }

    return container;
  }

  _parseDuration(duration: any) {
    const match = duration.match(/^(\d+)([dhm])$/i);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case "m":
        return value * 60 * 1000;
      case "h":
        return value * 60 * 60 * 1000;
      case "d":
        return value * 24 * 60 * 60 * 1000;
      default:
        return null;
    }
  }

  _setupHelpCollector(message: any, userId: any, client: any) {
    const collector = componentCollectorSource(message).createMessageComponentCollector({
      filter: (i: any) => i.user.id === userId,
      time: 300_000
    });

    collector.on("collect", async (interaction: any) => {
      try {
        if (interaction.customId === "prem_stats") {
          await interaction.deferUpdate();
          const stats = db.premium.getStats();
          const userPremiums = db.premium.getAllUserPremiums();
          const guildPremiums = db.premium.getAllGuildPremiums();

          await interaction.editReply({
            components: [this._createStatsContainer(stats, userPremiums, guildPremiums, 0, 0)]
          });

          this._setupStatsCollector(message, userId, stats, userPremiums, guildPremiums, client);
        }
      } catch (error: any) {
        logger.error("PremiumCommand", "Help collector error:", error);
      }
    });

    this._setupCollectorEnd(collector, message);
  }

  _setupStatsCollector(message: any, userId: any, stats: any, userPremiums: any, guildPremiums: any, client?: any) {
    let userPage = 0;
    let guildPage = 0;

    const collector = componentCollectorSource(message).createMessageComponentCollector({
      filter: (i: any) => i.user.id === userId,
      time: 300_000
    });

    collector.on("collect", async (interaction: any) => {
      try {
        await interaction.deferUpdate();

        if (interaction.customId === "prem_prev") {
          if (guildPage > 0) {
            guildPage--;
          } else if (userPage > 0) {
            userPage--;
            guildPage = Math.max(0, Math.ceil(guildPremiums.length / ITEMS_PER_PAGE) - 1);
          }
        } else if (interaction.customId === "prem_next") {
          const maxUserPages = Math.ceil(userPremiums.length / ITEMS_PER_PAGE);
          const maxGuildPages = Math.ceil(guildPremiums.length / ITEMS_PER_PAGE);

          if (userPage < maxUserPages - 1) {
            userPage++;
          } else if (guildPage < maxGuildPages - 1) {
            guildPage++;
          }
        } else if (interaction.customId === "prem_help") {
          await interaction.editReply({
            components: [this._createHelpContainer()]
          });
          return this._setupHelpCollector(message, userId, client as any);
        }

        await interaction.editReply({
          components: [this._createStatsContainer(stats, userPremiums, guildPremiums, userPage, guildPage)]
        });
      } catch (error: any) {
        logger.error("PremiumCommand", "Stats collector error:", error);
      }
    });

    this._setupCollectorEnd(collector, message);
  }

  _setupCollectorEnd(collector: any, message: any) {
    collector.on("end", async () => {
      try {
        const fetchedMessage = await message.fetch().catch(() => null);
        if (fetchedMessage?.components.length > 0) {
          const disabledComponents = fetchedMessage.components.map((row: any) => {
            const newRow = ActionRowBuilder.from(row);
            newRow.components.forEach((component: any) => {
              if ((component as ButtonBuilder).data.style !== ButtonStyle.Link) {
                (component as ButtonBuilder).setDisabled(true);
              }
            });
            return newRow;
          });
          await fetchedMessage.edit({ components: disabledComponents });
        }
      } catch (error: any) {
        if (error.code !== 10008) {
          logger.error("PremiumCommand", "Failed to disable components:", error);
        }
      }
    });
  }

  _sendSuccess(message: Message, title: string, description: string) {
    const container = new ContainerBuilder();
    const localizedTitle = i18n.translateTitle(title);

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${emoji.get("check")} ${localizedTitle}`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(description))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    return message.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2
    });
  }

  _sendError(message: Message, title: string, description: string) {
    const container = new ContainerBuilder();
    const localizedTitle = i18n.translateTitle(title);

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${emoji.get("cross")} ${localizedTitle}`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(description))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    return message.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2
    });
  }
}

export default new PremiumCommand();

// Made by Nikhil Under CodeX Devs
