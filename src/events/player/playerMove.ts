import { logger } from "#utils/logger";

export default {
	name: "playerMove",
	once: false,
	async execute(oldChannelId: string | null, newChannelId: string | null) {
		try {
			logger.info(
				"LavalinkPlayer",
				`🚚 Player moved: ${oldChannelId} → ${newChannelId}`,
			);
		} catch (error: any) {
			logger.error("PlayerMove", "Error in playerMove event:", error);
		}
	},
};

// Made by Nikhil Under CodeX Devs
