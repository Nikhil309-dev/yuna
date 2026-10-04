import { MessageFlags } from "discord.js";
import { config } from "#config/config";
import { Command } from '#core/Command';
import { buildContainer, buildError } from '#ui/Theme';
import emoji from "#config/emoji";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";
import { PlayerManager } from '#audio/PlayerManager';

class PreviousCommand extends Command {
  constructor() {
    super({
      name: "previous",
      description: "Play the previous track from the queue history",
      usage: "previous",
      aliases: ["prev", "back"],
      category: "music",
      examples: ["previous", "prev", "back"],
      cooldown: 2,
      access: {
        voice: true,
        sameVoice: true,
        player: true,
      },
      slash: {
        enabled: true,
        autoDefer: true,
        data: {
          name: "previous",
          description: "Play the previous track from the queue history",
        },
      },
    });
  }

  async execute(ctx: any) {
    const { client, message, interaction, player, pm, args = [] } = ctx;
    const context = interaction || message;
    const activePm = pm || (player ? new PlayerManager(player) : (client?.music?.getPlayer(context.guildId || context.guild?.id) ? new PlayerManager(client.music.getPlayer(context.guildId || context.guild?.id)) : null));
    if (!activePm) return;
    return this._handlePrevious(context, activePm);
  }

  async slashExecute(ctx: any) {
    return this.execute(ctx);
  }

  async _handlePrevious(context: any, pm: any) {
    if (pm.player?.queue?.previous?.length === 0) {
      return this._reply(
        context,
        this._createErrorContainer(phrases.get("historyEmpty")),
      );
    }

    const success = await pm.playPrevious();

    if (!success) {
      return this._reply(
        context,
        this._createErrorContainer(phrases.get("errorGeneric")),
      );
    }

    const previousTrack = pm.currentTrack;
    if (!previousTrack) {
      return this._reply(
        context,
        this._createErrorContainer(phrases.get("errorGeneric")),
      );
    }

    const content = i18n.cmd("**Playing Previous Track**") + "\n\n" +
      i18n.cmd("└─ **{emoji} Title:** {title}", { emoji: (emoji as any).get("music") || "🎵", title: previousTrack.info.title }) + "\n" +
      i18n.cmd("└─ **{emoji} Artist:** {author}", { emoji: (emoji as any).get("folder") || "📁", author: previousTrack.info.author || i18n.cmd("Unknown") }) + "\n" +
      i18n.cmd("└─ **{emoji} Duration:** {duration}", { emoji: (emoji as any).get("info") || "ℹ️", duration: this._formatDuration(previousTrack.info.duration) });

    const container = buildContainer({
      title: "Playing Previous Track",
      content: content,
      thumbnail: previousTrack.info.artworkUrl || config.assets?.defaultTrackArtwork,
      icon: (emoji as any).get("music") || "ℹ️"
    } as any);

    return this._reply(context, container);
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

  _createErrorContainer(message: string) {
    return buildError(message);
  }

  async _reply(context: any, container: any) {
    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    };
    if (context.editReply && (context.deferred || context.replied)) {
      return await context.editReply(payload);
    }
    return await (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload);
  }
}

export default new PreviousCommand();

// Made by Nikhil Under CodeX Devs
