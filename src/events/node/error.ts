import { logger } from '#utils/logger';

export default {
	name: "error",
	once: false,
	async execute(payload: any) {
		try {
			if (payload) {
				logger.error('LavalinkNode', `📦 Error Payload:`, payload?.message || payload);
			}
		} catch (error_: any) {
			logger.error('LavalinkNode', 'Error in node error event handler:', error_);
		}
	}
};

// Made by Nikhil Under CodeX Devs
