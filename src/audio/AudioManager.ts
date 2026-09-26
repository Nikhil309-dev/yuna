/**
 * @file AudioManager.ts
 * @description Central audio manager for Yuna V2, powered entirely by a standard
 * Lavalink v4 server (through the lavalink-client library). The bot never decodes,
 * encodes, resamples, or streams audio itself — it only sends REST/WS commands and
 * forwards raw voice payloads so the node does all heavy audio work.
 */

import { LavalinkManager, Player } from 'lavalink-client';
import { config } from '#config/config';
import { logger } from '#utils/logger';

import { Client } from "discord.js";

interface CreatePlayerOptions {
  guildId: string;
  voiceChannelId: string;
  textChannelId?: string;
  volume?: number;
  selfDeaf?: boolean;
  selfMute?: boolean;
}

interface SearchOptions {
  requester?: any;
  source?: string;
}

export class AudioManager {
  public client: Client;
  public lavalink: LavalinkManager;
  constructor(client: Client) {
    this.client = client;
    this.lavalink = new LavalinkManager({
      nodes: config.nodes.length > 0 ? config.nodes : [
        {
          id: 'lavalink-node',
          host: process.env.LAVALINK_HOST || '127.0.0.1',
          port: Number(process.env.LAVALINK_PORT) || 9000,
          authorization: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
          secure: process.env.LAVALINK_SECURE === 'true',
          retryAmount: 20,
          retryDelay: 3000,
        }
      ],
      sendToShard: (guildId: string, payload: any) => {
        const guild = this.client.guilds.cache.get(guildId);
        if (guild?.shard) {
          guild.shard.send(payload);
        } else if (this.client.ws?.shards) {

          const shardCount = this.client.ws.shards.size || 1;
          const shardId = Number((BigInt(guildId) >> 22n) % BigInt(shardCount));
          const shard = this.client.ws.shards.get(shardId) || this.client.ws.shards.first();
          if (shard) shard.send(payload);
        }
      },
      client: {
        id: config.clientId,
        username: config.botName || 'Yuna'
      },
      autoSkip: true,
      playerOptions: {
        clientBasedPositionUpdateInterval: 50,
        defaultSearchPlatform: 'jssearch',
        volumeDecrementer: 1
      },
      queueOptions: {
        maxPreviousTracks: 25
      }
    });

    this.init();
  }

  init() {
    this.client.once('clientReady', async () => {
      logger.info('AudioManager', `🌸 Initializing Lavalink audio core...`);

      this.lavalink.on("debug", (event: any, log: any) => {
        if (log.state === "warn" || log.state === "error") {
          logger.warn("LavalinkDebug", log.message);
        }
      });

      if (process.env.LAVALINK_DEBUG_FETCH === '1' && !(globalThis as any).__yunaFetchPatched) {
        (globalThis as any).__yunaFetchPatched = true;
        const nodePort = String(config.nodes?.[0]?.port ?? process.env.LAVALINK_PORT ?? 9000);
        const origFetch = global.fetch;
        global.fetch = async (url: any, options: any) => {
          if (url.toString().includes(nodePort)) {
            logger.info('AudioManager', `FETCH OUTGOING: ${options?.method} ${url}`);
            if (options?.body) logger.info('AudioManager', `FETCH BODY: ${options?.body}`);
          }
          try {
            const res = await origFetch(url, options);
            if (url.toString().includes(nodePort)) {
              logger.info('AudioManager', `FETCH RESPONSE: ${res.status}`);
            }
            return res;
          } catch (e) {
            logger.error('AudioManager', `FETCH ERROR: ${e}`, e);
            throw e;
          }
        };
      }

      try {
        if (this.lavalink.options?.client) {
          this.lavalink.options.client.id = this.client.user!.id;
          this.lavalink.options.client.username = this.client.user!.username;
        }
        await this.lavalink.init({
          id: this.client.user!.id,
          username: this.client.user!.username
        });

        logger.success('AudioManager', `⛩️ Lavalink audio engine initialized!`);
      } catch (err) {
        logger.error('AudioManager', `Failed to initialize Lavalink manager:`, err);
      }
    });
  }

  /**
   * Retrieves active player for guild
   * @param {string} guildId
   * @returns {import('lavalink-client').Player|undefined}
   */
  getPlayer(guildId: string): Player | undefined {
    return this.lavalink.getPlayer(guildId);
  }

  /** All active players keyed by guild id (proxied from the Lavalink manager). */
  get players() {
    return this.lavalink.players;
  }

  /**
   * Creates or returns an active player for a guild
   * @param {Object} options { guildId, voiceChannelId, textChannelId, volume, selfDeaf }
   * @returns {Promise<import('lavalink-client').Player>}
   */
  async createPlayer(options: CreatePlayerOptions): Promise<Player> {
    const { guildId, voiceChannelId, textChannelId, volume = 100, selfDeaf = true, selfMute = false } = options;
    let player = this.lavalink.getPlayer(guildId);

    if (player) {
      if (voiceChannelId && player.voiceChannelId !== voiceChannelId) {
        await player.changeVoiceState({ voiceChannelId });
      }
      if (textChannelId) player.textChannelId = textChannelId;
      return player;
    }

    player = await this.lavalink.createPlayer({
      guildId,
      voiceChannelId,
      textChannelId,
      selfDeaf,
      selfMute,
      volume
    });

    await player.connect();
    return player;
  }

  async search(query: string, options: SearchOptions = {}) {
    if (!query || !query.trim()) {
      return { loadType: 'empty', tracks: [] };
    }

    const requester = options.requester || null;
    const cleanQuery = query.trim();

    const node = this.lavalink.nodeManager.leastUsedNodes()?.[0];
    if (!node) {
      throw new Error('No connected Lavalink node available. Make sure your Lavalink server is running and reachable at the configured host/port.');
    }

    const isUrl = /^https?:\/\//i.test(cleanQuery);
    const searchOptions: { query: string; source?: string } = isUrl
      ? { query: cleanQuery }
      : { query: cleanQuery, source: options.source || 'jssearch' };

    return await node.search({ ...searchOptions } as any, requester);
  }

  /**
   * Destroys a guild player
   * @param {string} guildId
   */
  async destroyPlayer(guildId: string) {
    return await this.lavalink.destroyPlayer(guildId);
  }
}

export default AudioManager;

// Made by Nikhil Under CodeX Devs
