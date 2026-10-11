import type { Player, Track } from 'lavalink-client';
import type { YunaClient } from '#core/YunaClient';
import { logger } from "#utils/logger";
import { EventUtils } from "#utils/EventUtils";
import { db } from "#database/Database";

export default {
	name: "trackEnd",
	once: false,
	async execute(player: Player, track: Track, payload: any, client: YunaClient) {
		try {
			const endReason = payload?.reason || "FINISHED";

			logger.debug("TrackEnd", `Track ended in guild ${player.guildId}:`, {
				track: track?.info?.title || "Unknown",
				reason: endReason,
				guildId: player.guildId,
			});

			EventUtils.clearPlayerTimeout(player, "stuckTimeoutId");
			EventUtils.clearPlayerInterval(player, "updateInterval");

			const messageId = player.get<string | null>("nowPlayingMessageId");
			const channelId = player.get<string | null>("nowPlayingChannelId");
			const stuckWarningId = player.get<string | null>("stuckWarningMessageId");
			const errorMessageId = player.get<string | null>("errorMessageId");

			if (messageId && channelId) {
				await EventUtils.deleteMessage(client, channelId, messageId).catch(() => {});
			}

			if (stuckWarningId && channelId) {
				await EventUtils.deleteMessage(client, channelId, stuckWarningId).catch(() => {});
			}

			if (errorMessageId && channelId) {
				await EventUtils.deleteMessage(client, channelId, errorMessageId).catch(() => {});
			}

			player.set("nowPlayingMessageId", null);
			player.set("nowPlayingChannelId", null);
			player.set("stuckWarningMessageId", null);
			player.set("errorMessageId", null);
			player.set("stuckTimeoutId", null);

                        if (track?.info && track.requester?.id) {
                                const listened = Number(track.info.duration) || 0;
                                if (listened > 0) {
                                        try {
                                                db.stats.addListenTime(track.requester.id, listened);
                                        } catch (statsError: any) {
                                                logger.error("TrackEnd", "Failed to record listen time:", statsError);
                                        }
                                }
                        }

                        if (endReason === "FINISHED" && track?.info) {
				logger.info(
					"TrackEnd",
					`Track completed: "${track.info.title}" by ${track.info.author} in guild ${player.guildId}`,
				);
			}
		} catch (error: any) {
			logger.error("TrackEnd", "Error in trackEnd event:", error);
		}
	},
};

// Made by Nikhil Under CodeX Devs
