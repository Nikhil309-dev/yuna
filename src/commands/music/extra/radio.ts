import { Command, CommandContext } from '#core/Command';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  StringSelectMenuBuilder
} from "discord.js";
import { PlayerManager } from '#audio/PlayerManager';
import { config } from "#config/config";
import emoji from "#config/emoji";
import { logger } from "#utils/logger";
import { buildContainer, buildError, buildSuccess } from '#ui/Theme';
import { componentCollectorSource } from '#ui/Components';
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";

const RADIO_STATIONS = [
  {
    id: "lofi",
    name: "Lofi Girl 24/7",
    description: "Relaxing lofi hip hop & study beats",
    emoji: "☕",
    url: "https://stream.zeno.fm/f3wvbbqmdg8uv"
  },
  {
    id: "bollywood",
    name: "Bollywood Radio Hits",
    description: i18n.cmd("Non-stop Hindi hits & romantic melodies"),
    emoji: "📻",
    url: "https://stream.zeno.fm/0r0xa792kwzuv"
  },
  {
    id: "edm",
    name: "EDM & Club Beats",
    description: "High-energy electronic dance & festival tracks",
    emoji: "⚡",
    url: "https://stream.zeno.fm/f9u2h5318g8uv"
  },
  {
    id: "jazz",
    name: "Chillhop & Jazz Cafe",
    description: "Smooth jazz, lounge, and atmospheric chill beats",
    emoji: "🎷",
    url: "https://stream.zeno.fm/z522809e5ceuv"
  },
  {
    id: "anime",
    name: "Anime & J-Pop Radio",
    description: "Anime OSTs, openings, and J-Pop favorites",
    emoji: "🌸",
    url: "https://stream.zeno.fm/7c2yrvhgfkeuv"
  },
  {
    id: "retro",
    name: "80s Synth & Retro Wave",
    description: i18n.cmd("Nostalgic 80s synthwave, retrowave & electro hits"),
    emoji: "🕹️",
    url: "https://stream.zeno.fm/91x4v5294geuv"
  }
];

class RadioCommand extends Command {
  constructor() {
    super({
      name: "radio",
      description: "Play 24/7 live streaming radio stations",
      usage: "radio [station_id]",
      aliases: ["station", "radios"],
      category: "music",
      examples: ["radio", "radio lofi", "radio bollywood"],
      cooldown: 5,
      access: {
        voice: true,
      },
      slash: {
        enabled: true,
        autoDefer: true,
        data: {
          name: "radio",
          description: "Play 24/7 live streaming radio stations",
          options: [
            {
              name: "station",
              description: i18n.cmd("Select a 24/7 radio station to play"),
              type: 3,
              required: false,
              choices: RADIO_STATIONS.map((s) => ({
                name: `${s.name}`,
                value: s.id,
              })),
            },
          ],
        },
      },
    });
  }

  async execute(ctx: CommandContext) {
    const { client, message, interaction, player, pm, args = [] } = ctx;
    const context = interaction || message;
    const stationId = interaction ? interaction.options.getString("station") : args[0]?.toLowerCase();
    if (stationId) {
      const station = RADIO_STATIONS.find((s) => s.id === stationId);
      if (station) {
        return this._playRadioStation(context, client, station);
      }
    }

    return this._sendRadioMenu(context, client);
  }

  async slashExecute(ctx: CommandContext) {
    return this.execute(ctx);
  }

  async _sendRadioMenu(context: any, client: any) {
    const button = new ButtonBuilder()
      .setLabel(i18n.cmd("Support"))
      .setURL(config.links?.supportServer || "https://discord.gg/XYwwyDKhec")
      .setStyle(ButtonStyle.Link);

    let desc = i18n.cmd("Select a 24/7 live radio station from the dropdown menu below to start streaming high-quality music instantly into your voice channel!") + "\n\n";
    RADIO_STATIONS.forEach((s) => {
      desc += `${s.emoji} **${s.name}**\n${s.description}\n${i18n.cmd("Command: .radio {id}", { id: s.id })}\n\n`;
    });

    const container = buildContainer({
      title: "`### 📻 Live 24/7 Radio Stations`",
      content: desc.trim(),
      thumbnail: config.assets.defaultTrackArtwork,
      icon: "ℹ️"
    });

    const selectOptions = RADIO_STATIONS.map((s) => ({
      label: s.name,
      description: s.description.substring(0, 100),
      value: s.id,
      emoji: s.emoji,
    }));

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("radio_select_menu")
        .setPlaceholder(i18n.cmd("Choose a 24/7 Radio Station..."))
        .addOptions(selectOptions)
    );

    container.addActionRowComponents(row);

    const payload = { components: [container], flags: MessageFlags.IsComponentsV2 };
    const msg = context.reply
      ? await (context.deferred || context.replied ? context!.editReply.bind(context) : context.reply.bind(context))({ ...payload, fetchReply: true })
      : await context.channel.send(payload);

    if (msg) {
      const userId = context.author?.id || context.user?.id;
      const filter = (i: any) => i.customId === "radio_select_menu" && i.user.id === userId;
      const collector = componentCollectorSource(msg).createMessageComponentCollector({ filter, time: 60000 });

      collector.on("collect", async (interaction: any) => {
        const selectedId = interaction.values[0];
        const station = RADIO_STATIONS.find((s) => s.id === selectedId);

        if (station) {
          await interaction.deferUpdate();
          await this._playRadioStation(interaction, client, station, msg);
        }
      });
    }
  }

  async _playRadioStation(context: any, client: any, station: any, existingMsg: any = null) {
    try {
      const button = new ButtonBuilder()
        .setLabel(i18n.cmd("Support"))
        .setURL(config.links?.supportServer || "https://discord.gg/XYwwyDKhec")
        .setStyle(ButtonStyle.Link);

      const voiceChannel = context.member?.voice?.channel;
      if (!voiceChannel) {
        const errorContainer = buildError(phrases.get("voiceRequired"), "Voice Channel Required");
        const errorPayload = { components: [errorContainer], flags: MessageFlags.IsComponentsV2, ephemeral: true };
        return context.reply ? (context.deferred || context.replied ? context!.editReply.bind(context) : context.reply.bind(context))(errorPayload) : context.channel.send(errorPayload);
      }

      let player = client.music.getPlayer(context!.guild.id);
      if (!player) {
        player = await client.music.createPlayer({
          guildId: context!.guild.id,
          textChannelId: context.channel.id,
          voiceChannelId: voiceChannel.id,
        });
      }

      const pm = new PlayerManager(player);
      if (!pm.isConnected) await pm.connect();

      const searchResult = await client.music.search(station.url);
      if (!searchResult?.tracks?.length) {
        const errorContainer = buildError(phrases.get("noResults"), "Radio Error");
        const errorPayload = { components: [errorContainer], flags: MessageFlags.IsComponentsV2, ephemeral: true };
        return context.reply ? (context.deferred || context.replied ? context!.editReply.bind(context) : context.reply.bind(context))(errorPayload) : context.channel.send(errorPayload);
      }

      const track = searchResult.tracks[0];
      track.info.title = `${station.emoji} ${station.name} ${i18n.cmd("(Live Stream)")}`;
      track.info.author = i18n.cmd("24/7 Live Radio");

      pm.queue.clear();
      await pm.addTracks(track);
      await pm.play();

      const successContainer = buildContainer({
      title: `\`### ${station.emoji} ${i18n.translateTitle("Radio Stream Started")}\``,
      content: i18n.cmd("Now broadcasting **{station}** in <#{channel}>!\n\n*{description}*", {
        station: station.name,
        channel: voiceChannel.id,
        description: station.description,
      }),
      thumbnail: config.assets.defaultTrackArtwork,
      icon: "ℹ️"
    });

      const successPayload = { components: [successContainer], flags: MessageFlags.IsComponentsV2 };

      if (existingMsg && existingMsg.edit) {
        await existingMsg.edit(successPayload);
      } else if (context.reply && (context.replied || context.deferred)) {
        await context.editReply(successPayload);
      } else if (context.reply) {
        await (context.deferred || context.replied ? context!.editReply.bind(context) : context.reply.bind(context))(successPayload);
      } else {
        await context.channel.send(successPayload);
      }
    } catch (err) {
      logger.error("RadioCommand", "Error playing radio station:", err);
    }
  }
}

export default new RadioCommand();

// Made by Nikhil Under CodeX Devs
