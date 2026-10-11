import { Command } from '#core/Command';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  StringSelectMenuBuilder,
  ComponentType,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder
} from "discord.js";
import { PlayerManager } from '#audio/PlayerManager';
import { db } from '#database/Database';
import { config } from "#config/config";
import { buildContainer, buildError, buildSuccess } from '#ui/Theme';
import { componentCollectorSource } from '#ui/Components';
import { i18n } from '#utils/i18n.js';

const tr = (key: string, replacements?: Record<string, any>) => i18n.tr(key, replacements);
import emoji from "#config/emoji";
import phrases from "#utils/phrases";
import { formatDuration } from '#ui/Formatters';
import { logger } from '#utils/logger';

const TRACKS_PER_PAGE = 8;

class QueueCommand extends Command {
  constructor() {
    super({
      name: "queue",
      description: "Interactive live music queue dashboard with jump, shuffle, and playlist sync",
      usage: "queue [page]",
      aliases: ["q"],
      category: "music",
      cooldown: 3,
      access: {
        voice: false,
        player: true
      },
      slash: {
        enabled: true,
        autoDefer: true,
        data: {
          name: "queue",
          description: "Interactive live music queue dashboard",
          options: [
            {
              name: "page",
              description: "Page number to view",
              type: 4,
              required: false,
              min_value: 1
            }
          ]
        }
      }
    });
  }

  async execute(ctx: any) {
    const { client, interaction, message, args, guild } = ctx;
    const pageArg = args?.[0] ? parseInt(args[0], 10) : (interaction?.options?.getInteger('page') || 1);
    const page = isNaN(pageArg) || pageArg < 1 ? 1 : pageArg;
    const context = interaction || message;

    return this._handleQueue(client, guild.id, context, page);
  }

  async _handleQueue(client: any, guildId: any, context: any, page: any) {
    const player = client.audio?.getPlayer(guildId) || client.music?.getPlayer(guildId);

    if (!player || !player.queue?.current) {
      const err = buildError(phrases.get("noTrackPlaying") || "No track is currently playing.");
      return this._reply(context, err);
    }

    const userId = context.user?.id || context.author?.id;
    const container = this._buildQueueContainer(player, page, guildId, userId);

    const replyMsg = await this._reply(context, container);
    if (replyMsg) {
      this._setupCollector(replyMsg, client, guildId, page, userId);
    }
  }

  _buildQueueContainer(player: any, page: any, guildId: any, userId: any) {
    const current = player.queue.current;
    const tracks = player.queue.tracks || [];
    const queueStatus = player.paused ? "⏸️ Paused" : "▶️ Playing";
    const totalDuration = tracks.reduce((acc: any,  t: any) => acc + (t.info?.duration || 0), current.info?.duration || 0);
    const maxPages = Math.max(1, Math.ceil(tracks.length / TRACKS_PER_PAGE));
    const currentPage = Math.min(page, maxPages);

    const container = buildContainer({ image: undefined,
      title: tr("title.queueDashboard"),
      content: i18n.cmd("### 🎵 Now Playing\n[**{title}**]({uri})\n└ **{artistLabel}:** {author} • **{durationLabel}:** `{duration}`", { title: current.info.title, uri: current.info.uri, artistLabel: i18n.cmd("Artist"), author: current.info.author, durationLabel: i18n.cmd("Duration"), duration: formatDuration(current.info.duration) }),
      thumbnail: current.info.artworkUrl || config.assets.defaultTrackArtwork,
      icon: emoji.get("music") || "🌸"
    });

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const summaryText = `📊 **Status:** ${queueStatus} | **Queue:** \`${tracks.length}\` tracks (\`${formatDuration(totalDuration)}\`) | **Page:** \`${currentPage}/${maxPages}\``;
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(summaryText)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    if (tracks.length > 0) {
      const startIndex = (currentPage - 1) * TRACKS_PER_PAGE;
      const paginatedTracks = tracks.slice(startIndex, startIndex + TRACKS_PER_PAGE);

      paginatedTracks.forEach((track: any,  index: any) => {
        const trueIndex = startIndex + index;
        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `\`${trueIndex + 1}.\` [**${track.info.title}**](${track.info.uri})\n└ *${track.info.author} • \`${formatDuration(track.info.duration)}\` • by <@${track.requester?.id || userId}>*`
              )
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(
                track.info.artworkUrl || config.assets.defaultTrackArtwork
              )
            )
        );
      });

      const jumpMenu = this._createJumpMenu(paginatedTracks, startIndex, guildId);
      if (jumpMenu) {
        container.addActionRowComponents(jumpMenu);
      }

      container.addActionRowComponents(
        this._createPaginationRow(currentPage, maxPages, guildId)
      );

      container.addActionRowComponents(
        this._createQuickControlsRow(guildId)
      );
    } else {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(tr("queue.noMoreTracks"))
      );
    }

    return container;
  }

  _createJumpMenu(tracksOnPage: any, startIndex: any, guildId: any) {
    if (!tracksOnPage || tracksOnPage.length === 0) return null;
    const options = tracksOnPage.map((track: any,  index: any) => ({
      label: `${startIndex + index + 1}. ${(track.info.title || 'Unknown').substring(0, 85)}`,
      value: `${startIndex + index}`,
      description: `by ${(track.info.author || 'Artist').substring(0, 50)} (${formatDuration(track.info.duration)})`,
      emoji: '⏩'
    }));

    return new ActionRowBuilder<any>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`q_jump_${guildId}`)
        .setPlaceholder(tr("queue.jumpPlaceholder"))
        .addOptions(options)
    );
  }

  _createPaginationRow(currentPage: any, maxPages: any, guildId: any) {
    return new ActionRowBuilder<any>().addComponents(
      new ButtonBuilder()
        .setCustomId(`q_page_${currentPage - 1}_${guildId}`)
        .setLabel(tr("queue.prev"))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage <= 1),
      new ButtonBuilder()
        .setCustomId(`q_info_${guildId}`)
        .setLabel(`${currentPage} / ${maxPages}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`q_page_${currentPage + 1}_${guildId}`)
        .setLabel(tr("queue.next"))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= maxPages)
    );
  }

  _createQuickControlsRow(guildId: any) {
    return new ActionRowBuilder<any>().addComponents(
      new ButtonBuilder()
        .setCustomId(`q_shuffle_${guildId}`)
        .setLabel(tr("queue.shuffle"))
        .setEmoji("🔀")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`q_savepl_${guildId}`)
        .setLabel(tr("queue.savePlaylist"))
        .setEmoji("💾")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`q_clear_${guildId}`)
        .setLabel(tr("queue.clear"))
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger)
    );
  }

  async _setupCollector(message: any, client: any, guildId: any, initialPage: any, userId: any) {
    const filter = (i: any) => i.customId.startsWith("q_") && i.customId.endsWith(guildId);
    const collector = componentCollectorSource(message).createMessageComponentCollector({
      filter,
      time: 180_000,
    });

    let currentPage = initialPage;

    collector.on("collect", async (interaction: any) => {
      const player = client.audio?.getPlayer(guildId) || client.music?.getPlayer(guildId);
      if (!player) {
        collector.stop();
        return;
      }

      const pm = new PlayerManager(player);
      const parts = interaction.customId.split("_");
      const action = parts[1];

      if (action === "page") {
        await interaction.deferUpdate().catch(() => {});
        currentPage = parseInt(parts[2], 10);
        const newContainer = this._buildQueueContainer(player, currentPage, guildId, interaction.user.id);
        await interaction.editReply({ components: [newContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      } else if (action === "jump" && interaction.isStringSelectMenu()) {
        await interaction.deferUpdate().catch(() => {});
        const targetIndex = parseInt(interaction.values[0], 10);
        if (!isNaN(targetIndex) && targetIndex >= 0 && targetIndex < player.queue.tracks.length) {

          if (targetIndex > 0) {
            player.queue.tracks.splice(0, targetIndex);
          }
          await pm.skip();
        }
        const newContainer = this._buildQueueContainer(player, 1, guildId, interaction.user.id);
        await interaction.editReply({ components: [newContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      } else if (action === "shuffle") {
        await interaction.deferUpdate().catch(() => {});
        await pm.shuffleQueue();
        const newContainer = this._buildQueueContainer(player, 1, guildId, interaction.user.id);
        await interaction.editReply({ components: [newContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      } else if (action === "clear") {
        await interaction.deferUpdate().catch(() => {});
        await pm.queue.clear();
        const newContainer = this._buildQueueContainer(player, 1, guildId, interaction.user.id);
        await interaction.editReply({ components: [newContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      } else if (action === "savepl") {
        const plName = i18n.cmd("Queue-{date}", { date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) });
        const allTracks = [player.queue.current, ...player.queue.tracks].filter(Boolean);

        try {
          const playlist = db.playlists.createPlaylist(interaction.user.id, plName, i18n.cmd("Saved from live queue on {date}", { date: new Date().toLocaleString() }));
          for (const t of allTracks) {
            db.playlists.addTrackToPlaylist(playlist.id, interaction.user.id, t.info || t);
          }
          await (interaction.deferred || interaction.replied ? interaction.editReply.bind(interaction) : interaction.reply.bind(interaction))({
            components: [buildSuccess(i18n.cmd('Saved **{count}** tracks to playlist **"{name}"**! Use `/playlist load name:{name}` anytime.', { count: allTracks.length, name: plName }), "Playlist Created")],
            flags: MessageFlags.IsComponentsV2,
            ephemeral: true
          }).catch(() => {});
        } catch (err: any) {
          logger.error('QueueSave', 'Failed to save queue as playlist:', err);
          await (interaction.deferred || interaction.replied ? interaction.editReply.bind(interaction) : interaction.reply.bind(interaction))({
            components: [buildError(`Failed to save playlist: ${err.message}`)],
            flags: MessageFlags.IsComponentsV2,
            ephemeral: true
          }).catch(() => {});
        }
      }
    });

    collector.on("end", async () => {
      try {
        const currentMessage = await (message.fetchReply ? message.fetchReply() : message.fetch?.().catch(() => null));
        if (currentMessage) {
          const disabledComponents = this._disableAllRows(currentMessage.components);
          await currentMessage.edit({ components: disabledComponents, flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
      } catch (_) {}
    });
  }

  _disableAllRows(components: any) {
    if (!components) return [];
    return components.map((c: any) => {
      if (c.type === ComponentType.ActionRow) {
        return {
          ...c.toJSON(),
          components: c.components.map((sub: any) => ({ ...sub.toJSON(), disabled: true }))
        };
      }
      return c.toJSON ? c.toJSON() : c;
    });
  }

  async _reply(context: any, container: any) {
    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true
    };
    if (context.editReply && (context.deferred || context.replied)) {
      return await context.editReply(payload);
    } else if (context.reply) {
      return await (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload);
    }
    return null;
  }
}

export default new QueueCommand();

// Made by Nikhil Under CodeX Devs
