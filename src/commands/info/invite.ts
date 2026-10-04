import { Command, CommandContext } from '#core/Command';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	MessageFlags,
} from "discord.js";
import type { Client } from "discord.js";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import { config } from "#config/config";
import emoji from "#config/emoji";
import { logger } from "#utils/logger";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";

class InviteCommand extends Command {
	constructor() {
		super({
			name: "invite",
			description: "Get the bot's invite link to add it to your server.",
			usage: "invite",
			aliases: ["inv", "add", "addbot"],
			category: "info",
			examples: ["invite", "inv"],
			cooldown: 5,
			slash: {
				enabled: true,
				data: {
					name: "invite",
					description: "Get the bot's invite link to add it to your server.",
				},
			},
		});
	}

	async execute({ client, message }: any) {
		try {
			await message.reply({
				components: [this._createInviteContainer(client)],
				flags: MessageFlags.IsComponentsV2,
			});
		} catch (error: any) {
			logger.error("InviteCommand", `Error in prefix command: ${error.message}`, error);
			await message.reply({
				components: [this._createErrorContainer(i18n.cmd("An error occurred while generating invite link."))],
				flags: MessageFlags.IsComponentsV2,
			}).catch(() => {});
		}
	}

	async slashExecute({ client, interaction }: any) {
		try {
			await interaction.editReply({
				components: [this._createInviteContainer(client)],
				flags: MessageFlags.IsComponentsV2,
			});
		} catch (error: any) {
			logger.error("InviteCommand", `Error in slash command: ${error.message}`, error);
			const errorPayload = {
				components: [this._createErrorContainer(i18n.cmd("An error occurred while generating invite link."))],
				ephemeral: true,
			};
			if (interaction.replied || interaction.deferred) {
				await interaction.editReply(errorPayload).catch(() => {});
			} else {
				await interaction.reply(errorPayload).catch(() => {});
			}
		}
	}

	_createInviteContainer(client: Client) {
		const inviteLink = `https://discord.com/api/oauth2/authorize?client_id=${client.user!.id}&permissions=8&scope=bot%20applications.commands`;

		const content = `**Add Yuna to your server!**\n\n` +

			`*Click the button below to add Yuna to your server!*`;

		const buttonRow = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setLabel('Add to Server')
				.setStyle(ButtonStyle.Link)
				.setURL(inviteLink)
				.setEmoji(emoji.get("add"))
		);

		return buildContainer({
			title: "Invite Yuna",
			content,
			thumbnail: config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork,
			components: [buttonRow],
			icon: emoji.get("add") || "🔗"
		});
	}

	_createErrorContainer(message: string) {
		return buildError(message);
	}
}

export default new InviteCommand();

// Made by Nikhil Under CodeX Devs
