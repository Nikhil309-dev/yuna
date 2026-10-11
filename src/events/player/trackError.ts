import type { Player, Track, LavalinkNode, LavalinkManager } from 'lavalink-client';
import type { YunaClient } from '#core/YunaClient';
import { logger } from "#utils/logger";
import { EventUtils } from "#utils/EventUtils";
import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, ButtonBuilder, ButtonStyle, SectionBuilder } from "discord.js";
import emoji from "#config/emoji";
import musicSource from "#config/sources";
import { i18n } from "#utils/i18n";

export default {
  name: "trackError",
  once: false,
  async execute(player: Player, track: Track, payload: any, musicManager: LavalinkManager, client: YunaClient) {
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

          // Try every configured source prefix instead of hardcoding plugins
          // the Lavalink node may not have installed.
          let fallbackRes: any = null;
          let sourceUsed = '';
          // YouTube is skipped when the failing track *is* YouTube: the failure
          // is bot-protection (403 / "requires login"), so replaying it via
          // ytsearch fails identically and spins until Lavalink destroys the
          // player for too many errors.
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
            } catch { /* try the next source */ }
          }

          if (fallbackRes?.tracks?.length > 0) {
            const fallbackTrack = fallbackRes.tracks[0];

            // Guard against retry storms: if this exact fallback stream already
            // failed once, give up instead of looping until the player dies.
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

              const fallbackNotice = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🔄 **Stream Recovery Active**`))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(
                  new TextDisplayBuilder().setContent(
                    i18n.cmd("The original stream was blocked by the provider (bot protection).\n\n") +
                    i18n.cmd("├─ 🎵 **Original Track:** {title}\n", { title }) +
                    i18n.cmd("└─ ⚡ **Auto-Fallback:** Switched to {source} stream automatically!", { source: sourceUsed })
                  )
                );

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

      const button = new ButtonBuilder()
        .setLabel(i18n.cmd("Support"))
        .setURL("https://discord.gg/XYwwyDKhec")
        .setStyle(ButtonStyle.Link);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ⚠️ Playback Error`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(i18n.cmd("Lavalink failed to play: **{title}**\n\n**Reason:** {reason}", { title: track?.info?.title || i18n.cmd('Unknown'), reason: errorMsg }))
            )
            .setButtonAccessory(button)
        );

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
