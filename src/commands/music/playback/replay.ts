import {
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";

import { config } from '#config/config';
import { Command, CommandContext } from '#core/Command';
import { buildContainer, buildError } from '#ui/Theme';
import emoji from '#config/emoji';
import phrases from '#utils/phrases';
import { i18n } from '#utils/i18n';
import { PlayerManager } from '#audio/PlayerManager';

class ReplayCommand extends Command {
  constructor() {
    super({
      name: 'replay',
      description: 'Replay the current track from the beginning (not available for live streams)',
      usage: 'replay',
      aliases: ['restart'],
      category: 'music',
      examples: [
        'replay',
        'restart',
      ],
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
          name: 'replay',
          description: 'Replay the current track from the beginning',
        },
      },
    });
  }

  async execute(ctx: CommandContext) {
    const { client, message, interaction, player, pm, args = [] } = ctx;
    const context = interaction || message;
    const activePm = pm || (player ? new PlayerManager(player) : (client?.music?.getPlayer(context.guildId || context.guild?.id) ? new PlayerManager(client.music.getPlayer(context.guildId || context.guild?.id)) : null));
    if (!activePm) return;
    return this._handleReplay(context, activePm);
  }

  async slashExecute(ctx: CommandContext) {
    return this.execute(ctx);
  }

  async _handleReplay(context: CommandContext, pm: PlayerManager) {
    const { currentTrack } = pm;

    if (currentTrack.info.isStream) {
      return this._reply(context, this._createErrorContainer(phrases.get('seekInvalid')));
    }

    try {
      await pm.replay();
    } catch (err: any) {
      return this._reply(context, this._createErrorContainer(i18n.cmd("Failed to replay: {error}", { error: err.message })));
    }

    const replayNote = phrases.get('replaySuccess');
    const content = i18n.cmd("**Track Information**") + "\n\n" +
      i18n.cmd("└─ **{emoji} Title:** {title}", { emoji: emoji.get('music'), title: currentTrack.info.title }) + "\n" +
      i18n.cmd("└─ **{emoji} Artist:** {author}", { emoji: emoji.get('folder'), author: currentTrack.info.author || i18n.cmd("Unknown") }) + "\n" +
      i18n.cmd("└─ **{emoji} Duration:** {duration}", { emoji: emoji.get('info'), duration: this._formatDuration(currentTrack.info.duration) }) + "\n" +
      i18n.cmd("└─ **{emoji} Status:** Playback restarted", { emoji: emoji.get('check') }) + "\n\n" +
      `*${replayNote}*`;

    const container = buildContainer({
      title: i18n.translateTitle("Track Replayed"),
      content: content,
      thumbnail: currentTrack.info.artworkUrl || config.assets.defaultTrackArtwork,
      icon: emoji.get("music") || "ℹ️"
    });

    if (currentTrack.requester?.id) {
      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const requesterContent = i18n.cmd("**Request Information**") + "\n\n" +
        i18n.cmd("└─ **{emoji} Requested by:** <@{user}>", { emoji: emoji.get('add'), user: currentTrack.requester.id }) + "\n" +
        i18n.cmd("└─ **{emoji} Action:** Track replayed", { emoji: emoji.get('reset') }) + "\n" +
        i18n.cmd("└─ **{emoji} Status:** Now playing from start", { emoji: emoji.get('check') }) + "\n\n" +
        i18n.cmd("*Original request information preserved*");

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(requesterContent)
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork)
          )
      );
    }

    return this._reply(context, container);
  }

  _formatDuration(duration: any) {
    if (!duration || duration < 0) return 'Live';
    const hours = Math.floor(duration / 3600000);
    const minutes = Math.floor((duration % 3600000) / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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

export default new ReplayCommand();

// Made by Nikhil Under CodeX Devs
