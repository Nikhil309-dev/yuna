import {
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";

import { config } from "#config/config";
import { Command, CommandContext } from '#core/Command';
import { buildContainer } from '#ui/Theme';
import emoji from "#config/emoji";
import { i18n } from "#utils/i18n";
import { PlayerManager } from '#audio/PlayerManager';

class StopCommand extends Command {
  constructor() {
    super({
      name: "stop",
      description:
        "Stop music playback, clear the queue, and disconnect from the voice channel",
      usage: "stop",
      aliases: ["disconnect", "leave"],
      category: "music",
      examples: ["stop", "disconnect", "leave"],
      cooldown: 3,
      access: {
        voice: true,
        sameVoice: true,
        player: true,
      },
      slash: {
        enabled: true,
        autoDefer: true,
        data: {
          name: "stop",
          description: "Stop music playback and clear the queue",
        },
      },
    });
  }

  async execute(ctx: CommandContext) {
    const { client, message, interaction, player, pm } = ctx;
    const context = interaction || message;
    const activePm = pm || (player ? new PlayerManager(player) : (client?.music?.getPlayer(context.guildId || context.guild?.id) ? new PlayerManager(client.music.getPlayer(context.guildId || context.guild?.id)) : null));
    if (!activePm) return;
    return this._handleStop(context, activePm);
  }

  async slashExecute(ctx: CommandContext) {
    return this.execute(ctx);
  }

  async _handleStop(context: CommandContext, pm: PlayerManager) {
    const wasPlaying = pm.currentTrack;
    const queueLength = pm.queueSize;
    const is247Enabled = await pm.is247ModeEnabled()

    const lastTrackInfo = wasPlaying
      ? {
          title: wasPlaying.info.title,
          author: wasPlaying.info.author || "Unknown",
          duration: this._formatDuration(wasPlaying.info.duration),
          artworkUrl:
            wasPlaying.info.artworkUrl || config.assets.defaultTrackArtwork,
        }
      : null;

    await pm.stop();

    const container = buildContainer({
      title: is247Enabled ? i18n.translateTitle("Queue Cleared") : i18n.translateTitle("Playback Stopped"),
      content:
        i18n.cmd(is247Enabled ? "**Queue Cleared**" : "**Playback Stopped**") + "\n\n" +
        i18n.cmd("└─ **{emoji} Status:** {status}", {
          emoji: emoji.get("info") || "ℹ️",
          status: is247Enabled ? i18n.cmd("Remaining in channel (24/7 mode enabled)") : i18n.cmd("Disconnected from voice channel"),
        }) + "\n" +
        i18n.cmd("└─ **{emoji} Tracks Cleared:** {count}", { emoji: emoji.get("folder") || "📁", count: queueLength }),
      thumbnail: lastTrackInfo
              ? lastTrackInfo.artworkUrl
              : config.assets?.defaultThumbnail ||
                  config.assets?.defaultTrackArtwork,
      icon: emoji.get("stop") || "🛑"
    });

    if (lastTrackInfo) {
      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      const lastTrackContent =
        i18n.cmd("**Last Track**") + "\n\n" +
        i18n.cmd("└─ **{emoji} Title:** {title}", { emoji: emoji.get("music"), title: lastTrackInfo.title }) + "\n" +
        i18n.cmd("└─ **{emoji} Artist:** {author}", { emoji: emoji.get("folder"), author: lastTrackInfo.author }) + "\n" +
        i18n.cmd("└─ **{emoji} Duration:** {duration}", { emoji: emoji.get("info"), duration: lastTrackInfo.duration }) + "\n" +
        i18n.cmd("└─ **{emoji} Status:** {status}", {
          emoji: emoji.get("check"),
          status: is247Enabled ? i18n.cmd("Cleared from queue") : i18n.cmd("Stopped playing"),
        }) + "\n\n" +
        i18n.cmd("*Track information from last playback*");

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(lastTrackContent),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(lastTrackInfo.artworkUrl),
          ),
      );
    }

    return this._reply(context, container);
  }

  _formatDuration(ms: any) {
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

  async _reply(context: CommandContext, container: any) {
    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true,
    };

    if (context.editReply && (context.deferred || context.replied)) {
      return await context.editReply(payload);
    }
    if (context.deferred || context.replied) {
      return await context.editReply!(payload);
    }
    return await (context as any).reply!(payload);
  }
}

export default new StopCommand();

// Made by Nikhil Under CodeX Devs
