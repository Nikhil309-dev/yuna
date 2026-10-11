import type { Player, Track } from 'lavalink-client';
import type { YunaClient } from '#core/YunaClient';
import { logger } from "#utils/logger";
import { db } from '#database/Database';
import { config } from "#config/config";
import { PlayerManager } from "#audio/PlayerManager";
import { EventUtils } from "#utils/EventUtils";
import { buildYunaContainer } from '#ui/Theme';
import { ContainerBuilder, TextDisplayBuilder, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import emoji from "#config/emoji";
import AutoplayEngine from "#audio/AutoplayEngine";
import { i18n } from "#utils/i18n";

let autoplayEngine: AutoplayEngine | null = null;

export default {
  name: "queueEnd",
  once: false,
  async execute(player: Player, track: Track, client: YunaClient) {
    try {
      logger.info('QueueEnd', `Queue ended in guild ${player.guildId}`);

      const messageId = player.get<string | null>('nowPlayingMessageId');
      const channelId = player.get<string | null>('nowPlayingChannelId');
      EventUtils.clearPlayerTimeout(player, 'stuckTimeoutId');
      EventUtils.clearPlayerInterval(player, 'updateInterval');

      if (messageId && channelId) {
        await EventUtils.deleteMessage(client, channelId, messageId).catch(() => {});
        player.set('nowPlayingMessageId', null);
        player.set('nowPlayingChannelId', null);
      }

      const autoplayEnabled = player.get<boolean>('autoplayEnabled') || false;
      const lastTrack = player.get<Track | null>('lastPlayedTrack') || track;

      if (autoplayEnabled && lastTrack) {
        logger.info('QueueEnd', `Autoplay enabled - attempting to add similar tracks for guild ${player.guildId}`);

        try {
          await handleAutoplay(player, lastTrack, client);
          return;
        } catch (autoplayError: any) {
          logger.error('QueueEnd', 'Autoplay failed:', autoplayError);

          const failContainer = buildYunaContainer({
            title: "Autoplay Failed",
            content: i18n.cmd("Unable to find similar songs. Queue has ended.\n\n") +
                     i18n.cmd("├─ **Reason:** {reason}\n", { reason: autoplayError.message || i18n.cmd('Unknown error') }) +
                     i18n.cmd("└─ **Tip:** Try playing a different song and enable autoplay again."),
            thumbnail: config.assets?.defaultThumbnail,
            icon: "⚠️"
          });

          await EventUtils.sendPlayerMessage(client, player, {
            components: [failContainer],
            flags: MessageFlags.IsComponentsV2
          });
        }
      }

      let shouldDisconnect = true;
      let is247Mode = false;

      try {
        const guild247Settings = db.guild.get247Settings(player.guildId);
        is247Mode = guild247Settings.enabled;
        shouldDisconnect = !is247Mode && guild247Settings.autoDisconnect;

        logger.debug('QueueEnd', `Guild ${player.guildId} settings: 24/7 = ${is247Mode}, autoDisconnect = ${guild247Settings.autoDisconnect}`);
      } catch (dbError) {
        logger.debug('QueueEnd', 'Could not check guild disconnect settings:', dbError);
      }

      let content = i18n.cmd("**All songs in the queue have finished playing.**\n\n");
      if (is247Mode) {
        content += i18n.cmd("├─ **{emoji} Mode:** 24/7 Active\n", { emoji: emoji.get("info") || '♾️' });
        content += i18n.cmd("└─ **{emoji} Status:** Staying connected to voice channel\n", { emoji: emoji.get("check") || '✅' });
      } else if (shouldDisconnect) {
        content += i18n.cmd("├─ **{emoji} Timeout:** 3 minutes\n", { emoji: emoji.get("info") || '⏰' });
        content += i18n.cmd("└─ **{emoji} Action:** Disconnecting soon to save resources\n", { emoji: emoji.get("cross") || '👋' });
      } else {
        content += i18n.cmd("└─ **{emoji} Status:** Awaiting new songs\n", { emoji: emoji.get("check") || '✅' });
      }

      const button = new ButtonBuilder()
        .setLabel(i18n.cmd("Yuna Music"))
        .setURL(config.links?.supportServer || "https://discord.gg/XYwwyDKhec")
        .setStyle(ButtonStyle.Link);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🏁 Queue Complete`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
            .setButtonAccessory(button)
        );

      const completionMessage = await EventUtils.sendPlayerMessage(client, player, {
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });

      if (completionMessage?.id) {
        player.set('queueEndMessageId', completionMessage.id);
      }

      clearStoredMessageIds(player);

      if (shouldDisconnect && !is247Mode) {
        logger.info('QueueEnd', `Autoplay disabled & queue empty - waiting 3min before disconnect for guild ${player.guildId}`);

        const timeoutId = setTimeout(async () => {
          try {
            const currentPlayer = client.music?.getPlayer(player.guildId);
            if (!currentPlayer || currentPlayer.playing || currentPlayer.queue.current) return;

            const totalTracks = currentPlayer.get<number>('totalTracksPlayed') || 0;
            const sessionStartTime = currentPlayer.get<number | null>('sessionStartTime');
            let durationString = '';
            if (sessionStartTime) {
              const minutes = Math.floor((Date.now() - sessionStartTime) / 60000);
              durationString = ` in ${minutes} minutes`;
            }

            const dcContainer = new ContainerBuilder()
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 👋 Disconnected`))
              .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  i18n.cmd("Queue finished. Disconnected from voice channel.\n\n") +
                  i18n.cmd("🎵 **Session Summary:**\n") +
                  i18n.cmd("Played **{count}** tracks{duration}.", { count: totalTracks, duration: durationString })
                )
              );

            await EventUtils.sendPlayerMessage(client, currentPlayer, {
              components: [dcContainer],
              flags: MessageFlags.IsComponentsV2
            }).catch(() => {});

            await currentPlayer.destroy();
          } catch (dcError) {
            logger.error('QueueEnd', 'Error during delayed disconnect:', dcError);
          }
        }, 180_000);

        player.set('disconnectTimeoutId', timeoutId);
        return;
      } else if (is247Mode) {
        logger.info('QueueEnd', `24/7 mode active - keeping connection for guild ${player.guildId}`);
        player.set('247Mode', true);

        EventUtils.clearPlayerTimeout(player, 'disconnectTimeoutId');
      }

      logSessionStats(player);

    } catch (error: any) {
      logger.error('QueueEnd', 'Error in queueEnd event:', error);

      try {
        const fallbackButton = new ButtonBuilder()
          .setLabel("Support")
          .setURL("https://discord.gg/XYwwyDKhec")
          .setStyle(ButtonStyle.Link);

        const fallbackContainer = new ContainerBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🏁 Queue Complete`))
          .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
          .addSectionComponents(
            new SectionBuilder()
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(`🏁 **Queue finished.** Use a music command to start playing again.`))
              .setButtonAccessory(fallbackButton)
          );

        await EventUtils.sendPlayerMessage(client, player, {
          components: [fallbackContainer],
          flags: MessageFlags.IsComponentsV2
        });
      } catch (fallbackError) {
        logger.error('QueueEnd', 'Even fallback queue end message failed:', fallbackError);
      }
    }
  }
};

async function handleAutoplay(player: Player, lastTrack: Track, client: YunaClient) {
  if (!lastTrack?.info) {
    throw new Error('No valid last track for autoplay');
  }

  logger.info('QueueEnd', `Autoplay: Finding next recommendation for "${lastTrack.info.title}" by ${lastTrack.info.author}`);

  if (!autoplayEngine) {
    autoplayEngine = new AutoplayEngine(client as any);
  }

  const recommendations = await autoplayEngine.getRecommendations(player, lastTrack, 3);

  if (!recommendations?.length) {
    throw new Error(i18n.cmd('No similar tracks found for "{title}" by {author}', { title: lastTrack.info.title, author: lastTrack.info.author }));
  }

  const rec = recommendations[0];
  const pm = new PlayerManager(player);

  let trackInfoToAdd = rec.trackInfo;
  if (!trackInfoToAdd) {
    const query = `${rec.artist} ${rec.name}`;
    const searchResult = await client.music.search(query, { source: "spsearch" });
    if (searchResult?.tracks?.length > 0) {
      trackInfoToAdd = searchResult.tracks[0];
    }
  }

  if (!trackInfoToAdd) {
    throw new Error(i18n.cmd('Failed to resolve autoplay track for "{name}" by {artist}', { name: rec.name, artist: rec.artist }));
  }

  await pm.addTracks(trackInfoToAdd);
  player.set('autoplayEnabled', true);

  if (!player.playing && !player.paused && player.queue.tracks.length > 0) {
    try {
      await player.play({ noReplace: false });
      logger.info('QueueEnd', `Autoplay: Started playback of next recommended track in guild ${player.guildId}`);
    } catch (playError) {
      logger.error('QueueEnd', 'Autoplay: Failed to start playback:', playError);
      try {
        const nextTrack = player.queue.tracks[0];
        if (nextTrack) {
          await player.play({ clientTrack: nextTrack });
        }
      } catch (altPlayError) {
        logger.error('QueueEnd', 'Autoplay: Alternative play also failed:', altPlayError);
      }
    }
  }

  logger.info('QueueEnd', `Autoplay added "${trackInfoToAdd.info.title}" to guild ${player.guildId}`);
}





function clearStoredMessageIds(player: Player) {
  player.set('nowPlayingMessageId', null);
  player.set('nowPlayingChannelId', null);
  player.set('stuckWarningMessageId', null);
  player.set('errorMessageId', null);
  player.set('stuckTimeoutId', null);
}

function logSessionStats(player: Player) {
  try {
    const sessionStats = {
      guildId: player.guildId,
      totalTracksPlayed: player.get<number>('totalTracksPlayed') || 0,
      sessionDuration: Date.now() - (player.get<number | null>('sessionStartTime') || Date.now()),
      endTime: new Date().toISOString(),
      autoplayEnabled: player.get<boolean>('autoplayEnabled') || false
    };

    logger.info('QueueEnd', `Session completed in guild ${player.guildId}:`, sessionStats);
  } catch (statsError) {
    logger.debug('QueueEnd', 'Error logging session stats:', statsError);
  }
}

// Made by Nikhil Under CodeX Devs
