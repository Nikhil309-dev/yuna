import { logger } from '#utils/logger';

export default {
	name: "connect",
	once: false,
	async execute(node: any) {
		try {
			logger.success('LavalinkNode', `✅ Lavalink Node #${node.id} connected successfully`);
			logger.info('LavalinkNode', `🌐 Node: ${node.options.host}:${node.options.port}`);
		} catch (error: any) {
			logger.error('LavalinkNode', 'Error in node connect event handler:', error);
		}
	}
};

// Made by Nikhil Under CodeX Devs
