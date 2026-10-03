import type { Player, Track, LavalinkNode, LavalinkManager } from 'lavalink-client';
import type { YunaClient } from '#core/YunaClient';
import { logger } from "#utils/logger";
import { EventUtils } from "#utils/EventUtils";
import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, ButtonBuilder, ButtonStyle, SectionBuilder } from "discord.js";
import emoji from "#config/emoji";

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

      const errorMsg = payload?.exception?.message || payload?.error || 'Unknown Lavalink error';
      const title = track?.info?.title;
      const author = track?.info?.author;

      if (title && client?.music) {
        try {
          const cleanTitle = title.replace(/\(.*?\)|\[.*?\]|Official|Music|Video|Audio|HD|4K/gi, '').trim();
          const cleanAuthor = author ? author.replace(/VEVO|Official|Channel/gi, '').trim() : '';
          const searchQuery = `${cleanAuthor ? `${cleanAuthor} ` : ''}${cleanTitle}`;

          logger.info('TrackException', `Attempting stream recovery for "${searchQuery}" in guild ${player.guildId}`);

          let fallbackRes = await client.music.search(`jssearch:${searchQuery}`);
          let sourceUsed = 'JioSaavn';

          if (!fallbackRes?.tracks?.length) {
            fallbackRes = await client.music.search(`scsearch:${searchQuery}`);
            sourceUsed = 'SoundCloud';
          }

          if (fallbackRes?.tracks?.length > 0) {
            const fallbackTrack = fallbackRes.tracks[0];
            logger.info('TrackException', `Found ${sourceUsed} fallback stream: "${fallbackTrack.info.title}"`);

            await player.play({ clientTrack: fallbackTrack });

            const fallbackNotice = new ContainerBuilder()
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🔄 **Stream Recovery Active**`))
              .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  `YouTube stream was blocked (HTTP 403 / bot protection).\n\n` +
                  `├─ 🎵 **Original Track:** ${title}\n` +
                  `└─ ⚡ **Auto-Fallback:** Switched to ${sourceUsed} stream automatically!`
                )
              );

            return await EventUtils.sendPlayerMessage(client, player, {
              components: [fallbackNotice],
              flags: MessageFlags.IsComponentsV2
            });
          }
        } catch (fallbackErr) {
          logger.error('TrackException', 'Fallback resolution failed:', fallbackErr);
        }
      }

      const button = new ButtonBuilder()
        .setLabel("Support")
        .setURL("https://discord.gg/XYwwyDKhec")
        .setStyle(ButtonStyle.Link);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ⚠️ Playback Error`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`Lavalink failed to play: **${track?.info?.title || 'Unknown'}**\n\n**Reason:** ${errorMsg}`)
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
