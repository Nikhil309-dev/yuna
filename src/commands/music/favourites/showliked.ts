import { MessageFlags } from 'discord.js';
import { Command } from '#core/Command';
import { db } from '#database/Database';
import { componentCollectorSource } from '#ui/Components';
import { buildError } from '#ui/Theme';
import {
  buildLikedSongsContainer,
  buildLibraryExpiredCard,
  buildPlayLikedCard,
  likedPageCount,
  playLikedTracks,
} from '#ui/LibraryCards';
import { logger } from '#utils/logger';
import { i18n } from '#utils/i18n';
import phrases from '#utils/phrases';

class ShowLikedCommand extends Command {
  constructor() {
    super({
      name: "showliked",
      description: "View your liked songs",
      usage: "showliked [page]",
      aliases: ["liked", "myfavorites"],
      category: "music",
      cooldown: 3,
      slash: {
        enabled: true,
        autoDefer: true,
        data: {
          name: "showliked",
          description: "View your liked songs",
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

    const message = await this._reply(context, buildLikedSongsContainer({ tracks, user, page }));
    if (message && typeof message.createMessageComponentCollector === 'function') {
      this._setupCollector(message, user, tracks, page);
    }
    return message;
  }

  _setupCollector(message: any, user: any, tracks: any, initialPage: number) {
    const collector = componentCollectorSource(message).createMessageComponentCollector({ time: 300000 });
    let currentPage = Math.max(1, Math.min(initialPage, likedPageCount(tracks.length)));

    collector.on('collect', async (interaction: any) => {
      if (!interaction.customId.startsWith('liked_')) return;

      if (interaction.user.id !== user.id) {
        return interaction.reply({
          components: [buildError(phrases.get('notYourInteraction'))],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true,
        });
      }

      if (interaction.customId === 'liked_close') {
        return interaction.update({ components: [buildLibraryExpiredCard()] });
      }

      const [, action, pageStr] = interaction.customId.split('_');
      if (action === 'play') {
        const voiceChannel = interaction.member?.voice?.channel;
        await interaction.deferReply({ ephemeral: true });
        if (!voiceChannel) {
          return interaction.editReply({
            components: [buildError({
              issue: i18n.cmd("You must be in a voice channel to play your liked songs."),
              title: i18n.translateTitle("Voice Required"),
            })],
            flags: MessageFlags.IsComponentsV2,
          });
        }
        const result = await playLikedTracks({
          client: message.client,
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
          components: [buildPlayLikedCard(result)],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      if (action !== 'prev' && action !== 'next') return;

      await interaction.deferUpdate();
      const page = parseInt(pageStr, 10);
      currentPage = action === 'prev' ? page - 1 : page + 1;

      await interaction.editReply({
        components: [buildLikedSongsContainer({ tracks, user, page: currentPage })],
      });
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
