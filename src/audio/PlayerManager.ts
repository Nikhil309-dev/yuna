import { QueueManager } from './QueueManager';
import { config } from '#config/config';
import { db } from '#database/Database';
import { logger } from '#utils/logger';
import { Player, Track } from 'lavalink-client';

export class PlayerManager {
  public player: any;
  public guildId: string;
  public queue: QueueManager;
  constructor(player: any) {
    if (!player) throw new Error("PlayerManager requires a valid player instance.");
    this.player = player;
    this.guildId = player.guildId;
    this.queue = new QueueManager(player);
  }

  async connect() { await this.player.connect(); return this; }

  /**
   * Moves the player to another voice channel (Lavalink-safe).
   * Always pass `voiceChannelId` — lavalink-client rejects a same-channel move.
   */
  async changeVoiceState(data: { voiceChannelId: string; selfDeaf?: boolean; selfMute?: boolean }) {
    await this.player.changeVoiceState(data);
    return this;
  }

  async disconnect(force: boolean = false) {
    await this.player.destroy(force ? 'Force disconnect' : 'Disconnect');
    return this;
  }
  async destroy(reason?: string, disconnect: boolean = true) {
    await this.player.destroy(reason || 'Destroyed', disconnect);
    return this;
  }

  addTracks(tracks: any, position?: number) {
    return this.queue.add(tracks, position);
  }

  is247ModeEnabled() {
    const settings = (db as any).guild?.get247Settings(this.guildId);
    return settings?.enabled === true;
  }

  async play(options: any = {}) {
    if (!options.clientTrack && !options.track && this.player.queue.tracks.length > 0) {
      const nextTrack = this.player.queue.tracks.shift();
      await this.player.play({ clientTrack: nextTrack, ...options });
    } else if (options.track && !options.clientTrack) {
      await this.player.play({ clientTrack: options.track, ...options });
    } else {
      await this.player.play(options);
    }
    return this;
  }

  async playPrevious() {
    const prev = this.player.queue.previous;
    if (!prev || prev.length === 0) return false;
    // lavalink-client unshifts finished tracks, so the most recent track is at
    // index 0 (not the end). Playing it must therefore shift, not pop — pop()
    // would jump to the oldest entry in history.
    const previousTrack = prev.shift();
    if (!previousTrack) return false;

    const current = this.player.queue.current;
    if (current) prev.unshift(current);
    await this.play({ track: previousTrack });
    return true;
  }

  async pause() { await this.player.pause(); return this; }
  async resume() { await this.player.resume(); return this; }

  async stop() {
    const is247ModeEnabled = this.is247ModeEnabled();

    this.player.queue.tracks.splice(0, this.player.queue.tracks.length);

    if (!is247ModeEnabled) {
      await this.player.destroy("Stop command");
    } else {
      await this.player.stopPlaying(false, false);
      this.player.queue.current = null;
    }
    return this;
  }

  async skip(amount: number = 1) {
    const { player } = this;
    const { current } = player.queue;

    if (player.repeatMode === "track" && current) {
      player.repeatMode = 'off';
    }

    if (amount > 1) {
      player.queue.tracks.splice(0, amount - 1);
    }

    await player.skip(0, false);
    return this;
  }

  async seek(position: number) { await this.player.seek(position); return this; }

  async forward(amount: number = 10000) {
    const track = this.currentTrack;
    if (!track || track.info?.isStream) return false;
    const newPosition = Math.min(this.position + amount, track.info?.duration || 0);
    await this.seek(newPosition);
    return newPosition;
  }

  async rewind(amount: number = 10000) {
    const newPosition = Math.max(this.position - amount, 0);
    await this.seek(newPosition);
    return newPosition;
  }

  async replay() {
    await this.seek(0);
    return true;
  }

  async setVolume(volume: number) { this.player.setVolume(volume); return this; }
  async setRepeatMode(mode: string) { this.player.setRepeatMode(mode); return this; }

  setData(key: string, value: any) { this.player.setData(key, value); }
  getData(key: string) { return this.player.getData(key); }

  async shuffleQueue() {
    await this.queue.shuffle();
    return this;
  }

  /** Clears the upcoming tracks (keeps the current track playing). */
  async clearQueue() {
    return this.queue.clear();
  }

  get isConnected() { return this.player.connected; }
  get textChannelId() { return this.player.textChannelId; }
  get voiceChannelId() { return this.player.voiceChannelId; }
  get isPlaying() { return this.player.playing; }
  get isPaused() { return this.player.paused; }
  get currentTrack() { return this.player.queue.current; }
  get position() { return this.player.position; }
  get volume() { return this.player.volume; }
  get queueSize() { return this.queue.size; }

  formatDuration(ms: number) {
    if (!ms || ms < 0) return "Live";
    const seconds = Math.floor((ms / 1000) % 60).toString().padStart(2, "0");
    const minutes = Math.floor((ms / (1000 * 60)) % 60).toString().padStart(2, "0");
    const hours = Math.floor(ms / (1000 * 60 * 60));
    return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
  }

  createProgressBar(current: number, total: number, length: number = 15) {
    if (!total || total <= 0) return "░".repeat(length);
    const progress = Math.max(0, Math.min(1, current / total));
    const filledBlocks = Math.round(progress * length);
    const emptyBlocks = length - filledBlocks;
    return "█".repeat(filledBlocks) + "░".repeat(emptyBlocks);
  }

  getBestImage(images: any[]) {
    if (!images || !Array.isArray(images)) return config.assets?.defaultTrackArtwork || "";
    const sizeOrder = ["extralarge", "large", "medium", "small"];
    for (const size of sizeOrder) {
      const image = images.find((img: any) => img.size === size);
      if (image && image["#text"]) return image["#text"];
    }
    const fallback = images.find((img: any) => img["#text"]);
    return fallback ? fallback["#text"] : config.assets?.defaultTrackArtwork || "";
  }

  saveSession() {
    try {
      if (!this.player || !this.player.voiceChannelId) return;
      const currentTrack = this.player.queue.current;
      const queueTracks = this.player.queue.tracks || [];
      const position = this.player.position || 0;

      if (!currentTrack && queueTracks.length === 0) {
        (db as any).guild.deleteActiveSession(this.guildId);
        return;
      }
      (db as any).guild.saveActiveSession(this.guildId, this.player.voiceChannelId, this.player.textChannelId, currentTrack, queueTracks, position);
    } catch (err) {
      logger.error('PlayerManager', `Failed to save session for guild ${this.guildId}:`, err);
    }
  }

  clearSession() {
    try {
      (db as any).guild.deleteActiveSession(this.guildId);
    } catch (err) {
      logger.error('PlayerManager', `Failed to clear session for guild ${this.guildId}:`, err);
    }
  }

  toJSON() {
    return this.player.toJSON();
  }
}

// Made by Nikhil Under CodeX Devs
