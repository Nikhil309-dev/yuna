import type { LavalinkNode } from 'lavalink-client';
import { logger } from '#utils/logger';

export default {
  name: "disconnect",
  once: false,
  async execute(node: LavalinkNode, reason: { code?: number | string; reason?: string }) {
    try {
      const code = reason?.code ?? 'unknown';
      const reasonStr = reason?.reason ?? JSON.stringify(reason) ?? 'unknown';
      logger.warn('LavalinkNode', `🔌 Lavalink Node #${node.id} disconnected. Code: ${code} Reason: ${reasonStr}`);

    } catch (error: any) {
      logger.error('LavalinkNode', 'Error in node disconnect event handler:', error);
    }
  }
};

// Made by Nikhil Under CodeX Devs
