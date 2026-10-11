import type { Message, Interaction, CommandInteraction } from 'discord.js';
import type { YunaClient } from '#core/YunaClient';
import { Command } from "#core/Command";
import { ButtonStyle, MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, SectionBuilder, ThumbnailBuilder, ActionRowBuilder, ButtonBuilder } from "discord.js";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import { componentCollectorSource } from "#ui/Components";
import { db } from "#database/Database";
import { config } from "#config/config";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";

const PLAYLISTS_PER_PAGE = 5;

class MyPlaylistsCommand extends Command {
	constructor() {
		super({
			name: "my-playlists",
			description: "View all of your custom playlists",
			usage: "my-playlists [page]",
			aliases: ["my-pl", "playlists"],
			category: "music",
			examples: ["my-playlists", "my-pl 2"],
			cooldown: 3,
			slash: {
				enabled: true,
				autoDefer: true,
				data: {
					name: "my-playlists",
					description: "View all of your custom playlists",
					options: [
						{
							name: "page",
							description: i18n.cmd("The page number to view"),
							type: 4,
							required: false,
						},
					],
				},
			},
		});
	}

	async execute(ctx: any) {
		const { client, message, interaction, player, pm, args = [] } = ctx;
		const context = interaction || message;
		const page = interaction ? (interaction.options.getInteger("page") || 1) : (args[0] ? parseInt(args[0], 10) : 1);
		return this._handleList(context.user || context.author, context, isNaN(page) ? 1 : page);
	}

	async slashExecute(ctx: any) {
		return this.execute(ctx);
	}

	async _handleList(user: any, context: any, page: any) {
		const playlists = db.playlists.getUserPlaylists(user.id);

		if (playlists.length === 0) {
			return this._reply(context, this._createNoPlaylistsContainer());
		}

		const message = await this._reply(
			context,
			this._buildPlaylistsContainer(playlists, page),
		);
		if (message) {
			this._setupCollector(message, user.id, playlists, page);
		}
	}

	_buildPlaylistsContainer(playlists: any, page: any) {
		const container = new ContainerBuilder();
		container.setAccentColor(0x5865F2);
		const totalPages = Math.ceil(playlists.length / PLAYLISTS_PER_PAGE) || 1;
		page = Math.max(1, Math.min(page, totalPages));

		const startIdx = (page - 1) * PLAYLISTS_PER_PAGE;
		const pagePlaylists = playlists.slice(
			startIdx,
			startIdx + PLAYLISTS_PER_PAGE,
		);

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				i18n.cmd("{emoji} **{title}**", { emoji: emoji.get("folder"), title: i18n.translateTitle("Your Custom Playlists") }),
			),
		);
		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		let content = i18n.cmd("**Page {page} of {total}** ({count} total playlists)\n\n", { page, total: totalPages, count: playlists.length });
		pagePlaylists.forEach((pl: any, index: any) => {
			const globalIndex = startIdx + index + 1;
			const shortId = pl.id.replace("pl_", "").substring(0, 8);
			content +=
				`**${globalIndex}. ${pl.name}**\n` +
				`   └─ ${emoji.get("info")} **ID:** \`${shortId}\`\n` +
				`   └─ ${emoji.get("music")} **Tracks:** ${pl.track_count}\n` +
				`   └─ ${emoji.get("reset")} **Duration:** ${this._formatDuration(pl.total_duration)}\n`;
		});

		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))

				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(config.assets.defaultThumbnail),
				),
		);

		const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`mypl_prev_${page}`)
				.setLabel(i18n.cmd("Previous"))
				.setStyle(ButtonStyle.Secondary)
				.setEmoji(emoji.get("left"))
				.setDisabled(page <= 1),
			new ButtonBuilder()
				.setCustomId(`mypl_next_${page}`)
				.setLabel(i18n.cmd("Next"))
				.setStyle(ButtonStyle.Secondary)
				.setEmoji(emoji.get("right"))
				.setDisabled(page >= totalPages),
			new ButtonBuilder()
				.setCustomId("mypl_close")
				.setLabel(i18n.cmd("Close"))
				.setStyle(ButtonStyle.Danger),
		);
		container.addActionRowComponents(buttons);

		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${phrases.get("playlistLoaded")}`));

		return container;
	}

	_setupCollector(message: any, userId: any, playlists: any, initialPage: any) {
		const collector = componentCollectorSource(message).createMessageComponentCollector({
			time: 300000,
		});
		let currentPage = initialPage;

		collector.on("collect", async (interaction: any) => {
			if (!interaction.customId.startsWith("mypl_")) return;

			if (interaction.user.id !== userId) {
				return (interaction.deferred || interaction.replied ? interaction.editReply.bind(interaction) : interaction.reply.bind(interaction))({
					components: [buildError("Access Denied")],
					flags: MessageFlags.IsComponentsV2,
					ephemeral: true,
				});
			}

			if (interaction.customId === "mypl_close") {
				return interaction.update({ components: [this._createExpiredContainer()] });
			}

			const [_, action, pageStr] = interaction.customId.split("_");
			if (action !== "prev" && action !== "next") return;

			await interaction.deferUpdate();
			const page = parseInt(pageStr, 10);

			if (action === "prev") currentPage = page - 1;
			if (action === "next") currentPage = page + 1;

			await interaction.editReply({
				components: [this._buildPlaylistsContainer(playlists, currentPage)],
			});
		});

		collector.on("end", async () => {
			try {
				if (message)
					await message.edit({
						components: [this._createExpiredContainer()],
						flags: MessageFlags.IsComponentsV2,
					});
			} catch (error: any) {
				if (error.code !== 10008)
					logger.error(
						"MyPlaylists",
						i18n.cmd("Failed to clear components on end"),
						error,
					);
			}
		});
	}

	_createExpiredContainer() {
		return buildContainer({
			title: i18n.translateTitle("Interaction Expired"),
			content: `${emoji.get("info")} ${i18n.cmd("**This menu has expired. Run `/my-playlists` again.**")}`,
			icon: emoji.get("info") || "ℹ️"
		});
	}
	_createNoPlaylistsContainer() {
		return buildError(
			i18n.cmd("You don't have any custom playlists yet.\n\nUse `/create-playlist <name>` to get started!"),
			i18n.translateTitle("No Playlists Found")
		);
	}

	_formatDuration(ms: number) {
		if (!ms || ms < 0) return "0:00";
		const totalSeconds = Math.floor(ms / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		if (hours > 0)
			return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
		return `${minutes}:${seconds.toString().padStart(2, "0")}`;
	}

	async _reply(context: any, container: any) {
		const payload = {
			components: [container],
			flags: MessageFlags.IsComponentsV2,
			fetchReply: true,
		};
		if (context.replied || context.deferred) return context.editReply(payload);
		return (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload);
	}
}

export default new MyPlaylistsCommand();

// Made by Nikhil Under CodeX Devs
