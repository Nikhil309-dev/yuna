import type { Player, Track } from 'lavalink-client';
import type { YunaClient } from '#core/YunaClient';
import { logger } from "#utils/logger";
import { EventUtils } from "#utils/EventUtils";
import { MessageFlags } from "discord.js";
import musicSource from "#config/sources";
import { i18n } from "#utils/i18n";
import { buildError, buildResult } from "#ui/Theme";

export default {
  name: "trackError",
  once: false,
  async execute(player: Player, track: Track, payload: any, client: YunaClient) {
    try {
      logger.error('TrackException', `Lavalink encountered an error playing track in guild ${player.guildId}:`, {
        track: track?.info?.title || 'Unknown',
        exception: payload?.exception || payload,
        guildId: player.guildId
      });

      const errorMsg = payload?.exception?.message || payload?.error || i18n.cmd('Unknown Lavalink error');
      const title = track?.info?.title;
      const author = track?.info?.author;

      if (title && client?.music) {
        try {
          const cleanTitle = title.replace(/\(.*?\)|\[.*?\]|Official|Music|Video|Audio|HD|4K/gi, '').trim();
          const cleanAuthor = author ? author.replace(/VEVO|Official|Channel/gi, '').trim() : '';
          const searchQuery = `${cleanAuthor ? `${cleanAuthor} ` : ''}${cleanTitle}`;

          logger.info('TrackException', `Attempting stream recovery for "${searchQuery}" in guild ${player.guildId}`);

          let fallbackRes: any = null;
          let sourceUsed = '';

          const failingSource = String(track?.info?.sourceName || '').toLowerCase();
          const isYoutubeTrack = /youtube|\byt\b/.test(failingSource);
          const prefixes = musicSource.getPrefixList();
          const ordered = isYoutubeTrack ? prefixes.filter((p) => !p.startsWith('yt')) : prefixes;
          const candidates = ordered.length ? ordered : prefixes;
          for (const prefix of candidates) {
            try {
              const res = await client.music.search(searchQuery, { source: prefix.replace(':', '') });
              if (res?.tracks?.length) {
                fallbackRes = res;
                sourceUsed = prefix.replace(':', '');
                break;
              }
            } catch {  }
          }

          if (fallbackRes?.tracks?.length > 0) {
            const fallbackTrack = fallbackRes.tracks[0];

            const lastAttempt = player.get<string | null>('recoveryAttemptId');
            if (lastAttempt && lastAttempt === fallbackTrack.info.identifier) {
              logger.warn(
                'TrackException',
                `Recovery already attempted for "${fallbackTrack.info.title}"; stopping to avoid a retry loop.`,
              );
            } else {
              player.set('recoveryAttemptId', fallbackTrack.info.identifier);
              logger.info('TrackException', `Found ${sourceUsed} fallback stream: "${fallbackTrack.info.title}"`);

              await player.play({ clientTrack: fallbackTrack });

              const fallbackNotice = buildResult({
                title: 'Stream Recovery',
                icon: '🔄',
                accent: 0xFEE75C,
                avatarUrl: client?.user?.displayAvatarURL?.({ size: 128 }),
                blocks: [
                  { text: i18n.cmd("The original stream was blocked by the provider (bot protection).") },
                  { label: i18n.cmd("Original Track"), text: `🎵 **${title}**` },
                  { label: i18n.cmd("Auto-Fallback"), text: `⚡ Switched to **${sourceUsed}** stream automatically.` }
                ]
              });

              return await EventUtils.sendPlayerMessage(client, player, {
                components: [fallbackNotice],
                flags: MessageFlags.IsComponentsV2
              });
            }
          }
        } catch (fallbackErr) {
          logger.error('TrackException', 'Fallback resolution failed:', fallbackErr);
        }
      }

      const container = buildError({
        title: 'Playback Error',
        issue: i18n.cmd("I could not play **{title}**.", { title: track?.info?.title || i18n.cmd('this track') }),
        tip: i18n.cmd("Reason: {reason}", { reason: errorMsg }),
        support: true
      }, undefined, client?.user?.displayAvatarURL?.({ size: 128 }));

      await EventUtils.sendPlayerMessage(client, player, {
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });

    } catch (error: any) {
      logger.error('TrackError', 'Error in trackError event handler:', error);
    }
  }
};

// Made by Nikhil Under CodeX Devs
