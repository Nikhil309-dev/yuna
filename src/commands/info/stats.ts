import { Command, CommandContext } from '#core/Command';
import {
  AttachmentBuilder,
  MessageFlags,
  ActionRowBuilder,
  MessageActionRowComponentBuilder,
  StringSelectMenuBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";
import type { Client, Message } from "discord.js";
import { db } from "#database/Database";
import emoji from "#config/emoji";
import StatsCard from "#ui/cards/StatsCard";
import { buildContainer, buildError } from "#ui/Theme";
import { componentCollectorSource } from "#ui/Components";
import { i18n } from "#utils/i18n";

class StatsCommand extends Command {
  constructor() {
    super({
      name: "stats",
      description: "View your listening stats, top artists, top tracks, and streaks",
      usage: "stats [@user] [--period week|month|year|all]",
      aliases: ["mystats", "listening", "wrapped"],
      category: "info",
      examples: ["stats", "stats @user", "stats --period month"],
      cooldown: 5,
      slash: {
        enabled: true,
        data: {
          name: "stats",
          description: "View your listening stats and music profile",
          options: [
            {
              name: "user",
              description: "User to view stats for",
              type: 6,
              required: false,
            },
            {
              name: "period",
              description: i18n.cmd("Time period to view stats for"),
              type: 3,
              required: false,
              choices: [
                { name: i18n.cmd("Today"), value: "today" },
                { name: i18n.cmd("This Week"), value: "week" },
                { name: i18n.cmd("This Month"), value: "month" },
                { name: i18n.cmd("This Year"), value: "year" },
                { name: i18n.cmd("All Time"), value: "all" },
              ],
            },
          ],
        },
      },
    });
  }

  async execute({ client, message, args }: any) {
    const mentionedUser = message.mentions.users.first();
    const targetUser = mentionedUser || message.author;

    let period = "all";
    const periodArg = args.find((a: any) => a.startsWith("--period"));
    if (periodArg) {
      const idx = args.indexOf(periodArg);
      period = args[idx + 1] || "all";
    }

    return this._handleStats(client, message, targetUser, period);
  }

  async slashExecute({ client, interaction }: any) {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const period = interaction.options.getString("period") || "all";
    return this._handleStats(client, interaction, targetUser, period);
  }

  async _handleStats(client: Client, context: CommandContext, targetUser: any, period: any) {
    const report = db.stats.getFullReport(targetUser.id, period);

    if (!report.aggregate || report.aggregate.total_tracks_played === 0) {
      const noDataContent =
        `**${i18n.cmd("No Listening Data")}**\n\n` +
        i18n.cmd("└─ **{emoji} User:** {user}", {
          emoji: emoji.get("info") || "ℹ️",
          user: targetUser.displayName || targetUser.username,
        }) + "\n" +
        i18n.cmd("└─ **{emoji} Status:** No tracks played yet", { emoji: emoji.get("music") || "🎵" }) + "\n\n" +
        i18n.cmd("*Start listening to music to build your stats!*");

      const container = buildContainer({
        title: i18n.translateTitle("Listening Stats"),
        content: noDataContent,
        icon: emoji.get("info") || "📊",
      });

      return this._reply(context, container);
    }

    try {
      const statsCard = new StatsCard();
      const buffer = await statsCard.createStatsCard(targetUser, report);
      const attachment = new AttachmentBuilder(buffer, { name: "yuna-stats.png" });

      const container = this._buildStatsContainer(targetUser, report, period);

      const payload = {
        files: [attachment],
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        fetchReply: true,
      };

      let message;
      if (context.replied || context.deferred) {
        message = await context.followUp!(payload);
      } else {
        message = await context.reply!(payload);
      }

      if (message) {
        this._setupPeriodCollector(message, client, targetUser);
      }
    } catch (err: any) {
      const container = buildError(
        i18n.cmd("Failed to generate stats card: {error}", { error: err.message }),
        "Stats Error"
      );
      return this._reply(context, container);
    }
  }

  _buildStatsContainer(user: any, report: any, currentPeriod: any) {
    const container = new ContainerBuilder();

    const gallery = new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL("attachment://yuna-stats.png")
    );
    container.addMediaGalleryComponents(gallery);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    const stats = report.aggregate || {};
    const streak = stats.current_streak || 0;
    const longestStreak = stats.longest_streak || 0;

    const quickInfo =
      i18n.cmd("🔥 **Current Streak:** {streak} · ", { streak: i18n.cmd("{count} day(s)", { count: streak }) }) +
      i18n.cmd("**Longest:** {longest} · ", { longest: i18n.cmd("{count} day(s)", { count: longestStreak }) }) +
      i18n.cmd("**Since:** {date}", { date: stats.first_listen_date || 'N/A' });

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(quickInfo)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    const periodMenu = new StringSelectMenuBuilder()
      .setCustomId(`stats_period_${user.id}`)
      .setPlaceholder(i18n.cmd("Change time period..."))
      .addOptions([
        { label: i18n.cmd("Today"), value: "today", default: currentPeriod === "today" },
        { label: i18n.cmd("This Week"), value: "week", default: currentPeriod === "week" },
        { label: i18n.cmd("This Month"), value: "month", default: currentPeriod === "month" },
        { label: i18n.cmd("This Year"), value: "year", default: currentPeriod === "year" },
        { label: i18n.cmd("All Time"), value: "all", default: currentPeriod === "all" },
      ]);

    container.addActionRowComponents(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(periodMenu));

    return container;
  }

  _setupPeriodCollector(message: Message, client: Client, targetUser: any) {
    const filter = (i: any) => i.customId === `stats_period_${targetUser.id}`;
    const collector = componentCollectorSource(message).createMessageComponentCollector({
      filter,
      time: 120_000,
    });

    collector.on("collect", async (interaction: any) => {
      await interaction.deferUpdate();
      const newPeriod = interaction.values[0];
      const report = db.stats.getFullReport(targetUser.id, newPeriod);

      try {
        const statsCard = new StatsCard();
        const buffer = await statsCard.createStatsCard(targetUser, report);
        const attachment = new AttachmentBuilder(buffer, { name: "yuna-stats.png" });
        const container = this._buildStatsContainer(targetUser, report, newPeriod);

        await interaction.editReply({
          files: [attachment],
          components: [container],
        });
      } catch (err: any) {
        const errorContainer = buildError(
          i18n.cmd("Failed to generate stats card: {error}", { error: err.message }),
          "Stats Error"
        );
        await interaction.editReply({
          components: [errorContainer],
          files: []
        });
      }
    });
  }

  async _reply(context: CommandContext, container: any) {
    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    };
    if (context.replied || context.deferred) {
      return context.followUp!(payload);
    }
    return context.reply!(payload);
  }
}

export default new StatsCommand();

// Made by Nikhil Under CodeX Devs
