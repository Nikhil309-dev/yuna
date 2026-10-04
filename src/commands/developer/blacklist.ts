import type { Message, Interaction, CommandInteraction } from 'discord.js';
import type { YunaClient } from '#core/YunaClient';
import { Command } from "#core/Command";
import { db } from "#database/Database";
import {
	ContainerBuilder,
	TextDisplayBuilder,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	ThumbnailBuilder,
	MessageFlags
} from "discord.js";

import { config } from "#config/config";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";

class BlacklistCommand extends Command {
	constructor() {
		super({
			name: "blacklist",
			description: "Manage blacklisted users and guilds (Owner Only)",
			usage: "blacklist <add|remove|check|stats> [type/id] [id] [reason]",
			aliases: ["bl"],
			category: "developer",
			examples: [
				"blacklist add user 123456789 Spam",
				"blacklist add guild 987654321 ToS violation",
				"blacklist remove 123456789",
				"blacklist check @user"
			],
			access: { ownerOnly: true },
		});
	}

	async execute({ client, message, args }: any) {
		try {
			if (!config.ownerIds?.includes(message.author.id)) {
				return this._sendError(message, "Access Denied", i18n.cmd("This command is restricted to bot owners only."));
			}

			if (!args.length) {
				return message.reply({
					components: [this._createHelpContainer()],
					flags: MessageFlags.IsComponentsV2
				});
			}

			const action = args[0].toLowerCase();

			switch (action) {
				case "add":
					return await this._handleAdd(client, message, args.slice(1));
				case "remove":
					return await this._handleRemove(client, message, args.slice(1));
				case "check":
					return await this._handleCheck(client, message, args.slice(1));
				default:
					return this._sendError(
					message,
					i18n.translateTitle("Invalid Action"),
					i18n.cmd("Unknown action: {action}. Use add, remove, or check.", { action }),
				);
			}
		} catch (error: any) {
			logger.error("BlacklistCommand", "Blacklist command error:", error);
			return this._sendError(
				message,
				"Error",
				i18n.cmd("An unexpected error occurred: {error}", { error: error.message }),
			);
		}
	}

	async _handleAdd(client: any, message: any, args: any) {
		if (args.length < 2) {
			return this._sendError(
				message,
				i18n.translateTitle("Usage Error"),
				i18n.cmd("{emoji} **Command Format:**\nblacklist add <user|guild> <id> [reason]\n\n{emoji} **Default reason:** Blacklisted by owner", { emoji: emoji.get("info") })
			);
		}

		const type = args[0].toLowerCase();
		let id = args[1];

		if (id.startsWith("<@") && id.endsWith(">")) {
			id = id.slice(2, -1);
			if (id.startsWith("!")) id = id.slice(1);
		}

		const reason = args.slice(2).join(" ") || i18n.cmd("Blacklisted by owner");

		if (!["user", "guild"].includes(type)) {
			return this._sendError(message, "Invalid Type", `${emoji.get("cross")} ${i18n.cmd("Type must be either **user** or **guild**.")}`);
		}

		try {
			let alreadyBlacklisted = false;

			if (type === "user") {
				alreadyBlacklisted = !!db.isUserBlacklisted(id);
				if (!alreadyBlacklisted) {
					(db.users as any).blacklistUser(id, reason);
				}
			} else {
				alreadyBlacklisted = !!db.isGuildBlacklisted(id);
				if (!alreadyBlacklisted) {
					(db.guilds as any).blacklistGuild(id, reason);
				}
			}

			if (alreadyBlacklisted) {
				return this._sendError(
					message,
					i18n.translateTitle("Already Blacklisted"),
					`${emoji.get("cross")} ${i18n.cmd("{type} \`{id}\` is already blacklisted.", {
						type: type === "user" ? i18n.cmd("User") : i18n.cmd("Guild"),
						id,
					})}`,
				);
			}

			const typeIcon = type === "user" ? "👤" : "🏠";
			return this._sendSuccess(
				message,
				"Blacklisted Successfully",
				`${emoji.get("check")} ${i18n.cmd("**Successfully blacklisted {type}!**", { type })}\n\n${typeIcon} ${i18n.cmd("**Target:** `{id}`", { id })}\n📝 ${i18n.cmd("**Reason:** {reason}", { reason })}`
			);
		} catch (error: any) {
			logger.error("BlacklistCommand", "Error adding to blacklist:", error);
			return this._sendError(message, "Error", `${emoji.get("cross")} ${i18n.cmd("**Database Error:**")}\n${error.message}`);
		}
	}

	async _handleRemove(client: any, message: any, args: any) {
		if (args.length < 1) {
			return this._sendError(message, "Usage Error", `${emoji.get("info")} ${i18n.cmd("**Command Format:**")}\nblacklist remove <id>`);
		}

		let id = args[0];

		if (id.startsWith("<@") && id.endsWith(">")) {
			id = id.slice(2, -1);
			if (id.startsWith("!")) id = id.slice(1);
		}

		try {
			const isUserBlacklisted = db.isUserBlacklisted(id);
			const isGuildBlacklisted = db.isGuildBlacklisted(id);

			if (!isUserBlacklisted && !isGuildBlacklisted) {
				return this._sendError(
					message,
					i18n.translateTitle("Not Blacklisted"),
					`${emoji.get("cross")} ${i18n.cmd("ID `{id}` is not blacklisted.", { id })}`
				);
			}

			let result;
			let type;

			if (isUserBlacklisted) {
				result = (db.users as any).unblacklistUser(id);
				type = "user";
			} else {
				result = (db.guilds as any).unblacklistGuild(id);
				type = "guild";
			}

			if (result && result.changes > 0) {
				const typeIcon = type === "user" ? "👤" : "🏠";
				return this._sendSuccess(
					message,
					i18n.translateTitle("Removed from Blacklist"),
					`${emoji.get("check")} ${i18n.cmd("**Successfully removed {type} from blacklist!**", { type })}\n\n${typeIcon} ${i18n.cmd("**Target:** `{id}`", { id })}`
				);
			} else {
				return this._sendError(
					message,
					"Remove Failed",
					`${emoji.get("cross")} ${i18n.cmd("Failed to remove `{id}` from blacklist.", { id })}`
				);
			}
		} catch (error: any) {
			logger.error("BlacklistCommand", "Error removing from blacklist:", error);
			return this._sendError(message, "Error", `${emoji.get("cross")} ${i18n.cmd("**Database Error:**")}\n${error.message}`);
		}
	}

	async _handleCheck(client: any, message: any, args: any) {
		if (args.length < 1) {
			return this._sendError(message, "Usage Error", `${emoji.get("info")} ${i18n.cmd("**Command Format:**")}\nblacklist check <id>`);
		}

		let id = args[0];

		if (id.startsWith("<@") && id.endsWith(">")) {
			id = id.slice(2, -1);
			if (id.startsWith("!")) id = id.slice(1);
		}

		try {
			const isUserBlacklisted = db.isUserBlacklisted(id);
			const isGuildBlacklisted = db.isGuildBlacklisted(id);

			if (!isUserBlacklisted && !isGuildBlacklisted) {
				return this._sendSuccess(
					message,
					i18n.translateTitle("Not Blacklisted"),
					`${emoji.get("check")} ${i18n.cmd("**ID `{id}` is not blacklisted.**", { id })}\n\n${emoji.get("info")} ${i18n.cmd("This ID is clean and can use the bot normally.")}`
				);
			}

			const type = isUserBlacklisted ? "user" : "guild";
			const typeIcon = type === "user" ? "👤" : "🏠";

			return this._sendError(
				message,
				"Blacklisted",
				i18n.cmd("{emoji} **{type} is blacklisted!**\n\n{typeIcon} **Target:** `{id}`\n{info} **Type:** {value}", { emoji: emoji.get("cross"), type: type === "user" ? i18n.cmd("User") : i18n.cmd("Guild"), typeIcon, id, info: emoji.get("info"), value: type.charAt(0).toUpperCase() + type.slice(1) })
			);
		} catch (error: any) {
			logger.error("BlacklistCommand", "Error checking blacklist:", error);
			return this._sendError(message, "Error", `${emoji.get("cross")} ${i18n.cmd("**Database Error:**")}\n${error.message}`);
		}
	}

	_createHelpContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(i18n.cmd("### {emoji} {title}", { emoji: emoji.get("info"), title: i18n.translateTitle("Blacklist Commands Help") }))
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		const content = i18n.cmd(
			"{cross} **Available Commands:**\n" +
			"`blacklist add <user|guild> <id> [reason]` - Add to blacklist\n" +
			"`blacklist remove <id>` - Remove from blacklist\n" +
			"`blacklist check <id>` - Check blacklist status\n\n" +
			"{info} **ID Formats:**\n" +
			"{check} User ID: `123456789`\n" +
			"{check} User mention: `@user`\n" +
			"{check} Guild ID: `987654321`\n\n" +
			"📝 **Examples:**\n" +
			"{cross} `blacklist add user 123456789 Spam`\n" +
			"{cross} `blacklist add guild 987654321 ToS violation`\n" +
			"{check} `blacklist remove 123456789`\n" +
			"{info} `blacklist check @user`",
			{ cross: emoji.get("cross"), info: emoji.get("info"), check: emoji.get("check") }
		);

		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(content)
				)
				.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		return container;
	}

	_sendSuccess(message: Message, title: string, description: string) {
		const container = new ContainerBuilder();
		const localizedTitle = i18n.translateTitle(title);

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`### ${emoji.get("check")} ${localizedTitle}`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(description)
				)
				.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		return message.reply({
			components: [container],
			flags: MessageFlags.IsComponentsV2
		});
	}

	_sendError(message: Message, title: string, description: string) {
		const container = new ContainerBuilder();
		const localizedTitle = i18n.translateTitle(title);

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`### ${emoji.get("cross")} ${localizedTitle}`)
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(description)
				)
				.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		return message.reply({
			components: [container],
			flags: MessageFlags.IsComponentsV2
		});
	}
}

export default new BlacklistCommand();

// Made by Nikhil Under CodeX Devs
