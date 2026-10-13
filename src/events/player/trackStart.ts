import type { Player, Track, LavalinkManager } from 'lavalink-client';
import type { YunaClient } from '#core/YunaClient';
import { AttachmentBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder } from 'discord.js';
import { EventUtils } from '#utils/EventUtils';
import { db } from '#database/Database';
import { PlayerManager } from '#audio/PlayerManager';
import MusicCard from '#ui/cards/MusicCard';
import { logger } from '#utils/logger';
import { DiscordLogger } from '#utils/DiscordLogger';
import { createPlayerContainer } from '#ui/Components';

export default {
  name: "trackStart",
  once: false,
  async execute(player: Player, track: Track, _payload: any, _lavalink: LavalinkManager, client: YunaClient) {
    try {
      if (!track || !track.info) {
        logger.error('TrackStart', 'Invalid track data received:', track);
        return;
      }

      player.set('lastPlayedTrack', track);
      player.set('controlMode', 'default');
      EventUtils.clearPlayerTimeout(player, 'disconnectTimeoutId');
      new PlayerManager(player).saveSession();

      DiscordLogger.logMusic(client, { event: 'Track Started', guild: client.guilds.cache.get(player.guildId), track, requester: track.requester });

      if (!player.get('sessionStartTime')) {
        player.set('sessionStartTime', Date.now());
        player.set('totalTracksPlayed', 0);
      }

      const currentCount = player.get<number>('totalTracksPlayed') || 0;
      player.set('totalTracksPlayed', currentCount + 1);

      if (track.requester?.id && track.info.identifier) {
        try {
          db.user.addTrackToHistory(track.requester.id, track.info);
          db.stats.logTrackPlay(track.requester.id, track.info);
        } catch (historyError: any) {
          logger.error('TrackStart', 'Error adding track to history/stats:', historyError);
        }
      }

      const oldMessageId = player.get<string | null>('nowPlayingMessageId');
      const oldChannelId = player.get<string | null>('nowPlayingChannelId');
      EventUtils.clearPlayerInterval(player, 'updateInterval');
      if (oldMessageId && oldChannelId) {
        await EventUtils.deleteMessage(client, oldChannelId, oldMessageId).catch(() => {});
        player.set('nowPlayingMessageId', null);
        player.set('nowPlayingChannelId', null);
      }

      let message;
      const style = track.requester?.id ? db.getNpStyle(track.requester.id) : 'card';
      const isTextMode = style === 'text';

      player.set('controlMode', 'default');

      const container = createPlayerContainer('default', { isTextMode, track, position: player.position || 0 });

      try {
        if (isTextMode) {
          message = await EventUtils.sendPlayerMessage(client, player, {
            components: [container],
            flags: MessageFlags.IsComponentsV2
          });
        } else {
          const musicCard = new MusicCard();
          const requesterId = track.requester?.id;
          const isPremium = requesterId ? !!db.hasAnyPremium(requesterId, player.guildId) : false;
          const buffer = await musicCard.createMusicCard(track, 0, { isPremium });
          const attachment = new AttachmentBuilder(buffer, { name: 'yuna-nowplaying.png' });

          const cardContainer = createPlayerContainer('default', { isTextMode: false, track, position: 0, hasImage: true });

          message = await EventUtils.sendPlayerMessage(client, player, {
            files: [attachment],
            components: [cardContainer],
            flags: MessageFlags.IsComponentsV2
          });
        }
      } catch (err: any) {
        logger.error('TrackStart', 'Error creating player view:', err);

        const fallbackContainer = new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `🎵 **Now Playing**\n**${track.info.title}** by **${track.info.author}**`
          )
        );

        message = await EventUtils.sendPlayerMessage(client, player, {
          components: [fallbackContainer],
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (message?.id) {
        player.set('nowPlayingMessageId', message.id);
        player.set('nowPlayingChannelId', player.textChannelId);
        player.set('nowPlayingTextMode', isTextMode);

        EventUtils.startNowPlayingUpdater(client, player);
      }

      logger.info('TrackStart', `Track started: "${track.info.title}" by ${track.info.author} in guild ${player.guildId}`);
    } catch (error: any) {
      logger.error('TrackStart', 'Error in trackStart event:', error);
    }
  }
};

// Made by Nikhil Under CodeX Devs
