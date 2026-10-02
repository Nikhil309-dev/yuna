import { logger } from "#utils/logger";

export default {
  name: "raw",
  once: false,
  async execute(data: any, ...rest: any[]) {
    try {
      if (!data) return;

      const client = rest.find((arg: any) => arg && typeof arg === 'object' && (arg.audio || arg.lavalink || arg.music));
      const lavalink = client?.lavalink || client?.audio?.lavalink || client?.music?.lavalink;

      if (data.t === "VOICE_STATE_UPDATE" || data.t === "VOICE_SERVER_UPDATE") {
        logger.info("RawVoice", `Forwarding ${data.t} to Lavalink for guild: ${data.d?.guild_id || "unknown"}`);
      }

      if (lavalink && typeof lavalink.sendRawData === 'function') {
        await lavalink.sendRawData(data);
      } else if (data.t === "VOICE_STATE_UPDATE" || data.t === "VOICE_SERVER_UPDATE") {
        logger.warn("RawVoice", `Could not forward ${data.t}: LavalinkManager instance not found on client`);
      }
    } catch (error) {
      logger.error("LavalinkClient", "Error in raw event handler:", error);
    }
  },
};

// Made by Nikhil Under CodeX Devs
