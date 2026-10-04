import type { Message, Interaction, CommandInteraction } from 'discord.js';
import type { YunaClient } from '#core/YunaClient';
import { Command } from "#core/Command";
import { ButtonStyle, MessageFlags, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder } from "discord.js";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import { componentCollectorSource } from "#ui/Components";
import { db } from "#database/Database";
import { config } from "#config/config";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";

const TRACKS_PER_PAGE = 10;

class PlaylistInfoCommand extends Command {
	constructor() {
		super({
			name: "playlist-info",
			description: "View detailed information and manage a custom playlist",
			usage: "playlist-info [playlist_id_or_name]",
			aliases: ["pl-info", "p-info"],
			category: "music",
			examples: [
				"playlist-info",
				"playlist-info My Favorites",
				"pl-info pl_abc123",
			],
			cooldown: 3,
			slash: {
				enabled: true,
				autoDefer: true,
				data: {
					name: "playlist-info",
					description: "View detailed info for a playlist",
					options: [
						{
							name: "playlist",
							description: i18n.cmd("The ID or name of the playlist to view"),
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
		const query = interaction ? (interaction.options.getString("playlist") || null) : (args.join(" ") || null);
		return this._handleInfo(client, context, context.user || context.author, query);
	}

	async slashExecute(ctx: any) {
		return this.execute(ctx);
	}

	async _handleInfo(client: any, context: any, user: any, query: any) {
		const userId = user.id;

		if (query) {
			const playlist = this._findPlaylist(userId, query);
			if (!playlist) {
				return this._reply(
					context,
					this._createNotFoundContainer(query, userId),
				);
			}
			const message = await this._reply(
				context,
				this._createMainInfoContainer(playlist),
			);
			if (message) this._setupCollector(message, userId, playlist);
		} else {
			const playlists = db.playlists.getUserPlaylists(userId);
			if (playlists.length === 0) {
				return this._reply(context, this._createNoPlaylistsContainer());
			}
			const message = await this._reply(
				context,
				this._createSelectionContainer(playlists),
			);
			if (message) this._setupCollector(message, userId, null, playlists);
		}
	}

	_findPlaylist(userId: any, query: any) {
		const userPlaylists = db.playlists.getUserPlaylists(userId);
		const trimmedQuery = query.trim();

		if (trimmedQuery.startsWith("pl_")) {
			return userPlaylists.find((p) => p.id === trimmedQuery);
		}
		if (trimmedQuery.length <= 16 && !trimmedQuery.includes(" ")) {
			const playlistById = userPlaylists.find((p) =>
				p.id.includes(trimmedQuery),
			);
			if (playlistById) return playlistById;
		}
		return userPlaylists.find(
			(p) => p.name.toLowerCase() === trimmedQuery.toLowerCase(),
		);
	}

	_createSelectionContainer(playlists: any) {
		const content =
			i18n.cmd("**Select a playlist**") + "\n\n" +
			i18n.cmd("You have **{count}** playlists. Choose one from the menu below to view its details and manage its tracks.", { count: playlists.length });

		const selectMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder()
				.setCustomId("plinfo_select")
				.setPlaceholder(i18n.cmd("Select a playlist..."))
				.addOptions(
					playlists.slice(0, 25).map((pl: any) => ({
						label: pl.name,
						description: i18n.cmd('{count} tracks', { count: pl.track_count }),
						value: pl.id,
						emoji: "📁",
					})),
				),
		);

		return buildContainer({
			title: i18n.translateTitle("Your Playlists"),
			content: content,
			thumbnail: null,
			components: [selectMenu],
			icon: emoji.get("folder") || "ℹ️"
		});
	}

	_createMainInfoContainer(playlist: any) {
		const shortId = playlist.id.replace("pl_", "").substring(0, 8);
		const descriptionText = playlist.description
			? `**${emoji.get("info")} Description:** ${playlist.description}\n`
			: "";
		const content =
			`**Overview of your playlist**\n\n` +
			`**${emoji.get("folder")} Name:** ${playlist.name}\n` +
			`${descriptionText}` +
			`**${emoji.get("info")} ID:** ${shortId}\n` +
			`**${emoji.get("music")} Tracks:** ${playlist.track_count} songs\n` +
			`**${emoji.get("reset")} Duration:** ${this._formatDuration(playlist.total_duration)}\n` +
			`**${emoji.get("check")} Created:** ${new Date(playlist.created_at).toLocaleString()}\n` +
			`**${emoji.get("add")} Updated:** ${new Date(playlist.updated_at).toLocaleString()}`;

		const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder()
				.setCustomId("plinfo_view_tracks")
				.setLabel(i18n.cmd('View Tracks ({count})', { count: playlist.track_count }))
				.setStyle(ButtonStyle.Primary)
				.setEmoji(emoji.get("music") || "🎵")
				.setDisabled(playlist.track_count === 0),
		);

		return buildContainer({
			title: i18n.cmd("Playlist Details: {name}", { name: playlist.name }),
			content: content,
			thumbnail: null,
			components: [buttons],
			icon: emoji.get("openfolder") || "ℹ️"
		});
	}

	_createTracksContainer(playlist: any, page: any) {
		const totalPages = Math.ceil(playlist.tracks.length / TRACKS_PER_PAGE) || 1;
		page = Math.max(1, Math.min(page, totalPages));

		const startIdx = (page - 1) * TRACKS_PER_PAGE;
		const pageTracks = playlist.tracks.slice(startIdx, startIdx + TRACKS_PER_PAGE);

		let trackListStr = i18n.cmd("Viewing tracks for playlist **{name}** (Page {page}/{total}).\n\n", {
			name: playlist.name,
			page,
			total: totalPages,
		});
		pageTracks.forEach((track: any, index: any) => {
			const globalIdx = startIdx + index + 1;
			trackListStr += `**${globalIdx}.** ${track.title} - *${track.author}* (${this._formatDuration(track.duration)})\n`;
		});

		const components = [];

		if (pageTracks.length > 0) {
			const selectMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder()
					.setCustomId("plinfo_remove_tracks")
					.setPlaceholder(i18n.cmd("Select tracks to remove..."))
					.setMinValues(1)
					.setMaxValues(pageTracks.length)
					.addOptions(
						pageTracks.map((track: any, index: any) => ({
							label: `${startIdx + index + 1}. ${track.title}`.substring(0, 100),
							description: track.author ? track.author.substring(0, 100) : i18n.cmd("Unknown"),
							value: track.identifier,
						})),
					),
			);
			components.push(selectMenu);
		}

		const navButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder()
				.setCustomId("plinfo_back_to_info")
				.setLabel(i18n.cmd("Back to Overview"))
				.setStyle(ButtonStyle.Secondary)
				.setEmoji(emoji.get("left") || "⬅️"),
			new ButtonBuilder()
				.setCustomId("plinfo_tracks_prev")
				.setLabel(i18n.cmd("Previous"))
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(page <= 1),
			new ButtonBuilder()
				.setCustomId("plinfo_tracks_next")
				.setLabel(i18n.cmd("Next"))
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(page >= totalPages),
		);
		components.push(navButtons);

		return buildContainer({
			title: i18n.cmd("Tracks in: {name}", { name: playlist.name }),
			content: trackListStr,
			thumbnail: null,
			components: components,
			icon: emoji.get("music") || "ℹ️"
		});
	}

	_setupCollector(message: any, userId: string, initialPlaylist: any, allPlaylists: any[] | null = null) {
		const filter = (i: any) => i.user.id === userId;
		const collector = componentCollectorSource(message).createMessageComponentCollector({
			filter,
			time: 300000,
		});

		let currentPlaylist = initialPlaylist;
		let currentPage = 1;

		collector.on("collect", async (interaction: any) => {
			await interaction.deferUpdate();
			const [action, ...params] = interaction.customId.split("_");

			if (action !== "plinfo") return;

			const subAction = params[0];

			switch (subAction) {
				case "select": {
					const playlistId = interaction.values[0];
					currentPlaylist = allPlaylists!.find((p) => p.id === playlistId);
					if (currentPlaylist) {
						await interaction.editReply({
							components: [this._createMainInfoContainer(currentPlaylist)],
						});
					}
					break;
				}
				case "view": {

					currentPage = 1;
					await interaction.editReply({
						components: [this._createTracksContainer(currentPlaylist, currentPage)],
					});
					break;
				}
				case "back": {
					await interaction.editReply({
						components: [this._createMainInfoContainer(currentPlaylist)],
					});
					break;
				}
				case "tracks": {

					const direction = params[1];
					currentPage =
						direction === "prev" ? currentPage - 1 : currentPage + 1;
					await interaction.editReply({
						components: [this._createTracksContainer(currentPlaylist, currentPage)],
					});
					break;
				}
				case "remove": {

					const identifiersToRemove = interaction.values;
					let removedCount = 0;
					for (const id of identifiersToRemove) {
						try {
							await db.playlists.removeTrackFromPlaylist(
								currentPlaylist.id,
								userId,
								id,
							);
							removedCount++;
						} catch (e) {
							logger.error(
								"PlaylistInfo",
								`Failed to remove track ${id} from ${currentPlaylist.id}`,
								e,
							);
						}
					}

					currentPlaylist = db.playlists.getPlaylist(currentPlaylist.id);

					const totalPages =
						Math.ceil(currentPlaylist.tracks.length / TRACKS_PER_PAGE) || 1;
					if (currentPage > totalPages) currentPage = totalPages;

					await interaction.editReply({
						components: [this._createTracksContainer(currentPlaylist, currentPage)],
					});
					await interaction.followUp({
						content: i18n.cmd("Successfully removed {count} track(s).", { count: removedCount }),
						ephemeral: true,
					});
					break;
				}
			}
		});

		collector.on("end", async () => {
			try {
				await message.edit({
					components: [this._createExpiredContainer()],
					flags: MessageFlags.IsComponentsV2,
				});
			} catch (error: any) {
				if (error.code !== 10008) {
					logger.error(
						"PlaylistInfo",
						i18n.cmd("Failed to edit message on collector end"),
						error,
					);
				}
			}
		});
	}

	_formatDuration(ms: number) {
		if (!ms || ms < 0) return "0:00";
		const totalSeconds = Math.floor(ms / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		if (hours > 0) {
			return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
		}
		return `${minutes}:${seconds.toString().padStart(2, "0")}`;
	}

	_createNotFoundContainer(query: any, userId?: any) {
		return buildError(
			i18n.cmd("Could not find a playlist matching `{query}`.\n\n", { query }) +
			i18n.cmd("**Tips:**") + "\n" +
			i18n.cmd("└─ Check the spelling of the playlist name.") + "\n" +
			i18n.cmd("└─ Try using the playlist's ID.") + "\n" +
			i18n.cmd("└─ Use `/my-playlists` to see a list of your playlists."),
			i18n.translateTitle("Playlist Not Found")
		);
	}

	_createNoPlaylistsContainer() {
		return buildError(
			i18n.cmd("You don't have any custom playlists yet.\n\nUse `/create-playlist <name>` to get started!"),
			i18n.translateTitle("No Playlists Found")
		);
	}

	_createExpiredContainer() {
		const content = i18n.cmd("This interactive menu has expired.\nPlease run the command again.");

		return buildContainer({
			title: "Interaction Expired",
			content: content,
			thumbnail: null,
			icon: emoji.get("info") || "ℹ️"
		});
	}

	async _reply(context: any, container: any) {
		const payload = {
			components: [container],
			flags: MessageFlags.IsComponentsV2,
			fetchReply: true,
		};
		try {
			if (context.replied || context.deferred) {
				return context.editReply(payload);
			}
			return (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload);
		} catch (error: any) {
			logger.error("PlaylistInfoCommand", "Error in _reply", error);
			return null;
		}
	}
}

export default new PlaylistInfoCommand();

// Made by Nikhil Under CodeX Devs
