import { Command, CommandContext } from '#core/Command';
import {
  ActionRowBuilder,
  AnyComponentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  StringSelectMenuBuilder,
  type Client,
  type Message,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ThumbnailBuilder
} from "discord.js";
import { PlayerManager } from '#audio/PlayerManager';
import { db } from '#database/Database';
import { config } from "#config/config";
import { logger } from "#utils/logger";
import { buildContainer, buildError, buildSuccess } from '#ui/Theme';
import { componentCollectorSource } from '#ui/Components';
import emoji from '#config/emoji';
import phrases from "#utils/phrases";
import musicSource from '#config/sources';
import { i18n } from "#utils/i18n";

const TRACKS_PER_PAGE =  5;

class HistoryCommand extends Command {
  constructor() {
    super({
      name: "history",
      description: "View your personal listening history and re-play songs with interactive controls",
      usage: "history [page]",
      aliases: ["hist"],
      category: "music",
      examples: [
        "history",
        "history 2",
        "hist 3"
      ],
      cooldown: 5,
      slash: {
        enabled: true,
        autoDefer: true,
        data: {
          name: "history",
          description: "View your personal listening history and re-play songs",
          options: [{
            name: "page",
            description: i18n.cmd("The page number of your history to view."),
            type: 4,
            required: false,
            min_value: 1,
            autocomplete: true
          }]
        },
      },
    });
  }

  async execute(ctx: CommandContext) {
    const { client, message, interaction, player, pm, args = [] } = ctx;
    const context = interaction || message;
    const page = interaction ? (interaction.options.getInteger("page") || 1) : (args[0] ? parseInt(args[0], 10) : 1);
    const userId = (context.user || context.author).id;
    return this._handleHistory(client, userId, isNaN(page) || page < 1 ? 1 : page, context);
  }

  async slashExecute(ctx: CommandContext) {
    return this.execute(ctx);
  }

  async _handleHistory(client: any, userId: any, page: any, context: CommandContext) {
    let history = db.user.getHistory(userId);

    if (!history || history.length === 0) {
      return this._reply(context, this._createErrorContainer(phrases.get("historyEmpty")));
    }

    const validHistory = history.filter((track: any) => track && track.title && track.identifier);
    if (validHistory.length   !==history.length) {
      const removedCount = history.length - validHistory.length;
      db.user.setUserHistory(userId, validHistory);
      history = validHistory;
      logger.info('HistoryCommand', `Cleaned up ${removedCount} invalid entries for user ${userId}`);
    }

    if (history.length ===0) {
      return this._reply(context, this._createErrorContainer(phrases.get("historyEmpty")));
    }

    const maxPages = Math.ceil(history.length / TRACKS_PER_PAGE) || 1;
    page = Math.max(1, Math.min(page, maxPages));

    const container = this._buildHistoryContainer(history, page, maxPages, userId, context!.guild!.id);
    const message = await this._reply(context, container);

    if (message) {
      this._setupCollector(message, client, context);
    }
  }
  _buildHistoryContainer(history: any, page: any, maxPages: any, userId: any, guildId: any) {
    const startIndex = (page - 1) * TRACKS_PER_PAGE;
    const paginatedTracks = history.slice(startIndex, startIndex + TRACKS_PER_PAGE);
    const premiumStatus = this._getPremiumStatus(guildId, userId);

    const container = buildContainer({
      title: "`### Your Listening History`",
      content: i18n.cmd("**Page {page} of {max}**\n*{total}*", { page, max: maxPages, total: i18n.cmd("{count} total tracks in your history", { count: history.length }) }),
      thumbnail: config.assets.defaultTrackArtwork,
      icon: "ℹ️"
    });

    if (paginatedTracks.length > 0) {
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

      paginatedTracks.forEach((track: any, index: any) => {
        const trueIndex = startIndex + index;
        const title = track.title || i18n.cmd('Unknown Track');
        const author = track.author || i18n.cmd('Unknown');
        const duration = this._formatDuration(track.duration);

        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`**${trueIndex + 1}. [${title}](${track.uri || '#'})**`),
              new TextDisplayBuilder().setContent(`*by ${author} | ${duration}*`)
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(track.artworkUrl || config.assets.defaultTrackArtwork))
        );
      });

      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));

      if (premiumStatus.hasPremium) {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(i18n.cmd("*Premium Queue: Up to {count} songs*", { count: premiumStatus.maxSongs }))
        );
      } else {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(i18n.cmd("*Free Queue: Up to {count} songs | Upgrade for {premium} songs*", { count: premiumStatus.maxSongs, premium: config.queue.maxSongs.premium }))
        );
      }

      const selectMenu = this._createSelectMenu(paginatedTracks, startIndex, userId);
      if (selectMenu.components.length > 0) {
        container.addActionRowComponents(selectMenu as any);
      }

      if (maxPages > 1) {
        container.addActionRowComponents(this._createPaginationButtons(page, maxPages, userId));
      }
    } else {
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent("*No history found on this page.*")
      );
    }

    return container;
  }

  _createSelectMenu(tracksOnPage: any, startIndex: any, userId: any) {
    if (tracksOnPage.length ===0) return new ActionRowBuilder<StringSelectMenuBuilder>();

    const validTracks = tracksOnPage.filter((track: any) => track && track.title && track.identifier);
    if (validTracks.length ===0) return new ActionRowBuilder<StringSelectMenuBuilder>();

    const options = validTracks.map((track: any, index: any) => {
      const originalIndex = tracksOnPage.findIndex((t: any) => t && t.identifier ===track.identifier);
      return {
        label: (track.title || i18n.cmd('Unknown Track')).substring(0, 100),
        value: `${startIndex + originalIndex}`,
        description: i18n.cmd('by {author}', { author: track.author || i18n.cmd('Unknown') }).substring(0, 100),
      };
    });

    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`hist_play_${userId}`)
        .setPlaceholder(i18n.cmd("Select up to 10 songs to add to queue"))
        .setMinValues(1)
        .setMaxValues(Math.min(options.length, 10))
        .addOptions(options)
    );
  }

  _createPaginationButtons(currentPage: any, maxPages: any, userId: any) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`hist_page_${currentPage - 1}_${userId}`)
        .setLabel(i18n.cmd("Previous"))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage ===1),
      new ButtonBuilder()
        .setCustomId('hist_info_button')
        .setLabel(`Page ${currentPage} of ${maxPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`hist_page_${currentPage + 1}_${userId}`)
        .setLabel(i18n.cmd("Next"))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= maxPages)
    );
  }

  async _setupCollector(message: Message, client: any, context: CommandContext) {
    const userId = context.user?.id || context.author?.id;
    const guildId = context!.guild!.id;

    // Only claim history components (`hist_*`); otherwise this collector would
    // swallow every button the user presses on any message ending in their id.
    const filter = (i: any) => i.user.id === userId && i.customId.startsWith("hist_");
    const collector = componentCollectorSource(message).createMessageComponentCollector({ filter, time: 300000 });

    let currentPage = context.options?.getInteger("page") || (context.args?.[0] ? parseInt(context.args[0]) : 1) || 1;

    collector.on("collect", async (interaction: any) => {
      const parts = interaction.customId.split('_');
      const action = parts[1];

      await interaction.deferUpdate();

      if (action ==='page') {
        currentPage = parseInt(parts[2], 10);
        let history = db.user.getHistory(userId);

        const validHistory = history.filter((track: any) => track && track.title && track.identifier);
        if (validHistory.length   !==history.length) {
          db.user.setUserHistory(userId, validHistory);
          history = validHistory;
        }

        const maxPages = Math.ceil(history.length / TRACKS_PER_PAGE) || 1;
        const newContainer = this._buildHistoryContainer(history, currentPage, maxPages, userId, guildId);
        await interaction.editReply({ components: [newContainer] });

      } else if (action ==='play' && interaction.isStringSelectMenu()) {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
          const errC = buildContainer({
      title: `\`### ⚠️ **${i18n.translateTitle("Voice Channel Required")}**\``,
      content: i18n.cmd("You must be in a voice channel to play music."),
      thumbnail: config.assets.defaultTrackArtwork,
      icon: emoji.get("info") || "ℹ️"
    });
          await interaction.followUp({ components: [errC], flags: MessageFlags.IsComponentsV2, ephemeral: true });
          return;
        }

        const permissions = voiceChannel.permissionsFor(interaction.guild.members.me);
        if (!permissions.has(['Connect', 'Speak'])) {
          const errC = buildContainer({
      title: "`### ⚠️ **Permission Missing**`",
      content: "I need permission to join and speak in your voice channel.",
      thumbnail: config.assets.defaultTrackArtwork,
      icon: emoji.get("info") || "ℹ️"
    });
          await interaction.followUp({ components: [errC], flags: MessageFlags.IsComponentsV2, ephemeral: true });
          return;
        }

        const player = client.music.getPlayer(guildId) || (await client.music.createPlayer({
          guildId: guildId,
          textChannelId: interaction.channel.id,
          voiceChannelId: voiceChannel.id
        }));

        const pm = new PlayerManager(player);
        if (!pm.isConnected) await pm.connect();

        const history = db.user.getHistory(userId);
        const indices = interaction.values.map((v: any) => parseInt(v, 10));
        const tracksToPlay = indices.map((i: any) => history[i]).filter(Boolean);

        const currentQueueSize = pm.queue.tracks.length;
        const queueLimitCheck = this._checkQueueLimit(currentQueueSize, tracksToPlay.length, guildId, userId);

        if (!queueLimitCheck.allowed) {
          const errC = buildContainer({
      title: "`### ⚠️ **Queue Limit Error**`",
      content: queueLimitCheck.message,
      thumbnail: config.assets.defaultTrackArtwork,
      icon: emoji.get("info") || "ℹ️"
    });
          await interaction.followUp({ components: [errC], flags: MessageFlags.IsComponentsV2, ephemeral: true });
          return;
        }

        const tracksToAdd = queueLimitCheck.canAddAll ? tracksToPlay : tracksToPlay.slice(0, queueLimitCheck.tracksToAdd);
        let addedCount = 0;

        for (const track of tracksToAdd) {
          try {
            const query = track.uri || track.title;
            let searchResult = await client.music.search(query, {
              requester: interaction.user,
              source: musicSource.PRIMARY_PREFIX.replace(':', '')
            });
            if (!searchResult?.tracks?.length) {
              searchResult = await client.music.search(query, {
                requester: interaction.user,
                source: 'ytsearch'
              });
            }
            if (searchResult?.tracks?.length > 0) {
              await pm.addTracks(searchResult.tracks[0]);
              addedCount++;
            }
          } catch (error) {
            logger.error('HistoryCommand', `Failed to add track ${track.title} to queue`, error);
          }
        }

        if (!pm.isPlaying && pm.queue.tracks.length > 0) {
          await pm.play();
        }

        let responseMessage = i18n.cmd("Added **{added}** of **{total}** selected songs to the queue.", { added: addedCount, total: tracksToPlay.length });

        if (!queueLimitCheck.canAddAll) {
          const premiumStatus = queueLimitCheck.premiumStatus;
          const limitWarning = premiumStatus!.hasPremium
            ? i18n.cmd("\n*Premium queue limit reached*")
            : i18n.cmd("\n*Free tier limit reached - upgrade for {count} songs*", { count: config.queue.maxSongs.premium });
          responseMessage += limitWarning;
        }

        await interaction.followUp({
          content: responseMessage,
          ephemeral: true
        });
      }
    });

    collector.on("end", async () => {
      try {
        const currentMessage = await message.fetch().catch(() => null);
        if (!currentMessage || currentMessage.components.length ===0) return;

        const originalContainer: any = currentMessage.components[0];
        const newContainer = new ContainerBuilder();

        if (originalContainer.components) {
          for (const component of originalContainer.components) {
            if (component.type ===1) {
              const disabledRow = new ActionRowBuilder<AnyComponentBuilder>();
              for (const child of component.components) {
                if (child.type ===2) {
                  const disabledButton = new ButtonBuilder()
                    .setCustomId(child.custom_id || 'disabled')
                    .setLabel(child.label || 'Button')
                    .setStyle(child.style || ButtonStyle.Secondary)
                    .setDisabled(true);
                  disabledRow.addComponents(disabledButton);
                } else if (child.type ===3) {
                  const disabledSelect = StringSelectMenuBuilder.from(child).setDisabled(true);
                  disabledRow.addComponents(disabledSelect);
                }
              }
              newContainer.addActionRowComponents(disabledRow as any);
            } else {
              newContainer.components.push(component);
            }
          }
        }

        await currentMessage.edit({ components: [newContainer] });
      } catch (error) {
        if ((error as any).code !== 10008) {
          logger.error("HistoryCommand", "Failed to disable history components:", error);
        }
      }
    });
  }

  _checkQueueLimit(currentQueueSize: any, tracksToAdd: any, guildId: any, userId: any) {
    const premiumStatus = this._getPremiumStatus(guildId, userId);
    const availableSlots = premiumStatus.maxSongs - currentQueueSize;

    if (availableSlots <= 0) {
      const limitMessage = premiumStatus.hasPremium
        ? i18n.cmd("Premium queue is full! You can have up to **{max}** songs in queue.", { max: premiumStatus.maxSongs })
        : i18n.cmd("Free tier queue is full! You can have up to **{max}** songs in queue.\n*Upgrade to premium for up to **{premium}** songs!*", {
            max: premiumStatus.maxSongs,
            premium: config.queue.maxSongs.premium,
          });

      return {
        allowed: false,
        message: limitMessage,
        currentSize: currentQueueSize,
        maxSize: premiumStatus.maxSongs,
        isPremium: premiumStatus.hasPremium
      };
    }

    const canAddAll = tracksToAdd <= availableSlots;
    const tracksToAddActual = canAddAll ? tracksToAdd : availableSlots;

    return {
      allowed: true,
      canAddAll,
      tracksToAdd: tracksToAddActual,
      availableSlots,
      premiumStatus
    };
  }

  _getPremiumStatus(guildId: any, userId: any) {
    const premiumStatus = db.hasAnyPremium(userId, guildId);
    return {
      hasPremium: !!premiumStatus,
      type: premiumStatus ? premiumStatus.type : 'free',
      maxSongs: premiumStatus ? config.queue.maxSongs.premium : config.queue.maxSongs.free
    };
  }

  _createErrorContainer(message: string) {
    return buildError(message);
  }

  _formatDuration(ms: any) {
    if (!ms || ms < 0) return "Live";
    const seconds = Math.floor((ms / 1000) % 60).toString().padStart(2, "0");
    const minutes = Math.floor((ms / (1000 * 60)) % 60).toString().padStart(2, "0");
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours > 0) return `${hours}:${minutes}:${seconds}`;
    return `${minutes}:${seconds}`;
  }

  async _reply(context: CommandContext, container: any) {
    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true,
    };

    try {
      if (context.replied || context.deferred) {
        return context.editReply!(payload);
      } else if (context.reply) {
        return context.reply(payload);
      } else {
        return context.channel!.send(payload);
      }
    } catch (error) {
      logger.error('HistoryCommand', 'Error in _reply', error);
      return null;
    }
  }
}

export default new HistoryCommand();

// Made by Nikhil Under CodeX Devs
