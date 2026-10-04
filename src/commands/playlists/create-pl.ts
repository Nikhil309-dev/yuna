import type { Message, Interaction, CommandInteraction } from 'discord.js';
import type { YunaClient } from '#core/YunaClient';
import { Command } from "#core/Command";
import { MessageFlags } from "discord.js";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import { db } from "#database/Database";
import { config } from "#config/config";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";

class CreatePlaylistCommand extends Command {
	constructor() {
		super({
			name: "create-playlist",
			description: "Create a new custom playlist",
			usage: "create-playlist <name> [description]",
			aliases: ["create-pl", "new-playlist", "make-playlist"],
			category: "music",
			examples: [
				"create-playlist My Favorites",
				"create-pl Chill Vibes A relaxing collection",
				"new-playlist Rock Classics Best rock songs ever",
			],
			cooldown: 3,
			slash: {
				enabled: true,
				autoDefer: true,
				data: {
					name: "create-playlist",
					description: "Create a new custom playlist",
				options: [
					{
						name: "name",
						description: i18n.cmd("Playlist name"),
						type: 3,
						required: true,
					},
					{
						name: "description",
						description: i18n.cmd("Playlist description (optional)"),
						type: 3,
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
		let name, description;

		if (interaction) {
			name = interaction.options.getString("name");
			description = interaction.options.getString("description") || null;
		} else {
			if (args.length === 0) {
				const container = this._createUsageContainer();
				return this._reply(context, container);
			}
			name = args[0];
			description = args.slice(1).join(" ") || null;
		}

		return this._handleCreate(context.user || context.author, name, description, context);
	}

	async slashExecute(ctx: any) {
		return this.execute(ctx);
	}

	async _handleCreate(user: any, name: any, description: any, context: any) {
		const loadingMessage = await this._reply(
			context,
			this._createLoadingContainer(name),
		);

		try {
			const playlist = db.playlists.createPlaylist(user.id, name, description);

			return this._editReply(
				loadingMessage,
				this._createSuccessContainer(playlist),
			);
		} catch (error: any) {
			logger.error("CreatePlaylistCommand", "Error creating playlist", error);

			let errorMessage =
				i18n.cmd("An error occurred while creating your playlist. Please try again.");
			if (error.message === "Invalid playlist name") {
				errorMessage =
					i18n.cmd("Please provide a valid playlist name (1-100 characters).");
			} else if (error.message === "Description too long") {
				errorMessage = i18n.cmd("Playlist description is too long (max 500 characters).");
			} else if (error.message === "Maximum playlist limit reached") {
				errorMessage = i18n.cmd("You've reached the maximum limit of 20 playlists.");
			} else if (error.message === "Playlist with this name already exists") {
				errorMessage =
					i18n.cmd("You already have a playlist with this name. Choose a different name.");
			}

			return this._editReply(
				loadingMessage,
				this._createErrorContainer(errorMessage),
			);
		}
	}

	_createUsageContainer() {
		const content =
			i18n.cmd("**Missing Playlist Name**") + "\n\n" +
			i18n.cmd("**{emoji} Status:** Name Required", { emoji: emoji.get("cross") }) + "\n\n" +
			i18n.cmd("Please provide a name for your new playlist.") + "\n\n" +
			i18n.cmd("**{emoji} Usage:**", { emoji: emoji.get("info") }) + "\n" +
			i18n.cmd("└─ `create-playlist <name> [description]`") + "\n" +
			i18n.cmd("└─ `create-pl <name> [description]`") + "\n" +
			i18n.cmd("└─ `new-playlist <name> [description]`") + "\n" +
			i18n.cmd("└─ `make-playlist <name> [description]`") + "\n\n" +
			i18n.cmd("**{emoji} Examples:**", { emoji: emoji.get("folder") }) + "\n" +
			i18n.cmd("└─ `create-playlist My Favorites`") + "\n" +
			i18n.cmd("└─ `create-pl Chill Vibes A relaxing collection`") + "\n" +
			i18n.cmd("└─ `new-playlist Rock Classics Best rock songs`") + "\n\n" +
			i18n.cmd("**{emoji} Limits:**", { emoji: emoji.get("info") }) + "\n" +
			i18n.cmd("└─ Maximum 20 playlists per user") + "\n" +
			i18n.cmd("└─ Name: 1-100 characters") + "\n" +
			i18n.cmd("└─ Description: 0-500 characters") + "\n" +
			i18n.cmd("└─ Up to 50 tracks per playlist");

		return buildContainer({
			title: "Create Playlist",
			content: content,
			thumbnail: config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork,
			icon: emoji.get("info") || "ℹ️"
		});
	}

	_createLoadingContainer(name: any) {
		const content =
			i18n.cmd("**Setting up your new playlist**") + "\n\n" +
			i18n.cmd("**{emoji} Status:** Creating", { emoji: emoji.get("loading") }) + "\n" +
			i18n.cmd("**{emoji} Name:** {name}", { emoji: emoji.get("folder"), name }) + "\n\n" +
			i18n.cmd("Please wait while we create your custom playlist.") + "\n\n" +
			i18n.cmd("*This should only take a moment...*");

		return buildContainer({
			title: "Creating Playlist",
			content: content,
			thumbnail: config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork,
			icon: emoji.get("loading") || "ℹ️"
		});
	}

	_createSuccessContainer(playlist: any) {
		const createdDate = new Date(playlist.created_at).toLocaleDateString();
		const playlistId = playlist.id.replace("pl_", "").substring(0, 8);
		let descriptionText = "";
		if (playlist.description) {
			descriptionText = `**${emoji.get("info")} Description:** ${playlist.description}\n`;
		}
		const note = phrases.get("playlistCreated");
		const content =
			`**${note}**\n\n` +
			i18n.cmd("**{emoji} Name:** {name}\n", { emoji: emoji.get("folder"), name: playlist.name }) +
			`${descriptionText}` +
			i18n.cmd("**{emoji} ID:** {id}\n", { emoji: emoji.get("info"), id: playlistId }) +
			i18n.cmd("**{emoji} Created:** {date}\n", { emoji: emoji.get("check"), date: createdDate }) +
			i18n.cmd("**{emoji} Tracks:** 0 songs\n\n", { emoji: emoji.get("music") }) +
			i18n.cmd("**{emoji} Next Steps:**\n", { emoji: emoji.get("info") }) +
			i18n.cmd("└─ Use `add2pl` to add songs\n") +
			i18n.cmd("└─ Use `playlist-info` to view details\n") +
			i18n.cmd("└─ Use `my-playlists` to see all playlists\n") +
			i18n.cmd("└─ Use `load-pl` to start playing");

		return buildSuccess(content, "Playlist Created Successfully");
	}

	_createErrorContainer(message: string) {
		return buildError(message, "Creation Failed");
	}

	async _reply(context: any, container: any) {
		const payload = {
			components: [container],
			flags: MessageFlags.IsComponentsV2,
			fetchReply: true,
		};
		if (context.replied || context.deferred) {
			return context.editReply(payload);
		} else if (typeof context.reply === "function") {
			return (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload);
		} else if (context.channel) {
			return context.channel.send(payload);
		}
	}

	async _editReply(message: any, container: any) {
		if (!message) return null;
		return message.edit({
			components: [container],
			flags: MessageFlags.IsComponentsV2,
		});
	}
}

export default new CreatePlaylistCommand();

// Made by Nikhil Under CodeX Devs
