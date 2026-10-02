import type { Player, Track, LavalinkNode, LavalinkManager } from 'lavalink-client';
import type { YunaClient } from '#core/YunaClient';
import { logger } from "#utils/logger";
import { EventUtils } from "#utils/EventUtils";
import {
	ContainerBuilder,
	TextDisplayBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	SectionBuilder,
	MessageFlags,
	type TextBasedChannel,
} from "discord.js";

export default {
	name: "trackStuck",
	once: false,
	async execute(player: Player, track: Track, payload: any, musicManager: LavalinkManager, client: YunaClient) {
		try {
			logger.warn("TrackStuck", `Track stuck for ${payload.thresholdMs}ms in guild ${player.guildId}:`, {
				track: track?.info?.title || "Unknown",
				threshold: payload.thresholdMs,
				guildId: player.guildId,
			});

			const messageId = player.get<string | null>("nowPlayingMessageId");
			const channelId = player.get<string | null>("nowPlayingChannelId");

			if (messageId && channelId) {
				try {
					const channel = client.channels.cache.get(channelId) as TextBasedChannel | undefined;
					const message = await channel?.messages.fetch(messageId).catch(() => null);

					if (message) {
						const stuckContainer = new ContainerBuilder()
							.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ⚠️ **Track Stuck**`))
							.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
							.addTextDisplayComponents(
								new TextDisplayBuilder().setContent(
									`Attempting to recover: **${track?.info?.title || "Track"}**`,
								),
							);

						await message.edit({
							components: [stuckContainer],
							flags: MessageFlags.IsComponentsV2,
							files: [],
						});
					}
				} catch (editError) {
					logger.warn("TrackStuck", "Could not edit now playing message:", editError);
				}
			}

			const warnContainer = new ContainerBuilder()
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ⚠️ **Playback Recovery**`))
				.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(
						"Audio playback is experiencing issues. Attempting to recover automatically...",
					),
				);

			const warningMessage = await EventUtils.sendPlayerMessage(client, player, {
				components: [warnContainer],
				flags: MessageFlags.IsComponentsV2,
			});

			if (warningMessage?.id) {
				player.set("stuckWarningMessageId", warningMessage.id);
			}

			const stuckTimeoutId = setTimeout(async () => {
				try {
					if (player.queue.current && player.queue.current.info.identifier === track?.info?.identifier) {
						logger.info("TrackStuck", `Auto-skipping stuck track: ${track?.info?.title}`);

						const warningMsgId = player.get<string | null>("stuckWarningMessageId");
						if (warningMsgId) {
							try {
								const channel = client.channels.cache.get(player.textChannelId!) as TextBasedChannel | undefined;
								const warningMsg = await channel?.messages.fetch(warningMsgId).catch(() => null);
								if (warningMsg) {
									await warningMsg.delete().catch(() => {});
								}
								player.set("stuckWarningMessageId", null);
							} catch (cleanupError) {
								logger.debug("TrackStuck", "Failed to clean up warning message:", cleanupError);
							}
						}

						await player.skip();
					}
				} catch (skipError) {
					logger.error("TrackStuck", "Failed to auto-skip stuck track:", skipError);
				}
			}, 5000);

			player.set("stuckTimeoutId", stuckTimeoutId);
		} catch (error: any) {
			logger.error("TrackStuck", "Error in trackStuck event:", error);
		}
	},
};

// Made by Nikhil Under CodeX Devs
