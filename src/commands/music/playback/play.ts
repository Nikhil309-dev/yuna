import { Command } from '#core/Command';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  MentionableSelectMenuBuilder,
  ComponentType,
} from "discord.js";
import { logger } from "#utils/logger";
import { buildContainer, buildError, buildSuccess } from '#ui/Theme';
import { componentCollectorSource } from '#ui/Components';
import { PlayerManager } from '#audio/PlayerManager';
import { db } from '#database/Database';
import { config } from "#config/config";
import emoji from "#config/emoji";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";
import musicSource from "#config/sources";

class PlayCommand extends Command {
  constructor() {
    super({
      name: "play",
      description: "Play music from YouTube, Spotify, or other platforms",
      usage: "play <query> [--src yt/am/sp/sc/dz]",
      aliases: ["p"],
      category: "music",
      examples: [
        "play never gonna give you up",
        "play rick astley --src yt",
        "play despacito --src sp",
        "play https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      ],
      cooldown: 3,
      access: {
        voice: true,
      },
      slash: {
        enabled: true,
        autoDefer: true,
        data: {
          name: "play",
          description: "Play music from YouTube, Spotify, or other platforms",
          options: [
            {
              name: "query",
              description: i18n.cmd("Song name, URL, or search query"),
              type: 3,
              required: true,
              autocomplete: true,
            },
            {
              name: "source",
              description: i18n.cmd("Music source to search from"),
              type: 3,
              required: false,
              choices: [
                { name: "Spotify", value: "sp" },
                { name: "YouTube", value: "yt" },
                { name: "Apple Music", value: "am" },
                { name: "SoundCloud", value: "sc" },
                { name: "Deezer", value: "dz" },
              ],
            },
            {
              name: "position",
              description: i18n.cmd("Position in queue to add the song (1 = next)"),
              type: 4,
              required: false,
              min_value: 1,
            },
            {
              name: "next",
              description: i18n.cmd("Add this song to the front of the queue (plays next)"),
              type: 5,
              required: false,
            },
          ],
        },
      },
    });
  }

  async autocomplete({  interaction, client  }: any) {
    try {
      const focusedOption = interaction.options.getFocused(true);

      if (focusedOption.name === "query") {
        const query = focusedOption.value;

        if (!query || query.length < 2) {
          return interaction.respond([]);
        }

        if (this._isUrl(query)) {
          return interaction.respond([
            {
              name: `URL: ${query.substring(0, 90)}${query.length > 90 ? "..." : ""}`,
              value: query,
            },
          ]);
        }

        const source = interaction.options.getString("source") || musicSource.PRIMARY_PREFIX.replace(":", "");
        const searchSource = this._normalizeSource(source);

        try {
          let searchResult;
          try {
            searchResult = await client.music.search(query, {
              source: searchSource,
              limit: 10,
            });
          } catch (searchError: any) {

            searchResult = null;
          }

          if ((!searchResult || !searchResult.tracks?.length) && searchSource !== "ytsearch") {
            searchResult = await client.music.search(query, { source: "ytsearch", limit: 10 });
          }

          if (!searchResult || !searchResult.tracks?.length) {
            return interaction.respond([
              { name: i18n.cmd('No results found for "{query}"', { query }), value: query },
            ]);
          }

          const suggestions = searchResult.tracks.slice(0, 25).map((track: any) => {
            const title =
              track.info.title.length > 80
                ? track.info.title.substring(0, 77) + "..."
                : track.info.title;
            const author = track.info.author || "Unknown";
            const duration = this._formatDuration(track.info.duration);

            return {
              name: `${title} - ${author} (${duration})`,
              value: track.info.uri || track.info.title,
            };
          });

          await interaction.respond(suggestions);
        } catch (searchError) {
          logger.error(
            "PlayCommand",
            "Autocomplete search error:",
            searchError,
          );
          return interaction.respond([
            { name: `Search "${query}"`, value: query },
          ]);
        }
      }
    } catch (error: any) {
      logger.error("PlayCommand", "Autocomplete error:", error);
      try {
        await interaction.respond([]);
      } catch (e) {}
    }
  }

  async execute(ctx: any) {
    const { client, message, interaction, pm, args = [] } = ctx;
    const context = interaction || message;
    try {
      let query, source, position;
      if (interaction) {
        query = interaction.options.getString("query");
        source = interaction.options.getString("source");
        position = interaction.options.getInteger("position");
        const next = interaction.options.getBoolean("next");
        if (next) position = 1;
      } else {
        if (args.length === 0) {
          return message.reply({
            components: [
              this._createErrorContainer(i18n.cmd("Please provide a song name or URL.")),
            ],
            flags: MessageFlags.IsComponentsV2,
          });
        }
        const parsed = this._parseFlags(args);
        query = parsed.query;
        source = parsed.source;
        position = parsed.position;
      }

      if (!query || !query.trim()) {
        const errorContainer = this._createErrorContainer(i18n.cmd("Please provide a song name or URL."));
        const payload = { components: [errorContainer], flags: MessageFlags.IsComponentsV2 };
        if (context.editReply && (context.deferred || context.replied)) {
          return await context.editReply(payload);
        }
        return await (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload);
      }

      const voiceChannel = context.member?.voice?.channel;
      if (!voiceChannel) {
        const errorContainer = this._createErrorContainer(i18n.cmd("You must be in a voice channel."));
        const payload = { components: [errorContainer], flags: MessageFlags.IsComponentsV2 };
        if (context.editReply && (context.deferred || context.replied)) {
          return await context.editReply(payload);
        }
        return await (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload);
      }

      const permissions = voiceChannel.permissionsFor(context.guild.members.me);
      if (!permissions.has(["Connect", "Speak"])) {
        const errorContainer = this._createErrorContainer(
          "I need permission to join and speak in your voice channel.",
        );
        const payload = { components: [errorContainer], flags: MessageFlags.IsComponentsV2 };
        if (context.editReply && (context.deferred || context.replied)) {
          return await context.editReply(payload);
        }
        return await (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload);
      }

      let loadingMessage;
      if (interaction) {
        loadingMessage = await interaction.editReply({
          components: [this._createLoadingContainer(query)],
          flags: MessageFlags.IsComponentsV2,
        });
      } else {
        loadingMessage = await message.reply({
          components: [this._createLoadingContainer(query)],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const activePlayer =
        client.music.getPlayer(context.guild.id) ||
        (await client.music.createPlayer({
          guildId: context.guild.id,
          textChannelId: context.channel.id,
          voiceChannelId: voiceChannel.id,
        }));

      const activePm = pm || new PlayerManager(activePlayer);

      const result = await this._handlePlayRequest({
        client,
        guildId: context.guild.id,
        query,
        source,
        requester: context.user || context.author,
        position,
        pm: activePm,
      });

      if (interaction) {
        await this._updateInteraction(
          interaction,
          result,
          context.guild.id,
          client,
          context.user.id,
        );
      } else {
        await this._updateMessage(
          loadingMessage,
          result,
          context.guild.id,
          client,
          context.author.id,
        );
      }
    } catch (error: any) {
      client.logger?.error(
        "PlayCommand",
        `Error in play command: ${error.message}`,
        error,
      );
      const errorContainer = this._createErrorContainer(
        i18n.cmd("An error occurred. Please try again."),
      );
      const payload = { components: [errorContainer], flags: MessageFlags.IsComponentsV2 };
      if (context.editReply && (context.deferred || context.replied)) {
        await context.editReply(payload).catch(() => {});
      } else if (context.reply) {
        await (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload).catch(() => {});
      }
    }
  }

  async slashExecute(ctx: any) {
    return this.execute(ctx);
  }

  async _handlePlayRequest({
    client,
    guildId,
    query,
    source,
    requester,
    position,
    pm,
  }: {
    client: any;
    guildId: any;
    query: any;
    source: any;
    requester: any;
    position: any;
    pm: any;
  }) {
    try {
      if (!pm.isConnected) {
        await pm.connect();
      }

      const finalquery = query;
      const options: { requester: any; source?: string } = { requester };

      if (!this._isUrl(query)) {
        options.source = this._normalizeSource(source);
      }

      let searchResult;
      try {
        searchResult = await client.music.search(finalquery, options);
      } catch (searchError: any) {

        logger.warn(
          "PlayCommand",
          `Search with source '${options.source}' failed: ${searchError?.message}`,
        );
        searchResult = null;
      }

      if ((!searchResult || !searchResult.tracks?.length) && !this._isUrl(query) && options.source !== "ytsearch") {
        options.source = "ytsearch";
        try {
          searchResult = await client.music.search(finalquery, options);
        } catch (fallbackError: any) {
          logger.error(
            "PlayCommand",
            `Fallback search 'ytsearch' failed: ${fallbackError?.message}`,
            fallbackError,
          );
          searchResult = null;
        }
      }

      if (!searchResult || !searchResult.tracks?.length) {
        return { success: false, message: phrases.get("noResults") };
      }

      if (searchResult.loadType === "playlist") {
        return this._handlePlaylist(
          pm,
          searchResult,
          position,
          guildId,
          requester.id,
        );
      } else {
        return this._handleSingleTrack(
          pm,
          searchResult.tracks[0],
          position,
          guildId,
          requester.id,
        );
      }
    } catch (error: any) {
      client.logger?.error(
        "PlayCommand",
        `Error handling play request: ${error.message}`,
        error,
      );
      return {
        success: false,
        message: phrases.get("errorGeneric"),
      };
    }
  }

  async _handleSingleTrack(playerManager: any, track: any, position: any, guildId: any, userId: any) {
    const wasEmpty =
      playerManager.queue.tracks.length === 0 && !playerManager.isPlaying;

    const currentQueueSize = wasEmpty ? 0 : playerManager.queue.tracks.length;
    const queueLimitCheck = this._checkQueueLimit(
      currentQueueSize,
      1,
      guildId,
      userId,
    );

    if (!queueLimitCheck.allowed) {
      return {
        success: false,
        message: queueLimitCheck.message,
        isPremiumLimit: true,
      };
    }

    await playerManager.addTracks(track, position ? position - 1 : undefined);

    if (wasEmpty) {
      await playerManager.play();
      return { success: true, type: "playing", track };
    } else {
      const queuePosition = position || playerManager.queue.tracks.length;
      const premiumStatus = this._getPremiumStatus(guildId, userId);
      return {
        success: true,
        type: "queued",
        track,
        queuePosition,
        showButtons: true,
        premiumStatus,
      };
    }
  }

  async _handlePlaylist(
    playerManager: any,
    searchResult: any,
    position: any,
    guildId: any,
    userId: any,
  ) {
    const tracks = searchResult.tracks;
    const wasEmpty =
      playerManager.queue.tracks.length === 0 && !playerManager.isPlaying;

    const currentQueueSize = wasEmpty ? 0 : playerManager.queue.tracks.length;
    const queueLimitCheck = this._checkQueueLimit(
      currentQueueSize,
      tracks.length,
      guildId,
      userId,
    );

    if (!queueLimitCheck.allowed) {
      return {
        success: false,
        message: queueLimitCheck.message,
        isPremiumLimit: true,
      };
    }

    if (!queueLimitCheck.canAddAll) {
      const tracksToAdd = tracks.slice(0, queueLimitCheck.tracksToAdd);
      await playerManager.addTracks(
        tracksToAdd,
        position ? position - 1 : undefined,
      );

      const premiumStatus = queueLimitCheck.premiumStatus;
      const limitWarning = premiumStatus!.hasPremium
        ? `Added ${tracksToAdd.length} of ${tracks.length} tracks`
        : `Added ${tracksToAdd.length} of ${tracks.length} tracks.`;

      if (wasEmpty && tracksToAdd.length > 0) {
        await playerManager.play();
        return {
          success: true,
          type: "playlist_playing_partial",
          playlist: searchResult.playlist,
          tracks: tracksToAdd,
          totalTracks: tracks.length,
          limitWarning,
          premiumStatus,
        };
      } else {
        return {
          success: true,
          type: "playlist_queued_partial",
          playlist: searchResult.playlist,
          tracks: tracksToAdd,
          totalTracks: tracks.length,
          limitWarning,
          premiumStatus,
        };
      }
    }

    await playerManager.addTracks(tracks, position ? position - 1 : undefined);

    if (wasEmpty) {
      await playerManager.play();
      return {
        success: true,
        type: "playlist_playing",
        playlist: searchResult.playlist,
        tracks: tracks,
      };
    } else {
      const premiumStatus = this._getPremiumStatus(guildId, userId);
      return {
        success: true,
        type: "playlist_queued",
        playlist: searchResult.playlist,
        tracks: tracks,
        premiumStatus,
      };
    }
  }

  _getPremiumStatus(guildId: any, userId: any) {
    const premiumStatus = db.hasAnyPremium(userId, guildId);
    return {
      hasPremium: !!premiumStatus,
      type: premiumStatus ? premiumStatus.type : "free",
      maxSongs: premiumStatus
        ? config.queue.maxSongs.premium
        : config.queue.maxSongs.free,
    };
  }

  _checkQueueLimit(currentQueueSize: any, tracksToAdd: any, guildId: any, userId: any) {
    const premiumStatus = this._getPremiumStatus(guildId, userId);
    const availableSlots = premiumStatus.maxSongs - currentQueueSize;

    if (availableSlots <= 0) {
      const limitMessage = premiumStatus.hasPremium
        ? i18n.cmd("Premium queue is full. You can have up to {max} songs in queue.", { max: premiumStatus.maxSongs })
        : i18n.cmd(
            "Free tier queue is full. You can have up to {max} songs in queue. Upgrade to premium for up to {premium} songs.",
            { max: premiumStatus.maxSongs, premium: config.queue.maxSongs.premium },
          );

      return {
        allowed: false,
        message: limitMessage,
        currentSize: currentQueueSize,
        maxSize: premiumStatus.maxSongs,
        isPremium: premiumStatus.hasPremium,
      };
    }

    const canAddAll = tracksToAdd <= availableSlots;
    const tracksToAddActual = canAddAll ? tracksToAdd : availableSlots;

    return {
      allowed: true,
      canAddAll,
      tracksToAdd: tracksToAddActual,
      availableSlots,
      premiumStatus,
    };
  }

  _createLoadingContainer(query: any) {const content =
      i18n.cmd("**Searching Music Libraries**") + "\n\n" +
      i18n.cmd("└─ **Query:-** `{query}`", { query }) + "\n" +
      `-# ${i18n.cmd("Connecting With Lavalink...")}`;

    return buildContainer({ image: undefined,
        title: "Fetching Track",
        content,
        thumbnail: config.assets.defaultTrackArtwork,
        icon: emoji.get("loading") || "⏳"
    });
  }

  _createErrorContainer(message: any, isPremiumLimit = false) {
    return buildError(message, isPremiumLimit ? "Queue Limit" : undefined);
  }

  _createSuccessContainer(result: any) {
    if (result.type === "playing" || result.type === "queued") {
      const { track, premiumStatus } = result;
      const isPlaying = result.type === "playing";
      const title = i18n.translateTitle(isPlaying ? "Now Playing" : "Added to Queue");

      let content =
        i18n.cmd("**Track Information**") + "\n\n" +
        i18n.cmd("└─ **Title:- ** {title}", { title: track.info.title }) + "\n" +
        i18n.cmd("└─ **Artist:- ** {author}", { author: track.info.author || i18n.cmd("Unknown") }) + "\n" +
        i18n.cmd("└─ **Duration:- ** {duration}", { duration: this._formatDuration(track.info.duration) }) + "\n" +
        i18n.cmd("└─ **Status:-** {status}", {
          status: isPlaying
            ? i18n.cmd("Now playing")
            : i18n.cmd("Position {position}", { position: result.queuePosition || 0 }),
        });

      let footer = isPlaying
        ? i18n.cmd("*Currently streaming in voice channel*")
        : i18n.cmd("*Track has been queued successfully*");

      if (result.type === "queued" && premiumStatus) {
        content +=
          "\n\n" + i18n.cmd("**Queue Information**") + "\n\n" +
          i18n.cmd("└─ **{emoji} Position:** {position}", {
            emoji: emoji.get("add") || "➕",
            position: result.queuePosition || 0,
          }) + "\n" +
          i18n.cmd("└─ **{emoji} Queue Type:** {type}", {
            emoji: emoji.get("folder") || "📁",
            type: premiumStatus.hasPremium ? i18n.cmd("Premium") : i18n.cmd("Free"),
          }) + "\n" +
          i18n.cmd("└─ **{emoji} Usage:** {used}/{max} songs", {
            emoji: emoji.get("info") || "ℹ️",
            used: result.queuePosition || 0,
            max: premiumStatus.maxSongs,
          }) + "\n" +
          i18n.cmd("└─ **{emoji} Status:** {status}", {
            emoji: emoji.get("check") || "✅",
            status: premiumStatus.hasPremium ? i18n.cmd("Premium active") : i18n.cmd("Free tier"),
          });
        footer = !premiumStatus.hasPremium
          ? i18n.cmd("*Upgrade to premium for {count} song limit*", { count: config.queue.maxSongs.premium })
          : i18n.cmd("*Premium features unlocked*");
      }

      return buildContainer({ image: undefined,
          title,
          content,
          thumbnail: track.info.artworkUrl || config.assets.defaultTrackArtwork,
          icon: emoji.get("music") || "🎵",
          footer,
      });
    } else if (result.type.startsWith("playlist")) {
      const { playlist, tracks, premiumStatus, limitWarning, totalTracks } = result;
      const trackCount = tracks.length;

      let title, description;
      if (result.type === "playlist_playing") {
        title = i18n.translateTitle("Playing Playlist");
        description = i18n.cmd("Started playlist playback");
      } else if (result.type === "playlist_playing_partial") {
        title = i18n.translateTitle("Playing Playlist");
        description = i18n.cmd("Partial playlist loaded");
      } else if (result.type === "playlist_queued_partial") {
        title = i18n.translateTitle("Queued Playlist");
        description = i18n.cmd("Partial playlist queued");
      } else {
        title = i18n.translateTitle("Queued Playlist");
        description = i18n.cmd("Playlist added to queue");
      }

      let content =
        i18n.cmd("**Playlist Information**") + "\n\n" +
        i18n.cmd("└─ **{emoji} Name:** {name}", { emoji: emoji.get("check") || "✅", name: playlist.name }) + "\n" +
        i18n.cmd("└─ **{emoji} Tracks Added:** {count}", { emoji: emoji.get("add") || "➕", count: trackCount }) + "\n" +
        i18n.cmd("└─ **{emoji} Total Tracks:** {count}", { emoji: emoji.get("info") || "ℹ️", count: totalTracks || trackCount }) + "\n" +
        i18n.cmd("└─ **{emoji} Status:** {status}", { emoji: emoji.get("folder") || "📁", status: description });

      let footer = limitWarning || i18n.cmd("*All tracks processed successfully*");

      if ((result.type === "playlist_queued" || result.type === "playlist_queued_partial" || result.type === "playlist_playing_partial") && premiumStatus) {
        content +=
          "\n\n" + i18n.cmd("**Queue Status**") + "\n\n" +
          i18n.cmd("└─ **{emoji} Queue Type:** {type}", {
            emoji: emoji.get("folder") || "📁",
            type: premiumStatus.hasPremium ? i18n.cmd("Premium") : i18n.cmd("Free"),
          }) + "\n" +
          i18n.cmd("└─ **{emoji} Limit:** {max} songs maximum", { emoji: emoji.get("info") || "ℹ️", max: premiumStatus.maxSongs }) + "\n" +
          i18n.cmd("└─ **{emoji} Status:** {status}", {
            emoji: emoji.get("check") || "✅",
            status: premiumStatus.hasPremium ? i18n.cmd("Premium active") : i18n.cmd("Free tier active"),
          });
        footer = !premiumStatus.hasPremium
          ? i18n.cmd("*Upgrade to premium for {count} song limit*", { count: config.queue.maxSongs.premium })
          : i18n.cmd("*Premium queue features enabled*");
      }

      return buildContainer({ image: undefined,
          title,
          content,
          thumbnail: tracks[0]?.info?.artworkUrl || config.assets.defaultTrackArtwork,
          icon: emoji.get("folder") || "📁",
          footer,
      });
    }
  }

  _createButtons(trackIndex: any, guildId: any) {
    return new ActionRowBuilder<any>().addComponents(
      new ButtonBuilder()
        .setCustomId(`play_now_${trackIndex}_${guildId}`)
        .setLabel(i18n.cmd("Play Now"))
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`play_next_${trackIndex}_${guildId}`)
        .setLabel(i18n.cmd("Play Next"))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`remove_track_${trackIndex}_${guildId}`)
        .setLabel(i18n.cmd("Remove"))
        .setStyle(ButtonStyle.Danger),
    );
  }

  async _updateMessage(message: any, result: any, guildId: any, client: any, userId: any) {
    try {
      const container = result.success
        ? this._createSuccessContainer(result)
        : this._createErrorContainer(result.message, result.isPremiumLimit);

      if (result.success && result.showButtons && result.queuePosition) {
        container!.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
        );

        const buttonRow = this._createButtons(
          result.queuePosition - 1,
          guildId,
        );
        container!.addActionRowComponents(buttonRow);
      }

      await message.edit({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });

      if (result.success && result.showButtons && result.queuePosition) {
        this._setupButtonCollector(message, guildId, client, userId);
      }
    } catch (error: any) {
      client.logger?.error(
        "PlayCommand",
        `Error updating message: ${error.message}`,
        error,
      );
    }
  }

  async _updateInteraction(interaction: any, result: any, guildId: any, client: any, userId: any) {
    try {
      const container = result.success
        ? this._createSuccessContainer(result)
        : this._createErrorContainer(result.message, result.isPremiumLimit);

      if (result.success && result.showButtons && result.queuePosition) {
        container!.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
        );

        const buttonRow = this._createButtons(
          result.queuePosition - 1,
          guildId,
        );
        container!.addActionRowComponents(buttonRow);
      }

      await interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });

      if (result.success && result.showButtons && result.queuePosition) {
        this._setupButtonCollector(interaction, guildId, client, userId);
      }
    } catch (error: any) {
      client.logger?.error(
        "PlayCommand",
        `Error updating interaction: ${error.message}`,
        error,
      );
    }
  }

  _setupButtonCollector(messageOrInteraction: any, guildId: any, client: any, userId: any) {

    const message = componentCollectorSource(messageOrInteraction);
    const filter = (i: any) =>
      i.user.id === userId && i.customId.endsWith(`_${guildId}`);
    const collector = message.createMessageComponentCollector({
      filter,
      time: 300_000,
      max: 1,
      dispose: true,
    });

    collector.on("collect", async (interaction: any) => {
      let actionCompleted = false;

      try {
        await interaction.deferUpdate();

        const parts = interaction.customId.split("_");
        if (parts.length < 3) {
          client.logger?.warn(
            "PlayCommand",
            `Invalid customId format: ${interaction.customId}`,
          );
          return;
        }

        parts.pop();
        const trackIndexStr = parts.pop();
        const action = parts.join("_");

        const trackIndex = parseInt(trackIndexStr, 10);
        if (isNaN(trackIndex)) {
          client.logger?.warn(
            "PlayCommand",
            `Invalid track index: ${trackIndexStr}`,
          );
          return;
        }

        if (!interaction.member?.voice?.channel) {
          await interaction
            .followUp({
              content: i18n.tr("body.voiceRequired"),
              ephemeral: true,
            })
            .catch(() => {});
          return;
        }

        const player = client.music?.getPlayer(guildId);
        if (!player) {
          await interaction
            .followUp({
              content: i18n.tr("body.noPlayer"),
              ephemeral: true,
            })
            .catch(() => {});
          return;
        }

        const pm = new PlayerManager(player);

        if (trackIndex < 0 || trackIndex >= player.queue.tracks.length) {
          await interaction
            .followUp({
              content: i18n.tr("body.trackGone"),
              ephemeral: true,
            })
            .catch(() => {});
          return;
        }

        const track = player.queue.tracks[trackIndex];
        let newContainer;
        let actionMessage;

        switch (action) {
          case "play_now":
            await pm.queue.move(trackIndex, 0);
            await pm.skip();
            actionMessage = i18n.tr("body.nowPlaying", { title: track.info.title });
            newContainer = this._createActionResultContainer(
              "title.trackUpdated",
              actionMessage,
            );
            actionCompleted = true;
            break;

          case "play_next":
            await pm.queue.move(trackIndex, 0);
            actionMessage = i18n.tr("body.willPlayNext", { title: track.info.title });
            newContainer = this._createActionResultContainer(
              "title.queueUpdated",
              actionMessage,
            );
            actionCompleted = true;
            break;

          case "remove_track":
            await pm.queue.remove(trackIndex);
            actionMessage = i18n.tr("body.removedTrack", { title: track.info.title });
            newContainer = this._createActionResultContainer(
              "title.trackRemoved",
              actionMessage,
            );
            actionCompleted = true;
            break;

          default:
            client.logger?.warn("PlayCommand", `Unknown action: ${action}`);
            await interaction
              .followUp({
                content: i18n.tr("body.unknownAction"),
                ephemeral: true,
              })
              .catch(() => {});
            return;
        }

        if (actionCompleted && newContainer) {
          await interaction.editReply({
            components: [newContainer],
            flags: MessageFlags.IsComponentsV2,
          });

          client.logger?.debug(
            "PlayCommand",
            `Action completed: ${action} for track ${trackIndex}`,
          );
        }
      } catch (error: any) {
        client.logger?.error(
          "PlayCommand",
          `Error in button collector: ${error.message}`,
          error,
        );

        try {
          if (!actionCompleted) {
            await interaction.followUp({
              content: i18n.tr("body.actionFailed"),
              ephemeral: true,
            });
          }
        } catch (followUpError: any) {
          client.logger?.error(
            "PlayCommand",
            `Error sending followup: ${followUpError.message}`,
          );
        }
      }
    });

    collector.on("end", async (collected: any,  reason: any) => {
      if (reason === "limit" || reason === "messageDelete") return;

      try {
        const currentMessage = await this._fetchMessage(message).catch(
          () => null,
        );

        if (!currentMessage?.components?.length) {
          client.logger?.debug("PlayCommand", "No message or components found for disabling");
          return;
        }

        const success = await this._disableAllComponents(
          currentMessage,
          client,
        );

        if (success) {
          client.logger?.debug(
            "PlayCommand",
            `Components disabled successfully. Reason: ${reason}`,
          );
        }
      } catch (error: any) {
        this._handleDisableError(error, client, reason);
      }
    });

    collector.on("dispose", async (interaction: any) => {
      client.logger?.debug(
        "PlayCommand",
        `Interaction disposed: ${interaction.customId}`,
      );
    });
  }

  async _disableAllComponents(message: any, client: any) {
    try {
      const disabledComponents = this._processComponents(message.components);

      await message.edit({
        components: disabledComponents,
        flags: MessageFlags.IsComponentsV2,
      });

      return true;
    } catch (error: any) {
      client.logger?.error(
        "PlayCommand",
        `Failed to disable components: ${error.message}`,
        error,
      );
      return false;
    }
  }

  _processComponents(components: any) {
    return components.map((component: any) => {
      if (component.type === ComponentType.ActionRow) {
        return {
          ...component.toJSON(),
          components: component.components.map((subComponent: any) => ({
            ...subComponent.toJSON(),
            disabled: true,
          })),
        };
      }

      if (component.type === ComponentType.Container) {
        return {
          ...component.toJSON(),
          components: this._processComponents(component.components),
        };
      }

      if (component.type === ComponentType.Section) {
        const processedComponent = {
          ...component.toJSON(),
          components: this._processComponents(component.components),
        };

        if (
          component.accessory &&
          component.accessory.type === ComponentType.Button
        ) {
          processedComponent.accessory = {
            ...component.accessory.toJSON(),
            disabled: true,
          };
        }

        return processedComponent;
      }

      return component.toJSON();
    });
  }

  async _fetchMessage(messageOrInteraction: any) {
    if (messageOrInteraction.fetchReply) {
      return await messageOrInteraction.fetchReply();
    } else if (messageOrInteraction.fetch) {
      return await messageOrInteraction.fetch();
    } else {
      return messageOrInteraction;
    }
  }

  async _disableComponents(currentMessage: any, client: any) {
    try {
      const containerComponent = currentMessage.components.find(
        (c: any) => c.type === ComponentType.Container,
      );

      if (!containerComponent) {
        client.logger?.debug("PlayCommand", "No container component found");
        return false;
      }

      let container;
      try {
        container = new ContainerBuilder(containerComponent);
      } catch (containerError: any) {
        client.logger?.error(
          "PlayCommand",
          `Failed to create ContainerBuilder: ${containerError.message}`,
        );
        return false;
      }

      let componentsModified = false;

      for (const comp of container.components) {
        if (comp instanceof ActionRowBuilder) {
          comp.components.forEach((inner: any) => {
            if (this._shouldDisableComponent(inner)) {
              inner.setDisabled(true);
              componentsModified = true;
            }
          });
        } else if (comp instanceof SectionBuilder && comp.accessory?.data) {
          if (
            comp.accessory.data.type === ComponentType.Button &&
            comp.accessory.data.style !== ButtonStyle.Link
          ) {
            comp.accessory.data.disabled = true;
            componentsModified = true;
          }
        }
      }

      if (componentsModified) {
        await currentMessage.edit({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
        return true;
      }

      return false;
    } catch (error: any) {
      throw error;
    }
  }

  _shouldDisableComponent(component: any) {
    const selectMenuTypes = [
      StringSelectMenuBuilder,
      UserSelectMenuBuilder,
      RoleSelectMenuBuilder,
      ChannelSelectMenuBuilder,
      MentionableSelectMenuBuilder,
    ];

    if (selectMenuTypes.some((type) => component instanceof type)) {
      return true;
    }

    if (component instanceof ButtonBuilder) {
      return component.data.style !== ButtonStyle.Link;
    }

    return false;
  }

  _handleDisableError(error: any, client: any, reason: any) {
    const ignoredErrors = [10008, 10003, 50001];

    if (!ignoredErrors.includes(error.code)) {
      client.logger?.error(
        "PlayCommand",
        `Error disabling components after ${reason}: ${error.message}`,
        {
          code: error.code,
          reason,
          stack: error.stack,
        },
      );
    } else {
      client.logger?.debug(
        "PlayCommand",
        `Ignored error ${error.code} when disabling components: ${error.message}`,
      );
    }
  }

  _createActionResultContainer(title: any, message: any) {
    return buildSuccess(message, title);
  }

  _parseFlags(args: any) {
    const flags: { query: string[]; source: string | null; position: number | null } = { query: [], source: null, position: null };
    for (let i = 0; i < args.length; i++) {
      const arg = args[i].toLowerCase();
      if (arg === "--src" || arg === "--source") {
        if (i + 1 < args.length) flags.source = args[++i];
      } else if (arg === "--pos" || arg === "--position") {
        if (i + 1 < args.length) {
          const pos = parseInt(args[++i], 10);
          if (!isNaN(pos) && pos > 0) flags.position = pos;
        }
      } else if (arg === "--next") {
        flags.position = 1;
      } else if (!arg.startsWith("--")) {
        flags.query.push(args[i]);
      }
    }
    return {
      query: flags.query.join(" "),
      source: flags.source,
      position: flags.position,
    };
  }

  _normalizeSource(source: any) {
    const sourceMap = {
      yt: "ytsearch",
      youtube: "ytsearch",
      sp: "spsearch",
      spotify: "spsearch",
      am: "amsearch",
      apple: "amsearch",
      sc: "scsearch",
      soundcloud: "scsearch",
      dz: "dzsearch",
      deezer: "dzsearch",
    };
    return (sourceMap as Record<string, string>)[source?.toLowerCase()] || (musicSource?.PRIMARY_PREFIX || "").replace(":", "");
  }

  _isUrl(string: any) {
    try {
      new URL(string);
      return true;
    } catch {
  }
      return false;
    }

  _formatDuration(ms: number) {
    if (!ms || ms < 0) return "Live";
    const seconds = Math.floor((ms / 1000) % 60)
      .toString()
      .padStart(2, "0");
    const minutes = Math.floor((ms / (1000 * 60)) % 60)
      .toString()
      .padStart(2, "0");
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours > 0) return `${hours}:${minutes}:${seconds}`;
    return `${minutes}:${seconds}`;
  }
}

export default new PlayCommand();

// Made by Nikhil Under CodeX Devs
