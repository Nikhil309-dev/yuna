import { Command } from '#core/Command';
import { db } from '#database/Database';
import { MessageFlags } from "discord.js";
import { buildError } from '#ui/Theme';
import { buildLikeAllCard } from '#ui/LibraryCards';
import phrases from "#utils/phrases";

class LikeAllCommand extends Command {
  constructor() {
    super({
      name: "likeall",
      description: "Add all songs currently in the queue to your liked songs",
      usage: "likeall",
      aliases: ["loveall"],
      category: "music",
      cooldown: 5,
      access: {
        voice: true,
        player: true,
      },
      slash: {
        enabled: true,
        autoDefer: true,
        data: {
          name: "likeall",
          description: "Add all songs currently in the queue to your liked songs"
        }
      }
    });
  }

  async execute(ctx: any) {
    const { client, message, interaction } = ctx;
    const context = interaction || message;
    const userId = (context.user || context.author).id;
    return this._handleLikeAll(context, client, userId);
  }

  async slashExecute(ctx: any) {
    return this.execute(ctx);
  }

  async _handleLikeAll(context: any, client: any, userId: any) {
    const player = client.music?.getPlayer(context.guild?.id || context.guildId);

    if (!player || (!player.queue.current && player.queue.tracks.length === 0)) {
      return this._reply(context, buildError(phrases.get("noTrackPlaying")));
    }

    const all = [player.queue.current, ...player.queue.tracks].filter(Boolean);
    let addedCount = 0;
    let alreadyCount = 0;

    for (const track of all) {
      try {
        if ((db as any).liked.addLikedTrack(userId, track.info)) addedCount++;
        else alreadyCount++;
      } catch {
        alreadyCount++;
      }
    }

    return this._reply(context, buildLikeAllCard({
      addedCount,
      alreadyCount,
      total: all.length,
      userId,
    }));
  }

  async _reply(context: any, container: any) {
    const payload = { components: [container], flags: MessageFlags.IsComponentsV2 };
    if (context.editReply && (context.deferred || context.replied)) {
      return await context.editReply(payload);
    }
    return await (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload);
  }
}

export default new LikeAllCommand();

// Made by Nikhil Under CodeX Devs
