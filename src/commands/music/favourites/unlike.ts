import { Command } from '#core/Command';
import { db } from '#database/Database';
import { MessageFlags } from "discord.js";
import { buildError } from '#ui/Theme';
import { buildUnlikeCard } from '#ui/LibraryCards';
import phrases from "#utils/phrases";

class UnlikeCommand extends Command {
  constructor() {
    super({
      name: "unlike",
      description: "Remove the currently playing song from your liked songs",
      usage: "unlike",
      aliases: ["unlove"],
      category: "music",
      cooldown: 2,
      access: {
        voice: true,
        player: true,
        playing: true,
      },
      slash: {
        enabled: true,
        autoDefer: true,
        data: {
          name: "unlike",
          description: "Remove the currently playing song from your liked songs"
        }
      }
    });
  }

  async execute(ctx: any) {
    const { client, message, interaction } = ctx;
    const context = interaction || message;
    const userId = (context.user || context.author).id;
    return this._handleUnlike(context, client, userId);
  }

  async slashExecute(ctx: any) {
    return this.execute(ctx);
  }

  async _handleUnlike(context: any, client: any, userId: any) {
    const player = client.music?.getPlayer(context.guild?.id || context.guildId);
    const track = player?.queue?.current;

    if (!track) {
      return this._reply(context, buildError(phrases.get("noTrackPlaying")));
    }

    let removed;
    try {
      removed = (db as any).liked.removeLikedTrack(userId, track.info.identifier);
    } catch (err: any) {
      return this._reply(context, buildError(`Failed to remove from favorites: ${err.message}`));
    }

    return this._reply(context, buildUnlikeCard({ track: track.info, removed, userId }));
  }

  async _reply(context: any, container: any) {
    const payload = { components: [container], flags: MessageFlags.IsComponentsV2 };
    if (context.editReply && (context.deferred || context.replied)) {
      return await context.editReply(payload);
    }
    return await (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload);
  }
}

export default new UnlikeCommand();

// Made by Nikhil Under CodeX Devs
