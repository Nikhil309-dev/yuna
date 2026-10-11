import type { Player } from 'lavalink-client';
import { logger } from "#utils/logger";

export default {
	name: "playerCreate",
	once: false,
	async execute(player: Player) {
		try {
			logger.info(
				"PlayerCreate",
				`🎵 Player created for guild: ${player.guildId}`,
			);
		} catch (error: any) {
			logger.error("PlayerCreate", "Error in playerCreate event:", error);
		}
	},
};

// Made by Nikhil Under CodeX Devs
