import { AttachmentBuilder, MessageFlags } from 'discord.js';

import { Command, CommandContext } from '#core/Command';
import MusicCard from '#ui/cards/MusicCard';
import { db } from '#database/Database';
import { logger } from '#utils/logger';
import { buildError, buildSuccess } from '#ui/Theme';
import phrases from '#utils/phrases';
import { i18n } from "#utils/i18n";

class GrabCommand extends Command {
  public musicCard: MusicCard;

  constructor() {
    super({
      name: 'grab',
      description: 'Sends the currently playing song to your Direct Messages',
      usage: 'grab',
      aliases: ['save'],
      category: 'music',
      examples: [
        'grab',
        'save',
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
          name: 'grab',
          description: 'Saves the currently playing song to your DMs',
        },
      },
    });

    this.musicCard = new MusicCard();
  }

  async execute(ctx: CommandContext) {
    const { client, message, interaction } = ctx;
    const context = interaction || message;
    return this._handleGrab(client, context.guild?.id, context);
  }

  async slashExecute(ctx: CommandContext) {
    return this.execute(ctx);
  }

  async _handleGrab(client: any, guildId: any, context: any) {
    const player = client.music?.getPlayer(guildId);

    if (!player || !player.queue.current) {
      return this._replyError(context, phrases.get("noTrackPlaying"));
    }

    try {
      const track = player.queue.current;
      const user = context.user || context.author;
      const isPremium = user.id ? !!db.hasAnyPremium(user.id, context.guild?.id) : false;
      const style = user.id ? db.getNpStyle(user.id) : 'card';
      const isTextMode = style === 'text';

      let dmPayload: any = {};

      if (isTextMode) {
        const { createPlayerContainer } = await import('#ui/Components');
        const container = createPlayerContainer('default', {
          isTextMode: true,
          track,
          position: player.position
        });
        dmPayload = { components: [container] };
      } else {
        const buffer = await this.musicCard.createMusicCard(track, player.position, { isPremium });
        const attachment = new AttachmentBuilder(buffer, { name: 'yuna-saved.png' });
        dmPayload = { files: [attachment] };
      }

      let dmSuccess = false;
      try {
        await user.send(dmPayload);
        dmSuccess = true;
      } catch (dmErr) {
        logger.warn('GrabCommand', `Failed to DM user ${user.id}`, dmErr);
        return this._replyError(context, 'I could not send you a DM. Please check your privacy settings!');
      }

      if (dmSuccess) {
        const successContainer = buildSuccess(`Sent **${track.info.title}** to your DMs! 📬`, "Track Saved");
        await this._reply(context, { components: [successContainer], flags: MessageFlags.IsComponentsV2 });
      }

    } catch (error: any) {
      logger.error('GrabCommand', `Failed to grab track: ${error.message}`, error);
      return this._replyError(context, i18n.cmd('An error occurred while grabbing the track.'));
    }
  }

  async _reply(context: any, payload: any) {
    try {
      if (context.editReply && (context.deferred || context.replied)) {
        return await context.editReply(payload);
      }
      return await (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload);
    } catch (error) {
      logger.error('GrabCommand', 'Failed to send reply in Grab command:', error);
    }
  }

  async _replyError(context: any, message: string) {
    const container = buildError(message);
    const payload = { components: [container], flags: MessageFlags.IsComponentsV2 };
    if (context.editReply && (context.deferred || context.replied)) {
      return await context.editReply(payload);
    }
    return await (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload);
  }
}

export default new GrabCommand();

// Made by Nikhil Under CodeX Devs
