import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  StringSelectMenuBuilder,
} from "discord.js";
import { Command, CommandContext } from '#core/Command';
import { PlayerManager } from '#audio/PlayerManager';
import { db } from '#database/Database';
import { config } from "#config/config";
import { logger } from "#utils/logger";
import { buildContainer, buildError, buildSuccess } from '#ui/Theme';
import { componentCollectorSource } from '#ui/Components';
import AutoplayEngine from '#audio/AutoplayEngine';
import emoji from "#config/emoji";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";

let autoplayEngine: AutoplayEngine | null = null;
function getAutoplayEngine(client: any): AutoplayEngine {
  if (!autoplayEngine) autoplayEngine = new AutoplayEngine(client);
  return autoplayEngine;
}

class RecommendationsCommand extends Command {
  constructor() {
    super({
      name: "recommendations",
      description: "Get song recommendations based on what's currently playing",
      usage: "recommendations",
      aliases: ["rec", "recommend", "similar"],
      category: "music",
      examples: ["recommendations", "rec", "similar"],
      cooldown: 5,
      access: {
        voice: true,
        player: true,
        playing: true,
      },
      slash: {
        enabled: true,
        autoDefer: true,
        data: {
          name: "recommendations",
          description: "Get song recommendations based on what is currently playing",
        },
      },
    });
  }

  async execute(ctx: CommandContext) {
    const { client, message, interaction, player, pm, args = [] } = ctx;
    const context = interaction || message;
    return this._handleRecommendations(client, context.guild.id, context);
  }

  async slashExecute(ctx: CommandContext) {
    return this.execute(ctx);
  }

  async _handleRecommendations(client: any, guildId: any, context: any) {
    const player = client.music?.getPlayer(guildId);

    if (!player || !player.queue.current) {
      return this._reply(context, buildError(phrases.get("noTrackPlaying"), "Player Error"));
    }

    const currentTrack = player.queue.current;
    const loadingContainer = buildContainer({
      title: i18n.translateTitle("Finding Recommendations"),
      content: i18n.cmd('### 🔄 **Scanning Recommendation Engine**\n└─ Finding songs similar to **"{title}"**...', { title: currentTrack.info.title }),
      thumbnail: currentTrack.info.artworkUrl || config.assets.defaultTrackArtwork,
      icon: emoji.get("music") || "🎵"
    });

    const loadingMessage = await this._reply(context, loadingContainer);

    try {
      const engine = getAutoplayEngine(client);
      const recommendations = await engine.getRecommendations(player, currentTrack, 6);

      if (!recommendations || recommendations.length === 0) {
        const noResultsContainer = buildError(i18n.cmd('No recommendations found for "{title}" by {author}.', { title: currentTrack.info.title, author: currentTrack.info.author }), "No Results");
        return this._updateMessage(loadingMessage, noResultsContainer, context);
      }

      const userId = context.user?.id || context.author?.id;
      const container = this._buildRecommendationsContainer(currentTrack, recommendations, guildId, userId);
      const message = await this._updateMessage(loadingMessage, container, context);

      if (message) {
        this._setupCollector(message, client, context, player, recommendations);
      }
    } catch (error) {
      logger.error("RecommendationsCommand", `Error fetching recommendations: ${(error as Error).message}`, error);
      const errorContainer = buildError(i18n.cmd("Failed to fetch recommendations. Please try again later."), "Recommendation Error");
      await this._updateMessage(loadingMessage, errorContainer, context);
    }
  }

  _buildRecommendationsContainer(currentTrack: any, recommendations: any, guildId: any, userId: any) {
    const premiumStatus = this._getPremiumStatus(guildId, userId);

    let content = i18n.cmd("### 🎵 **Recommended Tracks**\n") +
      i18n.cmd('└─ Based on **"{title}"** by **{author}**\n\n', { title: currentTrack.info.title, author: currentTrack.info.author });

    recommendations.forEach((rec: any, idx: any) => {
      content += `├─ **${idx + 1}.** ${rec.name} — *${rec.artist}*\n`;
    });

    content += i18n.cmd("\n*Select up to {count} songs below to queue them instantly.*", { count: Math.min(recommendations.length, 6) });

    const container = buildContainer({
      title: i18n.translateTitle("Music Recommendations"),
      content: content,
      thumbnail: currentTrack.info.artworkUrl || config.assets.defaultTrackArtwork,
      icon: emoji.get("music") || "🎵"
    });

    const selectMenu = this._createSelectMenu(recommendations, userId);
    if (selectMenu) {
      container.addActionRowComponents(selectMenu);
    }

    return container;
  }

  _getPremiumStatus(guildId: any, userId: any) {
    const premiumStatus = db.hasAnyPremium(userId, guildId);
    return {
      hasPremium: !!premiumStatus,
      type: premiumStatus ? premiumStatus.type : 'free',
      maxSongs: premiumStatus ? config.queue.maxSongs.premium : config.queue.maxSongs.free
    };
  }

  _createSelectMenu(recommendations: any, userId: any) {
    if (!recommendations || recommendations.length === 0) return null;

    const maxSelections = Math.min(recommendations.length, 6);
    const options = recommendations.map((rec: any) => ({
      label: rec.name.substring(0, 95),
      value: `rec_idx_${rec.index}`,
      description: `by ${rec.artist}`.substring(0, 95),
      emoji: "🎵"
    }));

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rec_select_${userId}`)
        .setPlaceholder(i18n.cmd('Select up to {max} songs to add to queue', { max: maxSelections }))
        .setMinValues(1)
        .setMaxValues(maxSelections)
        .addOptions(options)
    );
  }

  async _setupCollector(message: any, client: any, context: any, player: any, recommendations: any) {
    const userId = context.user?.id || context.author?.id;

    const filter = (i: any) => i.customId === `rec_select_${userId}` && i.user.id === userId;
    const collector = componentCollectorSource(message).createMessageComponentCollector({ filter, time: 120_000 });

    collector.on("collect", async (interaction: any) => {
      try {
        await interaction.deferUpdate();

        const selectedIndices = interaction.values.map((val: any) => parseInt(val.replace("rec_idx_", "")));
        const selectedRecs = recommendations.filter((r: any) => selectedIndices.includes(r.index));

        if (!selectedRecs.length) return;

        const pm = new PlayerManager(player);
        const addedNames = [];

        for (const rec of selectedRecs) {
          try {
            let searchResult;
            if (rec.trackInfo) {
              searchResult = { tracks: [rec.trackInfo] };
            } else {
              searchResult = await client.music.search(`${rec.artist} ${rec.name}`, { source: "spsearch" });
            }

            if (searchResult?.tracks?.length > 0) {
              await pm.addTracks(searchResult.tracks[0]);
              addedNames.push(`"${rec.name}" by ${rec.artist}`);
            }
          } catch (e) {
            logger.warn("RecommendationsCommand", `Failed to add track: ${rec.name}`, e);
          }
        }

        if (addedNames.length > 0) {
          let successContent = `### 🎶 **Tracks Added to Queue**\n` +
            `└─ Added **${addedNames.length}** recommended song${addedNames.length > 1 ? 's' : ''} to queue!\n\n`;

          addedNames.forEach((name, i) => {
            const isLast = i === addedNames.length - 1;
            successContent += `${isLast ? '└─' : '├─'} **${i + 1}.** ${name}\n`;
          });

          const successContainer = buildContainer({
            title: i18n.translateTitle("Recommendations Added"),
            content: successContent,
            thumbnail: config.assets.defaultThumbnail,
            icon: emoji.get("check") || "✅"
          });

          await interaction.editReply({
            components: [successContainer],
            flags: MessageFlags.IsComponentsV2
          });

          if (!player.playing && !player.paused && player.queue.tracks.length > 0) {
            await player.play().catch(() => {});
          }
        }
      } catch (err) {
        logger.error("RecommendationsCommand", "Error in recommendations collector:", err);
      }
    });
  }

  async _reply(context: any, container: any) {
    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true,
    };
    try {
      if (context.editReply && (context.deferred || context.replied)) {
        return await context.editReply(payload);
      }
      return await (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload);
    } catch (e) {
      logger.error("RecommendationsCommand", "Failed to reply in Recommendations command:", e);
      return null;
    }
  }

  async _updateMessage(message: any, container: any, context: any) {
    try {
      if (context.replied || context.deferred) {
        return await context.editReply({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
      } else {
        return await message.edit({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
      }
    } catch (error) {
      logger.error("RecommendationsCommand", "Failed to update recommendations message:", error);
      return message;
    }
  }
}

export default new RecommendationsCommand();

// Made by Nikhil Under CodeX Devs
