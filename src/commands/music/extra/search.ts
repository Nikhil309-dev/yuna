import { Command, CommandContext } from '#core/Command';
import {
  ActionRowBuilder,
  MessageFlags,
  StringSelectMenuBuilder
} from "discord.js";
import { PlayerManager } from '#audio/PlayerManager';
import { db } from '#database/Database';
import { config } from "#config/config";
import { logger } from "#utils/logger";
import { buildContainer, buildError, buildSuccess } from '#ui/Theme';
import { componentCollectorSource } from '#ui/Components';
import emoji from "#config/emoji";
import musicSource from "#config/sources";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";

const MAX_RESULTS = 5;

class SearchCommand extends Command {
  constructor() {
    super({
      name: "search",
      description: i18n.cmd("Search for music across multiple platforms"),
      usage: "search <query> [--src yt/sp/am/sc]",
      aliases: ["find", "lookup"],
      category: "music",
      examples: [
        "search never gonna give you up",
        "search taylor swift --src sp",
        "search lofi hip hop --src yt"
      ],
      cooldown: 5,
      slash: {
        enabled: true,
        autoDefer: true,
        data: {
          name: "search",
          description: i18n.cmd("Search for music across multiple platforms"),
          options: [
            {
              name: "query",
              description: "What do you want to search for?",
              type: 3,
              required: true,
              autocomplete: true
            },
            {
              name: "source",
              description: i18n.cmd("Music source to search from"),
              type: 3,
              required: false,
              choices: [
                { name: i18n.cmd("All Sources (Multi-Platform)"), value: "all" },
                { name: "JioSaavn", value: "js" },
                { name: "YouTube", value: "yt" },
                { name: "Spotify", value: "sp" },
                { name: "SoundCloud", value: "sc" },
                { name: "Apple Music", value: "am" },
              ]
            }
          ]
        },
      },
    });
  }

  async execute(ctx: CommandContext) {
    const { client, message, interaction, player, pm, args = [] } = ctx;
    const context = interaction || message;
    let query, source;

    if (interaction) {
      query = interaction.options.getString("query");
      source = interaction.options.getString("source") || 'all';
    } else {
      if (args.length === 0) {
        return message.reply({
          components: [this._createErrorContainer(i18n.cmd("Please provide a search query."))],
          flags: MessageFlags.IsComponentsV2,
        });
      }
      const parsed = this._parseFlags(args);
      query = parsed.query;
      source = parsed.source || 'all';
    }

    if (!query || !query.trim()) {
      const errorContainer = this._createErrorContainer(i18n.cmd("Please provide a search query."));
      const payload = { components: [errorContainer], flags: MessageFlags.IsComponentsV2 };
      if (context.editReply && (context.deferred || context.replied)) {
        return await context.editReply(payload);
      }
      return await (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload);
    }

    return this._handleSearch(client, context, query, source);
  }

  async slashExecute(ctx: CommandContext) {
    return this.execute(ctx);
  }

  async _handleSearch(client: any, context: any, query: any, initialSource: any) {
    const userId = context.user?.id || context.author?.id;
    const guildId = context!.guild.id;

    const loadingMessage = await this._reply(context, this._createLoadingContainer(query));

    try {
      const searchData = {
        query,
        selectedSource: initialSource,
        currentResults: null,
        guildId,
        userId
      };

      const results = await this._searchTracks(client, query, initialSource);
      searchData.currentResults = results;

      const container = this._createSearchContainer(searchData);
      const message = await this._editReply(loadingMessage, container);

      if (message) {
        this._setupSearchCollector(message, client, userId, guildId, searchData);
      }

    } catch (error) {
      logger.error('SearchCommand', 'Error performing search', error);
      return this._editReply(loadingMessage, this._createErrorContainer(
        i18n.cmd("Search failed. Please try again later.")
      ));
    }
  }

  async _searchTracks(client: any, query: any, initialSource: any) {
    try {
      if (initialSource === 'all') {
        const sources = musicSource.getPrefixList();
        const results = [];

        for (const src of sources) {
          try {
            const searchResult = await client.music.search(query, { source: src });
            if (searchResult?.tracks?.length > 0) {
              const tracks = searchResult.tracks.slice(0, 2).map((track: any) => ({
                ...track,
                source: this._getSourceName(src),
                sourceKey: src
              }));
              results.push(...tracks);
            }
          } catch (error) {
            logger.warn('SearchCommand', `Failed to search ${src}`, error);
          }
        }

        const uniqueResults = this._removeDuplicateTracks(results);
        return uniqueResults.slice(0, MAX_RESULTS);
      } else {
        const sourceKey = this._normalizeSource(initialSource);
        let searchResult = await client.music.search(query, { source: sourceKey });

        if ((!searchResult || !searchResult.tracks?.length) && sourceKey !== 'all') {
          for (const fallbackPrefix of musicSource.getPrefixList()) {
            try {
              const fbResult = await client.music.search(query, { source: fallbackPrefix });
              if (fbResult?.tracks?.length > 0) {
                searchResult = fbResult;
                break;
              }
            } catch (_) {}
          }
        }

        if (searchResult?.tracks?.length > 0) {
          return searchResult.tracks.slice(0, MAX_RESULTS).map((track: any) => ({
            ...track,
            source: this._getSourceName(sourceKey),
            sourceKey: sourceKey
          }));
        }
        return [];
      }
    } catch (error) {
      logger.error('SearchCommand', 'Error searching tracks', error);
      return [];
    }
  }

  _createSearchContainer(searchData: any) {
    const { query, selectedSource, currentResults, guildId, userId } = searchData;

    if (!currentResults || currentResults.length === 0) {
      return buildContainer({
        title: i18n.translateTitle("Music Search Results"),
        content: i18n.cmd('*No tracks found for "{query}". Try a different search term or platform.*', { query }),
        thumbnail: config.assets.defaultTrackArtwork,
        icon: emoji.get("warning") || "⚠️"
      });
    }

    let content = `**Search Results for:** \`${query}\`\n\n`;
    const options: any[] = [];

    currentResults.forEach((track: any, index: any) => {
      const num = index + 1;
      const title = track.info.title.length > 50 ? track.info.title.substring(0, 47) + "..." : track.info.title;
      const author = track.info.author ? (track.info.author.length > 30 ? track.info.author.substring(0, 27) + "..." : track.info.author) : "Unknown";
      const duration = this._formatDuration(track.info.duration || track.info.length);

      content += `└─ **${num}.** [${track.info.title}](${track.info.uri || '#'}) - **${track.info.author || "Unknown"}** (\`${duration}\`)\n`;

      options.push({
        label: `${num}. ${title}`,
        description: `By ${author} (${duration})`,
        value: `${index}`,
      });
    });

    content += `\n*Select a song from the dropdown menu below to play.*`;

    const container = buildContainer({
      title: i18n.translateTitle("Music Search Results"),
      content,
      thumbnail: currentResults[0]?.info?.artworkUrl || config.assets.defaultTrackArtwork,
      icon: emoji.get("music") || "🎵"
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("search_select")
      .setPlaceholder(i18n.cmd("Select a track to play..."))
      .addOptions(options);

    container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));

    return container;
  }

  _createLoadingContainer(query: any) {
    return buildContainer({
      title: i18n.translateTitle("Searching Music"),
      content: i18n.cmd("> {emoji} Searching for `{query}`...", { emoji: emoji.get("loading") || "⏳", query }),
      icon: emoji.get("loading") || "⏳"
    });
  }

  _createErrorContainer(message: any, isPremiumLimit = false) {
    return buildError(message, "Search Error");
  }

  _createProcessingContainer(count: any) {
    const container = buildContainer({
      title: i18n.translateTitle("Processing Selection"),
      content: i18n.cmd("Processing {count} selection(s)...", { count }),
      thumbnail: config.assets.defaultTrackArtwork,
      icon: "ℹ️"
    });

    return container;
  }

  _checkQueueLimit(currentQueueSize: any, tracksToAdd: any, guildId: any, userId: any) {
    const premiumStatus = this._getPremiumStatus(guildId, userId);
    const availableSlots = premiumStatus.maxSongs - currentQueueSize;

    if (availableSlots <= 0) {
      const limitMessage = premiumStatus.hasPremium
        ? i18n.cmd("Premium queue is full! You can have up to **{count}** songs in queue.", { count: premiumStatus.maxSongs })
        : i18n.cmd("Free tier queue is full! You can have up to **{count}** songs in queue.\n*Upgrade to premium for up to **{premium}** songs!*", { count: premiumStatus.maxSongs, premium: config.queue.maxSongs.premium });

      return { allowed: false, message: limitMessage };
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

  _removeDuplicateTracks(tracks: any) {
    const seen = new Set();
    return tracks.filter((track: any) => {
      const key = `${track.info.title.toLowerCase()}_${track.info.author?.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  _getSourceName(source: any) {
    const sourceNames: Record<string, string> = {
      'jssearch': 'JioSaavn',
      'ytsearch': 'YouTube',
      'spsearch': 'Spotify',
      'amsearch': 'Apple Music',
      'scsearch': 'SoundCloud',
      'dzsearch': 'Deezer',
      'js': 'JioSaavn',
      'sp': 'Spotify',
      'yt': 'YouTube',
      'am': 'Apple Music',
      'sc': 'SoundCloud',
      'dz': 'Deezer',
      'all': i18n.cmd('All Sources')
    };
    return sourceNames[source] || i18n.cmd('Unknown');
  }

  _normalizeSource(source: any) {
    const sourceMap: Record<string, string> = {
      js: "jssearch", jiosaavn: "jssearch",
      yt: "ytsearch", youtube: "ytsearch",
      sp: "spsearch", spotify: "spsearch",
      am: "amsearch", apple: "amsearch",
      sc: "scsearch", soundcloud: "scsearch",
      dz: "dzsearch", deezer: "dzsearch",
      all: "all"
    };
    return sourceMap[source?.toLowerCase()] || "all";
  }

  _parseFlags(args: any) {
    const flags: { query: string[]; source: string | null } = { query: [], source: null };
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg ==="--src" || arg ==="--source") {
        if (i + 1 < args.length) flags.source = args[++i];
      } else if (!arg.startsWith("--")) {
        flags.query.push(arg);
      }
    }
    return { query: flags.query.join(" "), source: flags.source };
  }

  _setupSearchCollector(message: any, client: any, userId: any, guildId: any, searchData: any) {
    const filter = (i: any) => i.customId === "search_select";
    const collector = componentCollectorSource(message).createMessageComponentCollector({
      filter,
      time: 60_000,
    });

    collector.on("collect", async (interaction: any) => {
      if (interaction.user.id !== userId) {
        return (interaction.deferred || interaction.replied ? interaction.editReply.bind(interaction) : interaction.reply.bind(interaction))({
          components: [buildError(phrases.get("notYourInteraction"), "Access Denied")],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        });
      }

      const selectedIndex = parseInt(interaction.values[0], 10);
      const track = searchData.currentResults?.[selectedIndex];
      if (!track) return;

      const voiceChannel = interaction.member?.voice?.channel;
      if (!voiceChannel) {
        return (interaction.deferred || interaction.replied ? interaction.editReply.bind(interaction) : interaction.reply.bind(interaction))({
          components: [buildError(phrases.get("voiceRequired"))],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        });
      }

      await interaction.deferUpdate();

      try {
        const player = await client.music.createPlayer({
          guildId: guildId,
          textChannelId: interaction.channelId,
          voiceChannelId: voiceChannel.id,
          volume: db.guild.getDefaultVolume(guildId),
        });

        const pm = new PlayerManager(player);
        if (!pm.isConnected) await pm.connect();

        const wasEmpty = !pm.currentTrack && pm.queueSize === 0;
        await pm.addTracks(track);
        if (wasEmpty) await pm.play();

        const container = buildSuccess(
          wasEmpty
            ? i18n.cmd("Now streaming **{title}**!", { title: track.info.title })
            : i18n.cmd("Added **{title}** to the queue!", { title: track.info.title }),
          wasEmpty ? i18n.translateTitle("Now Playing") : i18n.translateTitle("Queued Track")
        );

        await interaction.editReply({ components: [container] });
      } catch (err) {
        logger.error("SearchCommand", "Collector play error:", err);
      }
    });

    collector.on("end", async (_: any, reason: any) => {
      if (reason === "messageDelete") return;
      try {
        const disabledComponents = message.components?.map((row: any) => {
          if (row.type === 1) {
            return {
              ...row.toJSON(),
              components: row.components.map((c: any) => ({ ...c.toJSON(), disabled: true }))
            };
          }
          return row.toJSON();
        }) || [];

        await message.edit({
          components: disabledComponents,
          flags: MessageFlags.IsComponentsV2
        }).catch(() => {});
      } catch (_) {}
    });
  }

  _formatDuration(ms: any) {
    if (!ms || ms < 0) return "Live";
    const seconds = Math.floor((ms / 1000) % 60).toString().padStart(2, "0");
    const minutes = Math.floor((ms / (1000 * 60)) % 60).toString().padStart(2, "0");
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours > 0) return `${hours}:${minutes}:${seconds}`;
    return `${minutes}:${seconds}`;
  }

  async _reply(context: any, container: any) {
    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true
    };

    try {
      if (context.replied || context.deferred) {
        return await context.editReply(payload);
      } else if (typeof context.reply ==='function') {
        return await (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload);
      } else {
        return await context.channel.send(payload);
      }
    } catch (error) {
      logger.error('SearchCommand', 'Error in _reply', error);
      return null;
    }
  }

  async _editReply(message: any, container: any) {
    try {
      return await message.edit({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    } catch (error) {
      logger.error('SearchCommand', 'Error in _editReply', error);
      return null;
    }
  }
}

export default new SearchCommand();

// Made by Nikhil Under CodeX Devs
