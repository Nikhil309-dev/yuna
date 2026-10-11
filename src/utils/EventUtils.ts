import { logger } from '#utils/logger';
import { Client, AttachmentBuilder, MessageFlags } from 'discord.js';
import { createPlayerContainer } from '#ui/Components';
import MusicCard from '#ui/cards/MusicCard';
import { db } from '#database/Database';

export class EventUtils {

  static clearPlayerTimeout(player: any, timeoutName: string) {
    if (player && player.get && player.get(timeoutName)) {
      clearTimeout(player.get(timeoutName));
      player.set(timeoutName, null);
    }
  }

  static clearPlayerInterval(player: any, intervalName: string) {
    if (player && player.get && player.get(intervalName)) {
      clearInterval(player.get(intervalName));
      player.set(intervalName, null);
    }
  }

  static async deleteMessage(client: Client | any, channelId: string, messageId: string) {
    if (!client || !channelId || !messageId) return;
    try {
      const channel: any = await client.channels.fetch(channelId).catch(() => null);
      if (channel && channel.messages) {
        const msg = await channel.messages.fetch(messageId).catch(() => null);
        if (msg && msg.deletable) {
          await msg.delete().catch(() => {});
        }
      }
    } catch (err: any) {
      logger.debug('EventUtils', `Failed to delete message: ${err.message}`);
    }
  }

  static async sendPlayerMessage(client: Client | any, player: any, messageOptions: any) {
    if (!client?.channels?.fetch || !player || !player.textChannelId) return null;
    try {
      const channel: any = await client.channels.fetch(player.textChannelId).catch(() => null);
      if (channel && typeof channel.send === 'function') {
        return await channel.send(messageOptions);
      }
    } catch (err: any) {
      logger.error('EventUtils', `Failed to send player message: ${err.message}`, err);
    }
    return null;
  }

  static startNowPlayingUpdater(client: Client | any, player: any, intervalMs = 10_000) {
    if (!client || !player) return;
    this.clearPlayerInterval(player, 'updateInterval');

    const id = setInterval(() => {
      this.refreshNowPlaying(client, player).catch(() => {});
    }, intervalMs);
    if (typeof id.unref === 'function') id.unref();
    player.set('updateInterval', id);
  }

  static async refreshNowPlaying(client: Client | any, player: any): Promise<boolean> {
    if (!client?.channels?.fetch || !player) return false;

    const messageId = player.get?.('nowPlayingMessageId');
    const channelId = player.get?.('nowPlayingChannelId') || player.textChannelId;
    const track = player.queue?.current;
    if (!messageId || !channelId || !track?.info) return false;

    if (player.paused) return false;

    const channel: any = await client.channels.fetch(channelId).catch(() => null);
    const message: any = await channel?.messages?.fetch(messageId).catch(() => null);
    if (!message?.edit) return false;

    const position = player.position || 0;
    const isTextMode = player.get?.('nowPlayingTextMode') === true;
    const controlMode = player.get?.('controlMode') || 'default';
    const requesterId = track.requester?.id;

    if (isTextMode) {
      const container = createPlayerContainer(controlMode, { isTextMode: true, track, position });
      await message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      return true;
    }

    const isPremium = requesterId ? !!db.hasAnyPremium(requesterId, player.guildId) : false;
    const buffer = await new MusicCard().createMusicCard(track, position, { isPremium });
    const attachment = new AttachmentBuilder(buffer, { name: 'yuna-nowplaying.png' });
    const container = createPlayerContainer(controlMode, { isTextMode: false, track, position, hasImage: true });
    await message.edit({ files: [attachment], components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    return true;
  }
}

export default EventUtils;

// Made by Nikhil Under CodeX Devs
