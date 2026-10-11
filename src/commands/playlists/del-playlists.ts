import { Command } from "#core/Command";
import { MessageFlags } from "discord.js";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import { db } from "#database/Database";
import { config } from "#config/config";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";

class DeletePlaylistCommand extends Command {
	constructor() {
		super({
			name: "delete-playlist",
			description: "Delete one of your custom playlists",
			usage: "delete-playlist <playlist_name_or_id>",
			aliases: ["delete-pl", "remove-playlist", "del-playlist"],
			category: "music",
			examples: [
				"delete-playlist My Favorites",
				"delete-pl pl_abc123",
				"remove-playlist Chill Vibes",
			],
			cooldown: 3,
			slash: {
				enabled: true,
				autoDefer: true,
				data: {
					name: "delete-playlist",
					description: "Delete one of your custom playlists",
					options: [
						{
							name: "playlist",
							description: i18n.cmd("Playlist name or ID to delete"),
							type: 3,
							required: true,
						},
					],
				},
			},
		});
	}

	async execute(ctx: any) {
		const { message, interaction, args = [] } = ctx;
		const context = interaction || message;
		let playlistQuery;

		if (interaction) {
			playlistQuery = interaction.options.getString("playlist");
		} else {
			if (args.length === 0) {
				const container = this._createUsageContainer();
				return this._reply(context, container);
			}
			playlistQuery = args.join(" ");
		}

		return this._handleDelete(context.user || context.author, playlistQuery, context);
	}

	async slashExecute(ctx: any) {
		return this.execute(ctx);
	}

	async _handleDelete(user: any, playlistQuery: any, context: any) {
		const loadingMessage = await this._reply(
			context,
			this._createLoadingContainer(playlistQuery),
		);

		try {
			const userPlaylists = db.playlists.getUserPlaylists(user.id);

			if (userPlaylists.length === 0) {
				return this._editReply(
					loadingMessage,
					this._createNoPlaylistsContainer(),
				);
			}

			let targetPlaylist = null;

			if (playlistQuery.startsWith("pl_")) {
				targetPlaylist = userPlaylists.find((pl) => pl.id === playlistQuery);
			} else {
				targetPlaylist = userPlaylists.find(
					(pl) => pl.name.toLowerCase() === playlistQuery.toLowerCase(),
				);
			}

			if (!targetPlaylist) {
				return this._editReply(
					loadingMessage,
					this._createNotFoundContainer(playlistQuery, userPlaylists),
				);
			}

			const success = db.playlists.deletePlaylist(targetPlaylist.id, user.id);

			if (success) {
				return this._editReply(
					loadingMessage,
					this._createSuccessContainer(targetPlaylist),
				);
			} else {
				throw new Error("Failed to delete playlist");
			}
		} catch (error: any) {
			logger.error("DeletePlaylistCommand", "Error deleting playlist", error);

			let errorMessage =
				i18n.cmd("An error occurred while deleting the playlist. Please try again.");
			if (error.message === "Playlist not found") {
				errorMessage = i18n.cmd("The specified playlist could not be found.");
			} else if (error.message === "Access denied") {
				errorMessage = i18n.cmd("You don't have permission to delete this playlist.");
			}

			return this._editReply(
				loadingMessage,
				this._createErrorContainer(errorMessage),
			);
		}
	}

	_createUsageContainer() {
		const content =
			i18n.cmd("**Missing Playlist Identifier**") + "\n\n" +
			i18n.cmd("**{emoji} Status:** Identifier Required", { emoji: emoji.get("cross") }) + "\n\n" +
			i18n.cmd("Please specify which playlist to delete.") + "\n\n" +
			i18n.cmd("**{emoji} Usage:**", { emoji: emoji.get("info") }) + "\n" +
			i18n.cmd("└─ `delete-playlist <playlist_name>`") + "\n" +
			i18n.cmd("└─ `delete-pl <playlist_id>`") + "\n" +
			i18n.cmd("└─ `remove-playlist <playlist_name>`") + "\n" +
			i18n.cmd("└─ `del-playlist <playlist_name>`") + "\n\n" +
			i18n.cmd("**{emoji} Examples:**", { emoji: emoji.get("folder") }) + "\n" +
			i18n.cmd("└─ `delete-playlist My Favorites`") + "\n" +
			i18n.cmd("└─ `delete-pl pl_abc12345`") + "\n" +
			`└─ \`remove-playlist Chill Vibes\`\n\n` +
			`**${emoji.get("info")} Tips:**\n` +
			`└─ Use \`my-playlists\` to see all your playlists\n` +
			`└─ You can use playlist name or ID\n` +
			`└─ Deletion is permanent and cannot be undone\n` +
			`└─ Only you can delete your own playlists`;

		return buildContainer({
			title: "Delete Playlist",
			content: content,
			thumbnail: config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork,
			icon: emoji.get("info") || "ℹ️"
		});
	}

	_createLoadingContainer(playlistQuery: any) {
		const content =
			i18n.cmd("**Locating and removing playlist**") + "\n\n" +
			i18n.cmd("**{emoji} Status:** Processing", { emoji: emoji.get("loading") }) + "\n" +
			i18n.cmd("**{emoji} Target:** {target}", { emoji: emoji.get("folder"), target: playlistQuery }) + "\n\n" +
			i18n.cmd("Please wait while we locate and delete your playlist.") + "\n\n" +
			i18n.cmd("*Verifying permissions and removing data...*");

		return buildContainer({
			title: "Deleting Playlist",
			content: content,
			thumbnail: config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork,
			icon: emoji.get("loading") || "ℹ️"
		});
	}

	_createNoPlaylistsContainer() {
		return buildError(
			i18n.cmd("You don't have any custom playlists yet.\n\nUse `/create-playlist <name>` to get started!"),
			i18n.translateTitle("No Playlists Found")
		);
	}

	_createNotFoundContainer(playlistQuery: string, userPlaylists: any[]) {
		const list = userPlaylists
			.slice(0, 5)
			.map((pl) => `└─ \`${pl.name}\``)
			.join("\n");
		return buildError(
			i18n.cmd("Could not find a playlist matching `{query}`.", { query: playlistQuery }) + "\n\n" +
			i18n.cmd("**Your playlists:**\n{list}", { list: list || i18n.cmd("*(none)*") }) + "\n\n" +
			i18n.cmd("Use `my-playlists` to see all of your playlists."),
			i18n.translateTitle("Playlist Not Found")
		);
	}

	_createSuccessContainer(playlist: any) {
		const playlistId = playlist.id.replace("pl_", "").substring(0, 8);
		const deletedDate = new Date().toLocaleDateString();
		const note = phrases.get("playlistDeleted");
		const content =
			`**${note}**\n\n` +
			i18n.cmd("**{emoji} Name:** {name}\n", { emoji: emoji.get("cross"), name: playlist.name }) +
			i18n.cmd("**{emoji} ID:** {id}\n", { emoji: emoji.get("info"), id: playlistId }) +
			i18n.cmd("**{emoji} Tracks Lost:** {count} songs\n", { emoji: emoji.get("music"), count: playlist.track_count || 0 }) +
			i18n.cmd("**{emoji} Deleted:** {date}\n\n", { emoji: emoji.get("check"), date: deletedDate }) +
			i18n.cmd("**{emoji} Next Steps:**\n", { emoji: emoji.get("folder") }) +
			i18n.cmd("└─ Use `create-playlist` to make new ones\n") +
			i18n.cmd("└─ Use `my-playlists` to see remaining playlists");

		return buildSuccess(content, "Playlist Deleted Successfully");
	}

	_createErrorContainer(message: string) {
		return buildError(message, "Deletion Failed");
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

export default new DeletePlaylistCommand();

// Made by Nikhil Under CodeX Devs
