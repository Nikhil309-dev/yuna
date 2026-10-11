import dotenv from 'dotenv';
import { branding } from './branding';
import { logger } from '#utils/logger';

const envFilePath = process.env.YUNA_ENV_FILE || undefined;
const parsedEnv = dotenv.config(envFilePath ? { path: envFilePath } : {}).parsed || {};
for (const [key, value] of Object.entries(parsedEnv)) {
  if (process.env[key] === undefined || process.env[key] === '') {
    process.env[key] = value as string;
  }
}

export const config = {

  token: process.env.DISCORD_TOKEN || process.env.TOKEN || process.env.token,
  clientId: process.env.CLIENT_ID || "",
  prefix: process.env.PREFIX || '.',
  ownerIds: (process.env.OWNER_IDS || '').split(',').map(id => id.trim()).filter(Boolean),
  botName: branding.botName,

  branding: branding,
  links: branding.links,
  status: branding.status,
  colors: branding.colors,
  assets: branding.assets,
  watermark: branding.developer.watermark,
  version: branding.botVersion,

  environment: process.env.NODE_ENV || 'development',
  debug: process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development',

  database: {
    path: process.env.DATABASE_PATH || './database/yuna.yuna'
  },

  nodes: (() => {
    if (process.env.LAVALINK_NODES_JSON) {
      try {
        return JSON.parse(process.env.LAVALINK_NODES_JSON);
      } catch (e) {
        logger.error("Config", "LAVALINK_NODES_JSON is not valid JSON — falling back to env/single-node config.", e);
      }
    }
    const nodeList = [];

    if (process.env.LAVALINK_HOST) {
      nodeList.push({
        id: "main-node-1",
        host: process.env.LAVALINK_HOST,
        port: Number(process.env.LAVALINK_PORT) || 9000,
        authorization: process.env.LAVALINK_PASSWORD || "youshallnotpass",
        secure: process.env.LAVALINK_SECURE === "true",
        retryAmount: 10,
        retryDelay: 3000,
      });
    }

    if (process.env.LAVALINK_HOST_2) {
      nodeList.push({
        id: "backup-node-2",
        host: process.env.LAVALINK_HOST_2,
        port: Number(process.env.LAVALINK_PORT_2) || 9000,
        authorization: process.env.LAVALINK_PASSWORD_2 || process.env.LAVALINK_PASSWORD || "youshallnotpass",
        secure: process.env.LAVALINK_SECURE_2 === "true",
        retryAmount: 10,
        retryDelay: 3000,
      });
    }

    if (process.env.LAVALINK_HOST_3) {
      nodeList.push({
        id: "backup-node-3",
        host: process.env.LAVALINK_HOST_3,
        port: Number(process.env.LAVALINK_PORT_3) || 9000,
        authorization: process.env.LAVALINK_PASSWORD_3 || process.env.LAVALINK_PASSWORD || "youshallnotpass",
        secure: process.env.LAVALINK_SECURE_3 === "true",
        retryAmount: 10,
        retryDelay: 3000,
      });
    }

    if (nodeList.length === 0) {
      nodeList.push({
        id: "default-local-node",
        host: "127.0.0.1",
        port: 9000,
        authorization: "youshallnotpass",
        secure: false,
        retryAmount: 10,
        retryDelay: 3000,
      });
    }

    return nodeList;
  })(),

  features: {
    stay247: true
  },
  queue: {
    maxSongs: {
      free: 50,
      premium: 200
    }
  },
  search: {
    maxResults: 6,
    defaultSources: ['spsearch', 'ytsearch', 'amsearch', 'scsearch']
  },
  player: {
    defaultVolume: 100,
    seekStep: 10000,
    maxHistorySize: 50,
    stay247: {
      reconnectDelay: 5000,
      maxReconnectAttempts: 3,
      checkInterval: 30000
    }
  },

  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET
  },

  logChannels: {
    guildJoin: process.env.LOG_GUILD_JOIN,
    guildLeave: process.env.LOG_GUILD_LEAVE,
    cmdRun: process.env.LOG_CMD_RUN,
    errorLogs: process.env.LOG_ERROR_LOGS,
    musicLogs: process.env.LOG_MUSIC_LOGS,
    abuseBlacklist: process.env.LOG_ABUSE_BLACKLIST,
    clusterLavalink: process.env.LOG_CLUSTER_LAVALINK
  },

  webhook: {
    enabled: process.env.WEBHOOK_ENABLED !== 'false',
    url: process.env.WEBHOOK_URL || null,
    username: process.env.WEBHOOK_USERNAME || 'Bot Logger',
    avatarUrl: process.env.WEBHOOK_AVATAR_URL || null,
    levels: {
      info: { enabled: process.env.WEBHOOK_INFO_ENABLED !== 'false' },
      success: { enabled: process.env.WEBHOOK_SUCCESS_ENABLED !== 'false' },
      warning: { enabled: process.env.WEBHOOK_WARNING_ENABLED !== 'false' },
      error: { enabled: process.env.WEBHOOK_ERROR_ENABLED !== 'false' },
      debug: { enabled: process.env.WEBHOOK_DEBUG_ENABLED === 'true' }
    }
  }
};

if (!config.token) {
  logger.error("Config", "TOKEN environment variable is not set. The bot cannot start.", undefined);
  process.exit(1);
}

const snowflakeRe = /^\d{17,20}$/;
if (!snowflakeRe.test(config.clientId)) {
  logger.error("Config", `CLIENT_ID is missing or not a valid Discord ID (got "${config.clientId || 'empty'}"). Set CLIENT_ID in your environment.`, undefined);
}

if (config.ownerIds.length === 0) {
  logger.warn("Config", "OWNER_IDS is not set. No user has owner-level bot access.");
}

// Made by Nikhil Under CodeX Devs
