import { Command } from '#core/Command';
import { MessageFlags } from "discord.js";
import { buildError } from '#ui/Theme';
import { buildPlayLikedCard, playLikedTracks } from '#ui/LibraryCards';
import phrases from "#utils/phrases";
import { i18n } from '#utils/i18n';

class PlayLikedCommand extends Command {
  constructor() {
    super({
      name: "playliked",
      description: "Play all your liked songs",
      usage: "playliked",
      aliases: ["pl"],
      category: "music",
      cooldown: 5,
      access: {
        voice: true,
      },
      slash: {
        enabled: true,
        autoDefer: true,
        data: {
          name: "playliked",
          description: "Play all your liked songs"
        }
      }
    });
  }

  async execute(ctx: any) {
    const { client, message, interaction } = ctx;
    const context = interaction || message;
    const voiceChannel = context.member?.voice?.channel;
    const userId = (context.user || context.author).id;
    return this._handlePlayLiked(context, client, userId, voiceChannel);
  }

  async slashExecute(ctx: any) {
    return this.execute(ctx);
  }

  async _handlePlayLiked(context: any, client: any, userId: any, voiceChannel: any) {
    if (!voiceChannel) {
      return this._reply(context, buildError({
        issue: i18n.cmd("You must be in a voice channel to play your liked songs."),
        title: i18n.translateTitle("Voice Required"),
      }));
    }

    const result = await playLikedTracks({
      client,
      userId,
      requester: context.user || context.author,
      voiceChannel,
      textChannelId: context.channel?.id,
      guildId: context.guild?.id || context.guildId,
    });

    if (result.reason === 'empty') {
      return this._reply(context, buildError(phrases.get("noLikedTracks"), "No Liked Songs"));
    }

    return this._reply(context, buildPlayLikedCard(result));
  }

  async _reply(context: any, container: any) {
    const payload = { components: [container], flags: MessageFlags.IsComponentsV2 };
    if (context.editReply && (context.deferred || context.replied)) {
      return await context.editReply(payload);
    }
    return await (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload);
  }
}

export default new PlayLikedCommand();

// Made by Nikhil Under CodeX Devs
