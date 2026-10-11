import type { Player, Track, LavalinkNode, LavalinkManager } from 'lavalink-client';
import type { YunaClient } from '#core/YunaClient';
import { logger } from "#utils/logger";
import { EventUtils } from "#utils/EventUtils";
import musicSource from "#config/sources";
import { i18n } from "#utils/i18n";
import { buildResult } from "#ui/Theme";
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
						const stuckContainer = buildResult({
							title: 'Track Stuck',
							icon: '⚠️',
							accent: 0xFEE75C,
							avatarUrl: client?.user?.displayAvatarURL?.({ size: 128 }),
							blocks: [
								{ text: i18n.cmd("Attempting to recover **{title}**…", { title: track?.info?.title || i18n.cmd("Track") }) }
							]
						});

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

			const warnContainer = buildResult({
				title: 'Playback Recovery',
				icon: '⚠️',
				accent: 0xFEE75C,
				avatarUrl: client?.user?.displayAvatarURL?.({ size: 128 }),
				blocks: [
					{ text: i18n.cmd("Audio playback is experiencing issues. Attempting to recover automatically…") }
				]
			});

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

						const title = track?.info?.title;
						const author = track?.info?.author;
						let recovered = false;

						if (title && client?.music && track?.info?.sourceName === 'youtube') {
							try {
								const cleanTitle = title.replace(/\(.*?\)|\[.*?\]|Official|Music|Video|Audio|HD|4K/gi, '').trim();
								const cleanAuthor = author ? author.replace(/VEVO|Official|Channel/gi, '').trim() : '';
								const searchQuery = `${cleanAuthor ? `${cleanAuthor} ` : ''}${cleanTitle}`;

								logger.info("TrackStuck", `Attempting stream recovery for stuck track: "${searchQuery}"`);

								// Try every configured source prefix instead of hardcoding
								// plugins the Lavalink node may not have installed.
								let fallbackRes: any = null;
								let sourceUsed = '';
								for (const prefix of musicSource.getPrefixList()) {
									try {
										const res = await client.music.search(searchQuery, { source: prefix.replace(':', '') });
										if (res?.tracks?.length) {
											fallbackRes = res;
											sourceUsed = prefix.replace(':', '');
											break;
										}
									} catch { /* try the next source */ }
								}

								if (fallbackRes?.tracks?.length > 0) {
									logger.info("TrackStuck", `Recovered stuck track via ${sourceUsed}: "${fallbackRes.tracks[0].info.title}"`);
									await player.play({ clientTrack: fallbackRes.tracks[0] });
									recovered = true;
								}
							} catch (recoveryErr) {
								logger.debug("TrackStuck", "Fallback recovery failed:", recoveryErr);
							}
						}

						if (!recovered) {
							logger.info("TrackStuck", `Auto-skipping stuck track: ${track?.info?.title}`);
							await player.skip();
						}
					}
				} catch (skipError) {
					logger.error("TrackStuck", "Failed to recover or auto-skip stuck track:", skipError);
				}
			}, 5000);

			player.set("stuckTimeoutId", stuckTimeoutId);
		} catch (error: any) {
			logger.error("TrackStuck", "Error in trackStuck event:", error);
		}
	},
};

// Made by Nikhil Under CodeX Devs
