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

  // lavalink-client derives `player.position` solely from websocket `playerUpdate`
  // frames. Some Lavalink builds (e.g. the Rust node this bot runs on) never push
  // those frames — the node tracks position but only exposes it over REST, so
  // `player.position` stays 0 and the progress bar freezes at 0:00. Fall back to
  // the node's REST player state, which is authoritative and always current.
  static async resolvePosition(player: any): Promise<number> {
    const wsPosition = typeof player?.position === 'number' && Number.isFinite(player.position) ? player.position : 0;
    const node = player?.node;
    if (!node?.sessionId || typeof node.request !== 'function' || !player?.guildId) return wsPosition;

    try {
      const res: any = await Promise.race([
        node.request(`/sessions/${node.sessionId}/players/${player.guildId}`),
        new Promise((_, reject) => setTimeout(() => reject(new Error('position sync timeout')), 2500)),
      ]);
      const restPosition = Number(res?.state?.position);
      if (Number.isFinite(restPosition) && restPosition >= 0) {
        return Math.max(wsPosition, restPosition);
      }
    } catch (err: any) {
      logger.debug('EventUtils', `Position REST sync failed: ${err?.message}`);
    }
    return wsPosition;
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

    const position = await EventUtils.resolvePosition(player);
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
