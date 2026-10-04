import { Command } from "#core/Command";
import { MessageFlags, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { buildContainer, buildSuccess, buildError } from "#ui/Theme";
import { componentCollectorSource } from "#ui/Components";
import { db } from "#database/Database";
import { i18n } from "#utils/i18n.js";
import { localeFor } from "#utils/locale.js";
import { logger } from "#utils/logger";

class ServerLanguageCommand extends Command {
	constructor() {
		super({
			name: "server-language",
			description: "Change the default language Yuna uses for this entire server",
			usage: "server-language",
			aliases: ["serverlang", "serverlocale"],
			category: "settings",
			slash: {
				enabled: true,
				autoDefer: true,
				data: {
					name: "server-language",
					description: "Change the default language Yuna uses for this entire server",
				},
			},
		});
	}

	async execute(ctx: any) {
		const { message, interaction, guild, user, author } = ctx;
		const context = interaction || message;
		const userId = user?.id || author?.id;
		const guildId = guild?.id;

		const locale = localeFor(userId, guildId);
		const tr = (key: string, replacements: Record<string, any> = {}) => i18n.ui(locale, key, replacements);

		if (!guildId) {
			return ctx.replyError ? ctx.replyError(tr("common.guildOnly")) : null;
		}

		if (guild.ownerId !== userId) {
			const errContainer = buildError(tr("lang.ownerOnly"), tr("lang.accessDenied"));
			const payload = { components: [errContainer], flags: MessageFlags.IsComponentsV2 };
			if (context.replied || context.deferred) return context.editReply(payload);
			if (typeof context.reply === "function") return context.reply(payload);
			return context.channel.send(payload);
		}

		const currentLocaleCode = i18n.normalize(db.guilds.getLocale(guildId) || "en-US");
		const currentMeta = i18n.getLocaleMeta(currentLocaleCode) || i18n.getLocaleMeta("en-US");

		const options: any[] = [];
		i18n.getLocales().forEach((data, code) => {
			options.push({
				label: data.meta.nativeName || code,
				description: tr("lang.setServerLanguageTo", { name: data.meta.name }),
				value: code,
				emoji: data.meta.emoji || "🌐",
				default: code === currentLocaleCode,
			});
		});

		const selectMenu = new StringSelectMenuBuilder()
			.setCustomId("server_lang_select")
			.setPlaceholder(tr("lang.selectServerPlaceholder"))
			.addOptions(options);

		const row1 = new ActionRowBuilder().addComponents(selectMenu);

		const content = `**${tr("lang.currentServerLanguage")}:** ${currentMeta?.emoji} **${currentMeta?.nativeName}**\n\n${tr("lang.pickServerPrompt")}`;

		const initialContainer = buildContainer({
			title: tr("title.serverLanguageSettings"),
			content,
			icon: "🌐",
		});

		const payload = {
			components: [initialContainer, row1],
			flags: MessageFlags.IsComponentsV2,
			fetchReply: true,
		};

		let msgInstance;
		if (context.replied || context.deferred) {
			msgInstance = await context.editReply(payload);
		} else if (typeof context.reply === "function") {
			msgInstance = await context.reply(payload);
		} else {
			msgInstance = await context.channel.send(payload);
		}

		this._setupCollector(msgInstance, userId, guildId, locale);
	}

	async slashExecute(ctx: any) {
		return this.execute(ctx);
	}

	_setupCollector(messageInstance: any, userId: string, guildId: string, locale: string) {
		const collector = componentCollectorSource(messageInstance).createMessageComponentCollector({
			filter: (i: any) => i.user.id === userId,
			time: 120_000,
		});

		let selectedLocaleCode = "";

		collector.on("collect", async (interaction: any) => {
			try {
				if (interaction.customId === "server_lang_select") {
					selectedLocaleCode = i18n.normalize(interaction.values[0]);
					const meta = i18n.getLocaleMeta(selectedLocaleCode);

					const sel = (key: string, replacements: Record<string, any> = {}) =>
						i18n.ui(selectedLocaleCode, key, replacements);

					const currentLocaleCode = i18n.normalize(db.guilds.getLocale(guildId) || "en-US");
					const oldPreview = i18n.t(currentLocaleCode, "languagePreviewTest");
					const newPreview = i18n.t(selectedLocaleCode, "languagePreviewTest");

					const previewContent = `**${sel("lang.uiPreview")}:**\n> 🇺🇸 "${oldPreview}"\n> ⬇️\n> ${meta?.emoji} "${newPreview}"\n\n${sel("lang.confirmSaveServer")}`;

					const previewContainer = buildContainer({
						title: sel("title.previewServerLanguage"),
						content: previewContent,
						icon: meta?.emoji || "🌐",
					});

					const btnRow = new ActionRowBuilder().addComponents(
						new ButtonBuilder().setCustomId("server_lang_confirm").setLabel(sel("lang.yesApplyServer")).setStyle(ButtonStyle.Success),
						new ButtonBuilder().setCustomId("server_lang_cancel").setLabel(sel("lang.no")).setStyle(ButtonStyle.Danger)
					);

					await interaction.update({
						components: [previewContainer, btnRow],
						flags: MessageFlags.IsComponentsV2,
					});
				} else if (interaction.customId === "server_lang_confirm") {
					db.guilds.setLocale(guildId, selectedLocaleCode);
					const successMsg = i18n.t(selectedLocaleCode, "languageSuccess");

					const successContainer = buildSuccess(successMsg, i18n.ui(selectedLocaleCode, "title.serverLanguageUpdated"));

					await interaction.update({
						components: [successContainer],
						flags: MessageFlags.IsComponentsV2,
					});
					collector.stop("confirmed");
				} else if (interaction.customId === "server_lang_cancel") {
					await interaction.update({
						components: [buildError(i18n.ui(selectedLocaleCode || locale, "lang.serverCancelled"))],
						flags: MessageFlags.IsComponentsV2,
					});
					collector.stop("cancelled");
				}
			} catch (error) {
				logger.error("ServerLanguageCommand", "Error in collector", error);
			}
		});

		collector.on("end", async (collected: any, reason: string) => {
			if (reason === "time") {
				try {
					await messageInstance.edit({
						components: [buildError(i18n.ui(locale, "lang.timedOut"))],
						flags: MessageFlags.IsComponentsV2,
					});
				} catch (e) {}
			}
		});
	}
}

export default new ServerLanguageCommand();

// Made by Nikhil Under CodeX Devs
