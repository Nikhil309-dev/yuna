import type { Message, Interaction, CommandInteraction } from 'discord.js';
import type { YunaClient } from '#core/YunaClient';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MessageFlags,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	ThumbnailBuilder,
} from "discord.js";
import { config } from "#config/config";
import { Command } from "#core/Command";
import emoji from "#config/emoji";
import { logger } from "#utils/logger";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import { componentCollectorSource } from "#ui/Components";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";

class RebootCommand extends Command {
	constructor() {
		super({
			name: "reboot",
			description: "Reboots the bot process or restarts clusters gracefully with session saving (Developer Only)",
			usage: "reboot",
			aliases: ["botrestart"],
			category: "developer",
			access: { ownerOnly: true },
		});
	}

	async execute({ client, message }: any) {
		try {
			const container = new ContainerBuilder();

			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`### ⚠️ **Confirm Bot Reboot**`),
			);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
			);

			const activePlayers = client.music?.lavalink?.players?.size || 0;
			const warningText =
				i18n.cmd("Are you sure you want to reboot **Yuna**?") + "\n\n" +
				i18n.cmd("├─ **Active Players:** {count} active music sessions\n", { count: activePlayers }) +
				i18n.cmd("├─ **Connected Guilds:** {count}\n", { count: client.guilds.cache.size }) +
				i18n.cmd("└─ **Action:** Save all sessions and restart node process gracefully.");

			const section = new SectionBuilder()
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(warningText))
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork),
				);

			container.addSectionComponents(section);

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
			);

			const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder()
					.setCustomId("reboot_confirm")
					.setLabel(i18n.cmd("Confirm Reboot"))
					.setStyle(ButtonStyle.Danger),
				new ButtonBuilder()
					.setCustomId("reboot_cancel")
					.setLabel(i18n.cmd("Cancel"))
					.setStyle(ButtonStyle.Secondary),
			);

			container.addActionRowComponents(buttons);

			const msgInstance = await message.reply({
				components: [container],
				flags: MessageFlags.IsComponentsV2,
			});

			this._setupCollector(msgInstance, message.author.id, client);
		} catch (error: any) {
			logger.error("RebootCommand", "Error in reboot command", error);
			await message.reply({
				components: [buildError("An error occurred.")],
				flags: MessageFlags.IsComponentsV2,
			}).catch(() => {});
		}
	}

	_setupCollector(msgInstance: any, userId: any, client: any) {
		const collector = componentCollectorSource(msgInstance).createMessageComponentCollector({
			filter: (i: any) => i.user.id === userId,
			time: 60_000,
		});

		collector.on("collect", async (interaction: any) => {
			try {
				if (interaction.customId === "reboot_cancel") {
					const container = new ContainerBuilder();
					container.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(i18n.cmd("### {emoji} **{title}**", { emoji: emoji.get("cross"), title: i18n.translateTitle("Reboot Cancelled") })),
					);
					container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
					container.addSectionComponents(
						new SectionBuilder()
							.addTextDisplayComponents(new TextDisplayBuilder().setContent(i18n.cmd("Reboot sequence cancelled by developer.")))
							.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail)),
					);

					await interaction.update({
						components: [container],
						flags: MessageFlags.IsComponentsV2,
					});
				} else if (interaction.customId === "reboot_confirm") {
					const container = new ContainerBuilder();
					container.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(`### 🔄 **Rebooting Yuna Bot...**`),
					);
					container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
					container.addSectionComponents(
						new SectionBuilder()
							.addTextDisplayComponents(new TextDisplayBuilder().setContent("Saving active sessions and restarting process now..."))
							.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail)),
					);

					await interaction.update({
						components: [container],
						flags: MessageFlags.IsComponentsV2,
					});

					logger.info("RebootCommand", "Reboot sequence initiated by developer.");

					setTimeout(() => {
						process.exit(0);
					}, 1500);
				}
			} catch (error: any) {
				logger.error("RebootCommand", "Error in collector interaction", error);
			}
		});
	}

	_createErrorContainer(msg: string) {
		const container = new ContainerBuilder();
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(i18n.cmd("### {emoji} **{title}**", { emoji: emoji.get("cross"), title: i18n.translateTitle("Reboot Error") })),
		);
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(msg))
				.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail)),
		);
		return container;
	}
}

export default new RebootCommand();

// Made by Nikhil Under CodeX Devs
