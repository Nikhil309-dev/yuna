import type { Message } from 'discord.js';
import { Command } from "#core/Command";
import { db } from "#database/Database";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	TextDisplayBuilder,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	ThumbnailBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	UserSelectMenuBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	MessageFlags
} from "discord.js";

import type { YunaClient } from "#core/YunaClient";
import { config } from "#config/config";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";
import { i18n } from "#utils/i18n";

/** Shared brand footer so every blacklist card matches the rest of the bot. */
const BRAND_FOOTER = 'Built with ♥ under CodeX Development';
const DEFAULT_REASON = 'Blacklisted by owner';

class BlacklistCommand extends Command {
	constructor() {
		super({
			name: "blacklist",
			description: "Manage blacklisted users and guilds (Owner Only)",
			usage: "blacklist <add|remove|check> [type/id] [id] [reason]",
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

			// No args → open the interactive dashboard with buttons + collector.
			if (!args.length) {
				const helpMsg: Message = await message.reply({
					components: [this._helpContainer(client)],
					flags: MessageFlags.IsComponentsV2
				});
				this._setupCollector(helpMsg, message.author.id, client);
				return helpMsg;
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

	// ────────────────────────────────────────────────────────────────────────────
	// Card / container builders
	// ────────────────────────────────────────────────────────────────────────────

	/** title → separator → body (optionally with thumbnail). No footer. */
	_card(icon: string, title: string, body: string, thumbnail = false) {
		const container = new ContainerBuilder();
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${icon} ${title}`));
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
		if (thumbnail) {
			container.addSectionComponents(
				new SectionBuilder()
					.addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
					.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
			);
		} else {
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
		}
		return container;
	}

	/** Appends separator + brand footer to any container. */
	_footer(container: ContainerBuilder) {
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${BRAND_FOOTER}`));
		return container;
	}

	/** Interactive card: title → sep → body → sep → row(s) → sep → footer. */
	_actionCard(icon: string, title: string, body: string, ...rows: ActionRowBuilder<any>[]) {
		const container = this._card(icon, title, body, false);
		for (const row of rows) {
			container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
			container.addActionRowComponents(row);
		}
		return this._footer(container);
	}

	// ────────────────────────────────────────────────────────────────────────────
	// Dashboard steps
	// ────────────────────────────────────────────────────────────────────────────

	_helpContainer(client?: YunaClient) {
		const body = i18n.cmd(
			"{info} **Pick an action below.** Everything works with buttons and menus — no need to memorise commands.\n\n" +
			"{add} **Add** — blacklist a user or a guild\n" +
			"{cross} **Remove** — lift an existing blacklist\n" +
			"{check} **Check** — look up a user or guild\n\n" +
			"{dot} Prefer typing? `blacklist add <user|guild> <id> [reason]` still works.",
			{ info: emoji.get("info"), add: emoji.get("add"), cross: emoji.get("cross"), check: emoji.get("check"), dot: "•" }
		);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId('bl_help_add').setLabel('Add').setEmoji(emoji.get('add')).setStyle(ButtonStyle.Success),
			new ButtonBuilder().setCustomId('bl_help_remove').setLabel('Remove').setEmoji(emoji.get('cross')).setStyle(ButtonStyle.Danger),
			new ButtonBuilder().setCustomId('bl_help_check').setLabel('Check').setEmoji(emoji.get('info')).setStyle(ButtonStyle.Primary),
			new ButtonBuilder().setCustomId('bl_help_close').setLabel('Close').setEmoji(emoji.get('cross')).setStyle(ButtonStyle.Secondary),
		);

		return this._actionCard('🛡️', i18n.translateTitle('Blacklist Dashboard'), body, row);
	}

	/** Step 1 of Add: choose user vs guild. */
	_addTypeContainer() {
		const body = i18n.cmd(
			"{info} **What do you want to blacklist?**\n\n" +
			"👤 **User** — blocks a single person everywhere\n" +
			"🏠 **Guild** — blocks an entire server\n\n" +
			"{dot} Choose below, then pick the target or type its ID.",
			{ info: emoji.get("info"), dot: "•" }
		);

		const typeRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId('bl_add_type')
				.setPlaceholder('Select blacklist type…')
				.addOptions(
					new StringSelectMenuOptionBuilder().setLabel('User').setValue('user').setEmoji('👤').setDescription('Blacklist a single user'),
					new StringSelectMenuOptionBuilder().setLabel('Guild').setValue('guild').setEmoji('🏠').setDescription('Blacklist an entire server'),
				)
		);
		const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId('bl_back').setLabel('Back').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId('bl_help_close').setLabel('Close').setEmoji(emoji.get('cross')).setStyle(ButtonStyle.Secondary),
		);

		return this._actionCard(emoji.get('add'), i18n.translateTitle('Blacklist · Add'), body, typeRow, buttonRow);
	}

	/** Step 2 (user): pick a user or enter an ID manually. */
	_userPickContainer() {
		const body = i18n.cmd(
			"{info} **Select the user to blacklist** from the menu — or press **Enter ID manually** to type an ID / mention and an optional reason.",
			{ info: emoji.get("info") }
		);

		const userRow = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
			new UserSelectMenuBuilder().setCustomId('bl_add_user').setPlaceholder('Search for a user…').setMinValues(1).setMaxValues(1)
		);
		const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId('bl_add_manual_user').setLabel('Enter ID manually').setEmoji('⌨️').setStyle(ButtonStyle.Primary),
			new ButtonBuilder().setCustomId('bl_back').setLabel('Back').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId('bl_help_close').setLabel('Close').setEmoji(emoji.get('cross')).setStyle(ButtonStyle.Secondary),
		);

		return this._actionCard('👤', i18n.translateTitle('Blacklist · Add User'), body, userRow, buttonRow);
	}

	/** Step 2 (guild): searchable list of the bot's guilds, or manual ID. */
	_guildPickContainer(client: YunaClient) {
		const guilds = client?.guilds?.cache ? [...client.guilds.cache.values()] : [];
		const options = guilds.slice(0, 25).map((g: any) =>
			new StringSelectMenuOptionBuilder()
				.setLabel((g.name || g.id).slice(0, 100))
				.setValue(g.id)
				.setDescription(`${g.memberCount ?? '?'} members · ${g.id}`.slice(0, 100))
		);

		const body = guilds.length
			? i18n.cmd(
				"{info} **Search and select the guild to blacklist** from the menu below — or press **Enter ID manually** for a server the bot is not in.\n\n{dot} Showing **{n}** of the bot's guilds.",
				{ info: emoji.get("info"), dot: "•", n: String(guilds.length) }
			)
			: i18n.cmd(
				"{info} The bot is not in any guilds, so there is nothing to list. Use **Enter ID manually** to blacklist a guild by ID.",
				{ info: emoji.get("info") }
			);

		const rows: ActionRowBuilder<any>[] = [];
		if (options.length) {
			rows.push(
				new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
					new StringSelectMenuBuilder().setCustomId('bl_add_guild').setPlaceholder('Search for a guild…').addOptions(options)
				)
			);
		}
		rows.push(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId('bl_add_manual_guild').setLabel('Enter ID manually').setEmoji('⌨️').setStyle(ButtonStyle.Primary),
				new ButtonBuilder().setCustomId('bl_back').setLabel('Back').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
				new ButtonBuilder().setCustomId('bl_help_close').setLabel('Close').setEmoji(emoji.get('cross')).setStyle(ButtonStyle.Secondary),
			)
		);

		return this._actionCard('🏠', i18n.translateTitle('Blacklist · Add Guild'), body, ...rows);
	}

	/** Remove step: prompt for an ID via modal. */
	_removeContainer() {
		const body = i18n.cmd(
			"{info} **Lift a blacklist.** Press the button to enter a **user or guild ID** (a mention works too).",
			{ info: emoji.get("info") }
		);
		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId('bl_remove_btn').setLabel('Enter ID').setEmoji('⌨️').setStyle(ButtonStyle.Primary),
			new ButtonBuilder().setCustomId('bl_back').setLabel('Back').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId('bl_help_close').setLabel('Close').setEmoji(emoji.get('cross')).setStyle(ButtonStyle.Secondary),
		);
		return this._actionCard(emoji.get('cross'), i18n.translateTitle('Blacklist · Remove'), body, row);
	}

	/** Check step: prompt for an ID via modal. */
	_checkContainer() {
		const body = i18n.cmd(
			"{info} **Look up a blacklist entry.** Press the button to enter a **user or guild ID** (a mention works too).",
			{ info: emoji.get("info") }
		);
		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId('bl_check_btn').setLabel('Enter ID').setEmoji('🔎').setStyle(ButtonStyle.Primary),
			new ButtonBuilder().setCustomId('bl_back').setLabel('Back').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId('bl_help_close').setLabel('Close').setEmoji(emoji.get('cross')).setStyle(ButtonStyle.Secondary),
		);
		return this._actionCard(emoji.get('info'), i18n.translateTitle('Blacklist · Check'), body, row);
	}

	// ────────────────────────────────────────────────────────────────────────────
	// Modals
	// ────────────────────────────────────────────────────────────────────────────

	_buildModal(customId: string, title: string, withReason: boolean) {
		const modal = new ModalBuilder().setCustomId(customId).setTitle(title.slice(0, 45));
		const idInput = new TextInputBuilder()
			.setCustomId('bl_input_id')
			.setLabel('User or Guild ID')
			.setPlaceholder('e.g. 123456789012345678 or @mention')
			.setStyle(TextInputStyle.Short)
			.setRequired(true)
			.setMaxLength(100);
		modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(idInput));
		if (withReason) {
			const reasonInput = new TextInputBuilder()
				.setCustomId('bl_input_reason')
				.setLabel('Reason (optional)')
				.setPlaceholder(DEFAULT_REASON)
				.setStyle(TextInputStyle.Paragraph)
				.setRequired(false)
				.setMaxLength(300);
			modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
		}
		return modal;
	}

	// ────────────────────────────────────────────────────────────────────────────
	// Collector wiring
	// ────────────────────────────────────────────────────────────────────────────

	_setupCollector(msg: Message, authorId: string, client: YunaClient) {
		const collector = (msg as any).createMessageComponentCollector({
			time: 300_000,
			filter: (i: any) => typeof i.customId === 'string' && i.customId.startsWith('bl_')
		});

		collector.on('collect', async (interaction: any) => {
			if (interaction.user.id !== authorId) {
				return interaction.reply({ content: i18n.cmd('These controls are not for you.'), flags: MessageFlags.Ephemeral }).catch(() => {});
			}

			const id: string = interaction.customId;
			try {
				// — Navigation —
				if (id === 'bl_help_close') {
					collector.stop('closed');
					return this._edit(interaction, this._footer(this._card('🔒', i18n.translateTitle('Blacklist Dashboard'), i18n.cmd('Dashboard closed. Run `.blacklist` to open it again.'))));
				}
				if (id === 'bl_back') return this._edit(interaction, this._helpContainer(client));
				if (id === 'bl_help_add') return this._edit(interaction, this._addTypeContainer());
				if (id === 'bl_help_remove') return this._edit(interaction, this._removeContainer());
				if (id === 'bl_help_check') return this._edit(interaction, this._checkContainer());

				// — Add: type selection —
				if (id === 'bl_add_type') {
					const choice = interaction.values?.[0];
					return this._edit(interaction, choice === 'guild' ? this._guildPickContainer(client) : this._userPickContainer());
				}

				// — Add: pickers —
				if (id === 'bl_add_user') {
					return this._edit(interaction, this._blacklistUser(interaction.values?.[0], DEFAULT_REASON));
				}
				if (id === 'bl_add_guild') {
					return this._edit(interaction, this._blacklistGuild(interaction.values?.[0], DEFAULT_REASON));
				}

				// — Manual modals —
				if (id === 'bl_add_manual_user') return await this._manual(interaction, authorId, 'bl_modal_user', 'Blacklist User', true, 'user');
				if (id === 'bl_add_manual_guild') return await this._manual(interaction, authorId, 'bl_modal_guild', 'Blacklist Guild', true, 'guild');
				if (id === 'bl_remove_btn') return await this._manual(interaction, authorId, 'bl_modal_remove', 'Remove Blacklist', false, 'remove');
				if (id === 'bl_check_btn') return await this._manual(interaction, authorId, 'bl_modal_check', 'Check Blacklist', false, 'check');
			} catch (error: any) {
				logger.error('BlacklistCommand', `Collector error (${id}):`, error);
				if (!interaction.replied && !interaction.deferred) {
					interaction.reply({ content: i18n.cmd('Something went wrong handling that action.'), flags: MessageFlags.Ephemeral }).catch(() => {});
				}
			}
		});
	}

	/** Opens a modal, awaits submission, and routes the values to a handler. */
	async _manual(interaction: any, authorId: string, modalId: string, title: string, withReason: boolean, kind: 'user' | 'guild' | 'remove' | 'check') {
		await interaction.showModal(this._buildModal(modalId, title, withReason));
		const submitted = await interaction.awaitModalSubmit({
			time: 180_000,
			filter: (i: any) => i.customId === modalId && i.user.id === authorId
		}).catch(() => null);
		if (!submitted) return;

		const id = this._normalizeId((submitted.fields.getTextInputValue('bl_input_id') || '').trim());
		const reason = withReason
			? ((submitted.fields.getTextInputValue('bl_input_reason') || '').trim() || DEFAULT_REASON)
			: DEFAULT_REASON;

		let container: ContainerBuilder;
		if (kind === 'user') container = this._blacklistUser(id, reason);
		else if (kind === 'guild') container = this._blacklistGuild(id, reason);
		else if (kind === 'remove') container = this._removeEntry(id);
		else container = this._checkEntry(id);

		return this._edit(submitted, container);
	}

	// ────────────────────────────────────────────────────────────────────────────
	// Operations → containers
	// ────────────────────────────────────────────────────────────────────────────

	_normalizeId(raw: string) {
		let id = raw;
		if (id.startsWith('<@') && id.endsWith('>')) {
			id = id.slice(2, -1);
			if (id.startsWith('!') || id.startsWith('&')) id = id.slice(1);
		}
		return id;
	}

	_blacklistUser(id: string, reason: string) {
		if (!/^\d{15,25}$/.test(id)) {
			return this._footer(this._card(emoji.get('cross'), i18n.translateTitle('Invalid ID'), i18n.cmd('`{id}` is not a valid user ID. Paste a numeric ID or a mention.', { id })));
		}
		try {
			if (db.isUserBlacklisted(id)) {
				return this._footer(this._card(emoji.get('cross'), i18n.translateTitle('Already Blacklisted'), i18n.cmd('👤 User `{id}` is already blacklisted.', { id })));
			}
			(db.users as any).blacklistUser(id, reason);
			return this._footer(this._card(emoji.get('check'), i18n.translateTitle('User Blacklisted'), i18n.cmd('👤 **Target:** `{id}`\n📝 **Reason:** {reason}', { id, reason })));
		} catch (error: any) {
			logger.error('BlacklistCommand', 'blacklistUser failed:', error);
			return this._footer(this._card(emoji.get('cross'), i18n.translateTitle('Database Error'), error.message));
		}
	}

	_blacklistGuild(id: string, reason: string) {
		if (!/^\d{15,25}$/.test(id)) {
			return this._footer(this._card(emoji.get('cross'), i18n.translateTitle('Invalid ID'), i18n.cmd('`{id}` is not a valid guild ID. Paste a numeric ID.', { id })));
		}
		try {
			if (db.isGuildBlacklisted(id)) {
				return this._footer(this._card(emoji.get('cross'), i18n.translateTitle('Already Blacklisted'), i18n.cmd('🏠 Guild `{id}` is already blacklisted.', { id })));
			}
			(db.guilds as any).blacklistGuild(id, reason);
			return this._footer(this._card(emoji.get('check'), i18n.translateTitle('Guild Blacklisted'), i18n.cmd('🏠 **Target:** `{id}`\n📝 **Reason:** {reason}', { id, reason })));
		} catch (error: any) {
			logger.error('BlacklistCommand', 'blacklistGuild failed:', error);
			return this._footer(this._card(emoji.get('cross'), i18n.translateTitle('Database Error'), error.message));
		}
	}

	_removeEntry(id: string) {
		try {
			const isUser = db.isUserBlacklisted(id);
			const isGuild = db.isGuildBlacklisted(id);
			if (!isUser && !isGuild) {
				return this._footer(this._card(emoji.get('cross'), i18n.translateTitle('Not Blacklisted'), i18n.cmd('ID `{id}` is not blacklisted.', { id })));
			}
			const result = isUser ? (db.users as any).unblacklistUser(id) : (db.guilds as any).unblacklistGuild(id);
			if (result && result.changes > 0) {
				return this._footer(this._card(emoji.get('check'), i18n.translateTitle('Removed from Blacklist'), i18n.cmd('{type} `{id}` has been removed from the blacklist.', { type: isUser ? '👤 User' : '🏠 Guild', id })));
			}
			return this._footer(this._card(emoji.get('cross'), i18n.translateTitle('Remove Failed'), i18n.cmd('Failed to remove `{id}` from the blacklist.', { id })));
		} catch (error: any) {
			logger.error('BlacklistCommand', 'remove failed:', error);
			return this._footer(this._card(emoji.get('cross'), i18n.translateTitle('Database Error'), error.message));
		}
	}

	_checkEntry(id: string) {
		try {
			const isUser = db.isUserBlacklisted(id);
			const isGuild = db.isGuildBlacklisted(id);
			if (!isUser && !isGuild) {
				return this._footer(this._card(emoji.get('check'), i18n.translateTitle('Not Blacklisted'), i18n.cmd('✅ ID `{id}` is clean and can use the bot normally.', { id })));
			}
			const type = isUser ? '👤 User' : '🏠 Guild';
			return this._footer(this._card(emoji.get('cross'), i18n.translateTitle('Blacklisted'), i18n.cmd('{type} `{id}` is currently blacklisted.', { type, id })));
		} catch (error: any) {
			logger.error('BlacklistCommand', 'check failed:', error);
			return this._footer(this._card(emoji.get('cross'), i18n.translateTitle('Database Error'), error.message));
		}
	}

	_edit(interaction: any, container: ContainerBuilder) {
		return interaction.update({
			components: [container],
			flags: MessageFlags.IsComponentsV2
		}).catch((e: any) => logger.error('BlacklistCommand', 'update failed:', e));
	}

	// ────────────────────────────────────────────────────────────────────────────
	// Text-input (prefix args) path
	// ────────────────────────────────────────────────────────────────────────────

	async _handleAdd(client: any, message: any, args: any) {
		if (args.length < 2) {
			return this._sendError(
				message,
				i18n.translateTitle("Usage Error"),
				i18n.cmd("{emoji} **Command Format:**\nblacklist add <user|guild> <id> [reason]\n\n{emoji} **Default reason:** Blacklisted by owner", { emoji: emoji.get("info") })
			);
		}
		const type = args[0].toLowerCase();
		const id = this._normalizeId(args[1]);
		const reason = args.slice(2).join(" ") || DEFAULT_REASON;
		if (!["user", "guild"].includes(type)) {
			return this._sendError(message, "Invalid Type", `${emoji.get("cross")} ${i18n.cmd("Type must be either **user** or **guild**.")}`);
		}
		try {
			if (type === "user") {
				if (db.isUserBlacklisted(id)) {
					return this._sendError(message, i18n.translateTitle("Already Blacklisted"), `${emoji.get("cross")} ${i18n.cmd("User `{id}` is already blacklisted.", { id })}`);
				}
				(db.users as any).blacklistUser(id, reason);
			} else {
				if (db.isGuildBlacklisted(id)) {
					return this._sendError(message, i18n.translateTitle("Already Blacklisted"), `${emoji.get("cross")} ${i18n.cmd("Guild `{id}` is already blacklisted.", { id })}`);
				}
				(db.guilds as any).blacklistGuild(id, reason);
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
		const id = this._normalizeId(args[0]);
		try {
			const isUserBlacklisted = db.isUserBlacklisted(id);
			const isGuildBlacklisted = db.isGuildBlacklisted(id);
			if (!isUserBlacklisted && !isGuildBlacklisted) {
				return this._sendError(message, i18n.translateTitle("Not Blacklisted"), `${emoji.get("cross")} ${i18n.cmd("ID `{id}` is not blacklisted.", { id })}`);
			}
			const result = isUserBlacklisted ? (db.users as any).unblacklistUser(id) : (db.guilds as any).unblacklistGuild(id);
			const type = isUserBlacklisted ? "user" : "guild";
			if (result && result.changes > 0) {
				const typeIcon = type === "user" ? "👤" : "🏠";
				return this._sendSuccess(
					message,
					i18n.translateTitle("Removed from Blacklist"),
					`${emoji.get("check")} ${i18n.cmd("**Successfully removed {type} from blacklist!**", { type })}\n\n${typeIcon} ${i18n.cmd("**Target:** `{id}`", { id })}`
				);
			}
			return this._sendError(message, "Remove Failed", `${emoji.get("cross")} ${i18n.cmd("Failed to remove `{id}` from blacklist.", { id })}`);
		} catch (error: any) {
			logger.error("BlacklistCommand", "Error removing from blacklist:", error);
			return this._sendError(message, "Error", `${emoji.get("cross")} ${i18n.cmd("**Database Error:**")}\n${error.message}`);
		}
	}

	async _handleCheck(client: any, message: any, args: any) {
		if (args.length < 1) {
			return this._sendError(message, "Usage Error", `${emoji.get("info")} ${i18n.cmd("**Command Format:**")}\nblacklist check <id>`);
		}
		const id = this._normalizeId(args[0]);
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
				i18n.cmd("{emoji} **{type} is blacklisted!**\n\n{typeIcon} **Target:** `{id}`\n{info} **Type:** {value}", { emoji: emoji.get("cross"), type: i18n.cmd(type === "user" ? "User" : "Guild"), typeIcon, id, info: emoji.get("info"), value: type.charAt(0).toUpperCase() + type.slice(1) })
			);
		} catch (error: any) {
			logger.error("BlacklistCommand", "Error checking blacklist:", error);
			return this._sendError(message, "Error", `${emoji.get("cross")} ${i18n.cmd("**Database Error:**")}\n${error.message}`);
		}
	}

	_sendSuccess(message: Message, title: string, description: string) {
		const container = this._card(emoji.get("check"), i18n.translateTitle(title), description, true);
		return message.reply({ components: [this._footer(container)], flags: MessageFlags.IsComponentsV2 });
	}

	_sendError(message: Message, title: string, description: string) {
		const container = this._card(emoji.get("cross"), i18n.translateTitle(title), description, true);
		return message.reply({ components: [this._footer(container)], flags: MessageFlags.IsComponentsV2 });
	}
}

export default new BlacklistCommand();

// Made by Nikhil Under CodeX Devs
