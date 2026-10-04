import { AttachmentBuilder, MessageFlags } from 'discord.js';

import { Command, CommandContext } from '#core/Command';
import MusicCard from '#ui/cards/MusicCard';
import { db } from '#database/Database';
import { logger } from '#utils/logger';
import { buildError, buildSuccess } from '#ui/Theme';
import phrases from '#utils/phrases';
import { i18n } from "#utils/i18n";

class NowPlayingCommand extends Command {
  private musicCard: MusicCard;

  constructor() {
    super({
      name: 'nowplaying',
      description: 'Displays the currently playing song with a beautiful custom-designed visual card',
      usage: 'nowplaying',
      aliases: ['np'],
      category: 'music',
      examples: [
        'nowplaying',
        'np',
      ],
      cooldown: 5,
      access: {
        player: true,
        playing: true,
      },
      slash: {
        enabled: true,
        autoDefer: true,
        data: {
          name: 'nowplaying',
          description: 'Displays the currently playing song with a visual card',
        },
      },
    });

    this.musicCard = new MusicCard();
  }

  async execute(ctx: CommandContext) {
    const { client, message, interaction, player, pm, args = [] } = ctx;
    const context = interaction || message;
    return this._handleNowPlaying(client, context.guild.id, context);
  }

  async slashExecute(ctx: CommandContext) {
    return this.execute(ctx);
  }

  async _handleNowPlaying(client: any, guildId: any, context: any) {
    const player = client.music?.getPlayer(guildId);

    if (!player || !player.queue.current) {
      return this._replyError(context, phrases.get("noTrackPlaying"));
    }

    try {
      const track = player.queue.current;
      const userId = context.user?.id || context.author?.id;
      const isPremium = userId ? !!db.hasAnyPremium(userId, context.guild?.id) : false;
      const style = userId ? db.getNpStyle(userId) : 'card';
      const isTextMode = style === 'text';

      if (isTextMode) {
        const { createPlayerContainer } = await import('#ui/Components');
        const container = createPlayerContainer('default', {
          isTextMode: true,
          track,
          position: player.position
        });
        return await this._reply(context, { components: [container], flags: MessageFlags.IsComponentsV2 });
      }

      const buffer = await this.musicCard.createMusicCard(track, player.position, { isPremium });
      const attachment = new AttachmentBuilder(buffer, { name: 'yuna-nowplaying.png' });

      await this._reply(context, { files: [attachment] });
    } catch (error) {
      logger.error('NowPlayingCommand', `Failed to create or send canvas: ${(error as Error).message}`, error);
      return this._replyError(context, i18n.cmd('An error occurred while creating the Now Playing card.'));
    }
  }

  async _reply(context: any, payload: any) {
    try {
      if (context.editReply && (context.deferred || context.replied)) {
        return await context.editReply(payload);
      }
      return await (context.deferred || context.replied ? context!.editReply.bind(context) : context!.reply.bind(context))(payload);
    } catch (error) {
      logger.error('NowPlayingCommand', 'Failed to send reply in NowPlaying command:', error);
    }
  }

  async _replyError(context: any, message: string) {
    const container = buildError(message);
    const payload = { components: [container], flags: MessageFlags.IsComponentsV2 };
    if (context.editReply && (context.deferred || context.replied)) {
      return await context.editReply(payload);
    }
    return await (context.deferred || context.replied ? context!.editReply.bind(context) : context!.reply.bind(context))(payload);
  }
}

export default new NowPlayingCommand();

// Made by Nikhil Under CodeX Devs
