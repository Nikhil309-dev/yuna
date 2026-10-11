import { Command } from '#core/Command';
import { db } from '#database/Database';
import { MessageFlags } from "discord.js";
import { buildError } from '#ui/Theme';
import { buildLikeCard } from '#ui/LibraryCards';
import phrases from "#utils/phrases";

class LikeCommand extends Command {
  constructor() {
    super({
      name: "like",
      description: "Add the currently playing song to your liked songs",
      usage: "like",
      aliases: ["love", "favourite"],
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
          name: "like",
          description: "Add the currently playing song to your liked songs"
        }
      }
    });
  }

  async execute(ctx: any) {
    const { client, message, interaction } = ctx;
    const context = interaction || message;
    const userId = (context.user || context.author).id;
    return this._handleLike(context, client, userId);
  }

  async slashExecute(ctx: any) {
    return this.execute(ctx);
  }

  async _handleLike(context: any, client: any, userId: any) {
    const player = client.music?.getPlayer(context.guild?.id || context.guildId);
    const track = player?.queue?.current;

    if (!track) {
      return this._reply(context, buildError(phrases.get("noTrackPlaying")));
    }

    let added;
    try {
      added = (db as any).liked.addLikedTrack(userId, track.info);
    } catch (err: any) {
      return this._reply(context, buildError(`Failed to add to favorites: ${err.message}`));
    }

    return this._reply(context, buildLikeCard({ track: track.info, added, userId }));
  }

  async _reply(context: any, container: any) {
    const payload = { components: [container], flags: MessageFlags.IsComponentsV2 };
    if (context.editReply && (context.deferred || context.replied)) {
      return await context.editReply(payload);
    }
    return await (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload);
  }
}

export default new LikeCommand();

// Made by Nikhil Under CodeX Devs
