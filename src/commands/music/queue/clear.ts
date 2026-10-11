import {
  MessageFlags} from "discord.js";

import { config } from "#config/config";
import { Command } from '#core/Command';
import { buildContainer, buildError } from '#ui/Theme';
import { logger } from "#utils/logger";
import emoji from "#config/emoji";
import { PlayerManager } from '#audio/PlayerManager';
import { i18n } from "#utils/i18n";

class ClearCommand extends Command {
  constructor() {
    super({
      name: "clear",
      description: "Clear all upcoming tracks from the queue",
      usage: "clear",
      aliases: ["cq", "clearqueue"],
      category: "music",
      examples: ["clear", "cq"],
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
          name: "clear",
          description: "Clear all upcoming tracks from the queue",
        },
      },
    });
  }

  async execute(ctx: any) {
    const { client, message, interaction, player, pm } = ctx;
    const context = interaction || message;
    const activePm = pm || (player ? new PlayerManager(player) : (client?.music?.getPlayer(context.guildId || context.guild?.id) ? new PlayerManager(client.music.getPlayer(context.guildId || context.guild?.id)) : null));
    if (!activePm) return;
    return this._handleclear(context, activePm);
  }

  async slashExecute(ctx: any) {
    return this.execute(ctx);
  }

  async _handleclear(context: any, pm: any) {
    if (pm.queueSize === 0) {
      return this._reply(
        context,
        this._createErrorContainer(i18n.cmd("There are no tracks in the queue to clear.")),
      );
    }
    const size = pm.queueSize;
    await pm.clearQueue();

    const container = this._createSuccessContainer(pm, size);
    return await this._reply(context, container);
  }

  _createSuccessContainer(pm: any, size: any) {
    const content = i18n.cmd("Cleared **{count}** tracks from the queue.", { count: size });
    const current = pm.player?.queue?.current;
    return buildContainer({ image: undefined,
      title: i18n.translateTitle("Queue Cleared"),
      content: content,
      thumbnail: current?.info?.artworkUrl || config.assets.defaultTrackArtwork,
      icon: emoji.get("music") || "🎵"
    });
  }

  _createErrorContainer(message: string) {
    return buildError(message);
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
      logger.error("clear", "Failed to reply in clear command:", e);
      return null;
    }
  }
}

export default new ClearCommand();

// Made by Nikhil Under CodeX Devs
