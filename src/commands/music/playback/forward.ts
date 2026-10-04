import {
  MessageFlags
} from "discord.js";

import { config } from "#config/config";
import { i18n } from "#utils/i18n";
import { Command, CommandContext } from '#core/Command';
import { buildContainer, buildError } from '#ui/Theme';
import emoji from "#config/emoji";
import phrases from "#utils/phrases";
import { PlayerManager } from '#audio/PlayerManager';

class ForwardCommand extends Command {
  constructor() {
    super({
      name: "forward",
      description:
        "Forward the current track by specified seconds (default: 10 seconds, not available for live streams)",
      usage: "forward [seconds]",
      aliases: ["fw"],
      category: "music",
      examples: ["forward", "forward 30", "fw 15"],
      cooldown: 3,
      access: {
        voice: true,
        sameVoice: true,
        player: true,
        playing: true,
      },
      slash: {
        enabled: true,
        autoDefer: true,
        data: {
          name: "forward",
          description: "Forward the current track by specified seconds",
          options: [
            {
              name: "seconds",
              description: "Number of seconds to forward (default: 10)",
              type: 4,
              required: false,
              min_value: 1,
              max_value: 300,
            },
          ],
        },
      },
    });
  }

  async execute(ctx: CommandContext) {
    const { client, message, interaction, player, pm, args = [] } = ctx;
    const context = interaction || message;
    const activePm = pm || (player ? new PlayerManager(player) : (client?.music?.getPlayer(context.guildId || context.guild?.id) ? new PlayerManager(client.music.getPlayer(context.guildId || context.guild?.id)) : null));
    if (!activePm) return;
    const seconds = interaction ? interaction.options.getInteger("seconds") : (args[0] ? parseInt(args[0], 10) : null);
    return this._handleForward(
      context,
      activePm,
      seconds ? [seconds.toString()] : [],
    );
  }

  async slashExecute(ctx: CommandContext) {
    return this.execute(ctx);
  }

  async _handleForward(context: CommandContext, pm: PlayerManager, args: any[] = []) {
    const { currentTrack } = pm;

    if (currentTrack.info.isStream) {
      return this._reply(
        context,
        this._createErrorContainer(phrases.get("seekInvalid")),
      );
    }

    let seconds = 10;
    if (args[0]) {
      const parsedSeconds = parseInt(args[0]);
      if (isNaN(parsedSeconds) || parsedSeconds < 1 || parsedSeconds > 300) {
        return this._reply(
          context,
          this._createErrorContainer(phrases.get("seekInvalid")),
        );
      }
      seconds = parsedSeconds;
    }

    let newPosition: number | false;
    try {
      newPosition = await pm.forward(seconds * 1000);
    } catch (err: any) {
      return this._reply(context, this._createErrorContainer(i18n.cmd("Failed to forward: {error}", { error: err.message })));
    }
    if (newPosition === false) {
      return this._reply(
        context,
        this._createErrorContainer(phrases.get("seekInvalid")),
      );
    }

    const forwardNote = phrases.get("forwardSuccess");
    const content = i18n.cmd("**Track Forwarded**") + "\n\n" +
      i18n.cmd("└─ **{emoji} Title:** {title}", { emoji: emoji.get("music") || "🎵", title: currentTrack.info.title }) + "\n" +
      i18n.cmd("└─ **{emoji} Forwarded by:** {seconds} seconds", { emoji: emoji.get("time") || "⏰", seconds }) + "\n" +
      i18n.cmd("└─ **{emoji} New Position:** {position}", { emoji: emoji.get("info") || "ℹ️", position: this._formatDuration(newPosition / 1000) }) + "\n\n" +
      `*${forwardNote}*`;

    const container = buildContainer({
      title: i18n.translateTitle("Track Forwarded"),
      content: content,
      thumbnail: currentTrack.info?.artworkUrl || config.assets.defaultTrackArtwork,
      icon: emoji.get("music") || "ℹ️"
    });

    return this._reply(context, container);
  }

  _formatDuration(durationInSeconds: any) {
    const minutes = Math.floor(durationInSeconds / 60);
    const seconds = Math.floor(durationInSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  _createErrorContainer(message: string) {
    return buildError(message);
  }

  async _reply(context: CommandContext, container: any) {
    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
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

export default new ForwardCommand();

// Made by Nikhil Under CodeX Devs
