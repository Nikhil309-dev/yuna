import { MessageFlags } from 'discord.js';
import { Command } from '#core/Command';
import { db } from '#database/Database';
import { componentCollectorSource } from '#ui/Components';
import { buildError, buildSuccess } from '#ui/Theme';
import {
  buildFavoriteSelector,
  buildFavoriteTrackCard,
  buildLibraryExpiredCard,
  buildPlayAllCard,
  buildQueueResultCard,
  playLikedTracks,
  queueLikedTrack,
  FAV_OPTIONS_PER_PAGE,
} from '#ui/LibraryCards';
import { logger } from '#utils/logger';
import { i18n } from '#utils/i18n';
import phrases from '#utils/phrases';

class ShowLikedCommand extends Command {
  constructor() {
    super({
      name: "showliked",
      description: "View and manage your liked songs",
      usage: "showliked [page]",
      aliases: ["liked", "myfavorites"],
      category: "music",
      cooldown: 3,
      slash: {
        enabled: true,
        autoDefer: true,
        data: {
          name: "showliked",
          description: "View and manage your liked songs",
          options: [
            {
              name: "page",
              description: "The page number to view",
              type: 4,
              required: false,
            },
          ],
        }
      }
    });
  }

  async execute(ctx: any) {
    const { message, interaction, args = [] } = ctx;
    const context = interaction || message;
    const user = context.user || context.author;
    const page = interaction
      ? (interaction.options?.getInteger("page") || 1)
      : (args[0] ? parseInt(args[0], 10) : 1);
    return this._handleShowLiked(context, user, isNaN(page) ? 1 : page);
  }

  async slashExecute(ctx: any) {
    return this.execute(ctx);
  }

  async _handleShowLiked(context: any, user: any, page: number) {
    const tracks = (db as any).liked.getUserLiked(user.id);
    if (tracks.length === 0) {
      return this._reply(context, buildError(phrases.get("noLikedTracks"), "No Liked Songs"));
    }

    const message = await this._reply(
      context,
      buildFavoriteSelector({ tracks: this._dedupe(tracks), user, page }),
    );
    if (message && typeof message.createMessageComponentCollector === 'function') {
      this._setupCollector(message, user, page);
    }
    return message;
  }

  _dedupe(tracks: any[]) {
    const seen = new Set<string>();
    return tracks.filter((t: any) => {
      const key = String(t?.identifier ?? t?.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  _setupCollector(message: any, user: any, initialPage: number) {
    const client = message.client;
    const collector = componentCollectorSource(message).createMessageComponentCollector({ time: 300000 });

    let selected: any = null;

    collector.on('collect', async (interaction: any) => {
      if (!interaction.customId.startsWith('fav_')) return;

      if (interaction.user.id !== user.id) {
        return interaction.reply({
          components: [buildError(phrases.get('notYourInteraction'))],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        });
      }

      const tracks = this._dedupe((db as any).liked.getUserLiked(user.id));
      const parts = interaction.customId.split('_');
      const action = parts[1];
      const pageArg = parseInt(parts[2], 10);

      const renderSelector = () => {
        const totalPages = Math.ceil(tracks.length / FAV_OPTIONS_PER_PAGE) || 1;
        return buildFavoriteSelector({
          tracks,
          user,
          page: Math.max(1, Math.min(isNaN(pageArg) ? 1 : pageArg, totalPages)),
        });
      };

      try {
        switch (action) {
          case 'select': {
            const identifier = interaction.values?.[0];
            selected = tracks.find((t: any) => String(t.identifier) === identifier) || null;
            if (!selected) return interaction.deferUpdate();
            return interaction.update({
              components: [buildFavoriteTrackCard({ track: selected, user })],
            });
          }

          case 'back':
            return interaction.update({ components: [renderSelector()] });

          case 'prev':
          case 'next': {
            await interaction.deferUpdate();
            const target = action === 'prev' ? pageArg - 1 : pageArg + 1;
            const totalPages = Math.ceil(tracks.length / FAV_OPTIONS_PER_PAGE) || 1;
            const page = Math.max(1, Math.min(target, totalPages));
            return interaction.editReply({
              components: [buildFavoriteSelector({ tracks, user, page })],
            });
          }

          case 'close':
            return interaction.update({ components: [buildLibraryExpiredCard()] });

          case 'playall': {
            const voiceChannel = interaction.member?.voice?.channel;
            await interaction.deferReply({ ephemeral: true });
            if (!voiceChannel) {
              return interaction.editReply({
                components: [buildError({ issue: i18n.cmd("You must be in a voice channel to play your liked songs."), title: i18n.translateTitle("Voice Required") })],
                flags: MessageFlags.IsComponentsV2,
              });
            }
            const result = await playLikedTracks({
              client,
              userId: user.id,
              requester: interaction.user,
              voiceChannel,
              textChannelId: interaction.channel?.id,
              guildId: interaction.guild?.id,
            });
            if (result.reason === 'empty') {
              return interaction.editReply({
                components: [buildError(phrases.get('noLikedTracks'), "No Liked Songs")],
                flags: MessageFlags.IsComponentsV2,
              });
            }
            return interaction.editReply({
              components: [buildPlayAllCard(result)],
              flags: MessageFlags.IsComponentsV2,
            });
          }

          case 'playnext':
          case 'queue':
          case 'playnow': {
            const track = selected;
            if (!track) {
              return interaction.reply({
                components: [buildError(i18n.cmd('That song is no longer in your library.'), i18n.translateTitle('Track Missing'))],
                flags: MessageFlags.IsComponentsV2,
                ephemeral: true,
              });
            }
            const voiceChannel = interaction.member?.voice?.channel;
            await interaction.deferReply({ ephemeral: true });
            if (!voiceChannel) {
              return interaction.editReply({
                components: [buildError({ issue: i18n.cmd("You must be in a voice channel to play your liked songs."), title: i18n.translateTitle("Voice Required") })],
                flags: MessageFlags.IsComponentsV2,
              });
            }
            const result = await queueLikedTrack({
              client,
              stored: track,
              requester: interaction.user,
              voiceChannel,
              textChannelId: interaction.channel?.id,
              guildId: interaction.guild?.id,
              mode: action,
            });
            if (!result.ok) {
              return interaction.editReply({
                components: [buildError(i18n.cmd('Could not resolve that track right now. Try again in a moment.'), i18n.translateTitle('Track Unavailable'))],
                flags: MessageFlags.IsComponentsV2,
              });
            }
            return interaction.editReply({
              components: [buildQueueResultCard({ mode: action, title: track.title, ok: true })],
              flags: MessageFlags.IsComponentsV2,
            });
          }

          case 'remove': {
            const track = selected;
            if (!track) return interaction.deferUpdate();
            (db as any).liked.removeLikedTrack(user.id, track.identifier);
            selected = null;
            const remaining = this._dedupe((db as any).liked.getUserLiked(user.id));
            if (remaining.length === 0) {
              return interaction.update({ components: [buildSuccess({
                message: i18n.cmd('Removed **{name}** from your liked songs.', { name: track.title }),
                detail: i18n.cmd('Your favorites list is now empty.'),
              }, i18n.translateTitle('Song Unliked'))] });
            }
            return interaction.update({ components: [renderSelector()] });
          }

          default:
            return interaction.deferUpdate();
        }
      } catch (err: any) {
        logger.error('ShowLiked', `Interaction failed: ${err.message}`, err);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.deferUpdate().catch(() => {});
        }
      }
    });

    collector.on('end', async () => {
      try {
        await message.edit({ components: [buildLibraryExpiredCard()], flags: MessageFlags.IsComponentsV2 });
      } catch (error: any) {
        if (error.code !== 10008) {
          logger.error('ShowLiked', i18n.cmd('Failed to clear components on end'), error);
        }
      }
    });
  }

  async _reply(context: any, container: any) {
    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true,
    };
    if (context.replied || context.deferred) return context.editReply(payload);
    return (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload);
  }
}

export default new ShowLikedCommand();

// Made by Nikhil Under CodeX Devs
