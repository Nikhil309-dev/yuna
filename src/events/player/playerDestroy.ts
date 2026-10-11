import type { Player, LavalinkManager } from 'lavalink-client';
import type { YunaClient } from '#core/YunaClient';
import { logger } from "#utils/logger";
import { EventUtils } from "#utils/EventUtils";
import { db } from "#database/Database";
import AutoplayEngine from "#audio/AutoplayEngine";
import { cleanupGuildVoiceState } from "#events/discord/music/Voicestate";
import {
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MessageFlags,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
} from "discord.js";

export default {
	name: "playerDestroy",
	once: false,
	async execute(player: Player, reason: string, _musicManager: LavalinkManager, client: YunaClient) {
		try {
			logger.info(
				"playerDestroy",
				`🎵 Player destroyed for guild: ${player.guildId}, reason: ${reason}`,
			);
			EventUtils.clearPlayerInterval(player, 'updateInterval');
			db.guild.deleteActiveSession(player.guildId);
			new AutoplayEngine(client as any).clearSessionHistory(player.guildId);
			cleanupGuildVoiceState(player.guildId);

			const quietReasons = new Set(['Stop command', 'Disconnect', 'Force disconnect', 'Destroyed']);

			if (client && player.textChannelId && !quietReasons.has(reason)) {
				const button = new ButtonBuilder()
					.setLabel("Support")
					.setURL("https://discord.gg/XYwwyDKhec")
					.setStyle(ButtonStyle.Link);

				const container = new ContainerBuilder()
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(`### ⏹️ Player Disconnected`),
					)
					.addSeparatorComponents(
						new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
					)
					.addSectionComponents(
						new SectionBuilder()
							.addTextDisplayComponents(
								new TextDisplayBuilder().setContent(
									`**Reason:** ${reason || "Session ended"}\n\n*Use \`.play\` or \`/play\` anytime to start listening again!*`,
								),
							)
							.setButtonAccessory(button),
					);

				await EventUtils.sendPlayerMessage(client, player, {
					components: [container],
					flags: MessageFlags.IsComponentsV2,
				});
			}
		} catch (error: any) {
			logger.error("playerDestroy", "Error in playerDestroy event:", error);
		}
	},
};

// Made by Nikhil Under CodeX Devs
