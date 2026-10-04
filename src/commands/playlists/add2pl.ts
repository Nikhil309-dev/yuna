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

class Add2PlaylistCommand extends Command {
	constructor() {
		super({
			name: "add2pl",
			description: "Add current track or entire queue to a playlist",
			usage: "add2pl [playlist_name/id]",
			aliases: ["add-to-playlist", "a2pl"],
			category: "music",
			examples: ["add2pl", "add2pl My Favorites", "add2pl pl_abc123"],
			cooldown: 3,
			access: {
				voice: true,
				sameVoice: true,
				player: true,
				playing: true,
			},
			slash: {
				enabled: true,
				autoDefer: true,
				data: {
					name: "add2pl",
					description: "Add current track or entire queue to a playlist",
					options: [
						{
							name: "playlist",
							description: i18n.cmd("Playlist name or ID"),
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
		const playlistIdentifier = interaction ? (interaction.options.getString("playlist") || null) : (args.join(" ") || null);
		return this._handleAdd2Playlist(client, context, playlistIdentifier);
	}

	async slashExecute(ctx: any) {
		return this.execute(ctx);
	}

	async _handleAdd2Playlist(client: any, context: any, playlistIdentifier: any) {
		const userId = context.user?.id || context.author?.id;
		const guildId = context.guild.id;
		const player = client.music?.getPlayer(guildId);

		if (!player || !player.queue.current) {
			return this._reply(
				context,
				this._createErrorContainer(i18n.cmd("No music is currently playing.")),
			);
		}

		if (playlistIdentifier) {
			return this._handleDirectAdd(context, userId, player, playlistIdentifier);
		} else {
			return this._showPlaylistSelection(context, userId, player);
		}
	}

	async _handleDirectAdd(context: any, userId: any, player: any, playlistIdentifier: any) {
		const playlist = this._findPlaylist(userId, playlistIdentifier);
		if (!playlist) {
			return this._reply(
				context,
				this._createErrorContainer(
					i18n.cmd("Playlist not found. Check the name or ID and try again."),
				),
			);
		}

		const message = await this._reply(
			context,
			this._createPlaylistFoundContainer(playlist, player),
		);

		if (message) {
			this._setupDirectCollector(message, context, userId, player, playlist);
		}
	}

	async _showPlaylistSelection(context: any, userId: any, player: any) {
		const playlists = db.playlists.getUserPlaylists(userId);
		if (playlists.length === 0) {
			return this._reply(context, this._createNoPlaylistsContainer());
		}

		const message = await this._reply(
			context,
			this._createSelectionContainer(playlists, player),
		);

		if (message) {
			this._setupSelectionCollector(
				message,
				context,
				userId,
				player,
				playlists,
			);
		}
	}

	_findPlaylist(userId: any, identifier: any) {
		const playlists = db.playlists.getUserPlaylists(userId);

		return playlists.find(
			(pl) =>
				pl.id === identifier ||
				pl.name.toLowerCase() === identifier.toLowerCase() ||
				pl.id.replace("pl_", "").substring(0, 8) === identifier.toLowerCase(),
		);
	}

	_createNoPlaylistsContainer() {
		const content =
			i18n.translateTitle("No Playlists Found") + "\n\n" +
			i18n.cmd("**{emoji} Status:** No playlists available", { emoji: emoji.get("cross") }) + "\n\n" +
			i18n.cmd("You don't have any playlists to add tracks to.") + "\n\n" +
			i18n.cmd("**{emoji} Create your first playlist:**", { emoji: emoji.get("add") }) + "\n" +
			i18n.cmd("└─ Use `create-playlist <name>`") + "\n\n" +
			i18n.cmd("*Create a playlist and come back to add tracks*");

		return buildContainer({
			title: "Add to Playlist",
			content: content,
			thumbnail: config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork,
			icon: emoji.get("info") || "ℹ️"
		});
	}

	_createSelectionContainer(playlists: any, player: any) {
		const current = player.queue.current;
		const queueCount = player.queue.tracks.length;
		const content =
			i18n.cmd("**Select a Playlist**") + "\n\n" +
			i18n.cmd("**{emoji} Current Track:** {title}", { emoji: emoji.get("music"), title: current.info.title }) + "\n" +
			i18n.cmd("**{emoji} Queue:** {count} tracks", { emoji: emoji.get("folder"), count: queueCount }) + "\n" +
			i18n.cmd("**{emoji} Your Playlists:** {count}", { emoji: emoji.get("info"), count: playlists.length }) + "\n\n" +
			i18n.cmd("Choose a playlist below, then select what to add:") + "\n" +
			i18n.cmd("└─ Current track only") + "\n" +
			i18n.cmd("└─ Entire queue") + "\n\n" +
			i18n.cmd("*Select a playlist from the dropdown menu*");

		const selectMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder()
				.setCustomId("playlist_select")
				.setPlaceholder(i18n.cmd("Choose a playlist..."))
				.addOptions(
					playlists.slice(0, 25).map((pl: any) => ({
						label: pl.name,
						description: `${pl.track_count}/50 tracks`,
						value: pl.id,
						emoji: "🎵",
					})),
				),
		);

		return buildContainer({
			title: "Add to Playlist",
			content: content,
			thumbnail: current.info.artworkUrl || config.assets?.defaultTrackArtwork,
			components: [selectMenu],
			icon: emoji.get("add") || "ℹ️"
		});
	}

	_createPlaylistFoundContainer(playlist: any, player: any) {
		const current = player.queue.current;
		const queueCount = player.queue.tracks.length;
		const availableSlots = 50 - playlist.track_count;
		const content =
			`**Ready to Add Tracks**\n\n` +
			i18n.cmd("**{emoji} Current Track:** {title}", { emoji: emoji.get("music"), title: current.info.title }) + "\n" +
			i18n.cmd("**{emoji} Queue:** {count} tracks", { emoji: emoji.get("folder"), count: queueCount }) + "\n" +
			i18n.cmd("**{emoji} Playlist:** {count}/50 tracks", { emoji: emoji.get("info"), count: playlist.track_count }) + "\n" +
			i18n.cmd("**{emoji} Available Slots:** {count}", { emoji: emoji.get("add"), count: availableSlots }) + "\n\n" +
			i18n.cmd("Choose what to add to this playlist:") + "\n\n" +
			i18n.cmd("*Use the buttons below to make your selection*");

		const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder()
				.setCustomId("add_current")
				.setLabel(i18n.cmd("Add Current Track"))
				.setStyle(ButtonStyle.Primary)
				.setEmoji(emoji.get("add") || "➕"),
			new ButtonBuilder()
				.setCustomId("add_queue")
				.setLabel(i18n.cmd("Add Queue ({count})", { count: queueCount + 1 }))
				.setStyle(ButtonStyle.Secondary)
				.setEmoji(emoji.get("folder") || "📁"),
		);

		return buildContainer({
			title: playlist.name,
			content: content,
			thumbnail: current.info.artworkUrl || config.assets?.defaultTrackArtwork,
			components: [buttons],
			icon: emoji.get("folder") || "ℹ️"
		});
	}

	_createAddContainer(playlists: any, player: any, selectedPlaylist: any) {
		const current = player.queue.current;
		const queueCount = player.queue.tracks.length;
		const availableSlots = 50 - selectedPlaylist.track_count;
		const content =
			i18n.cmd("**Choose What to Add**") + "\n\n" +
			i18n.cmd("**{emoji} Current Track:** {title}", { emoji: emoji.get("music"), title: current.info.title }) + "\n" +
			i18n.cmd("**{emoji} Queue:** {count} tracks", { emoji: emoji.get("folder"), count: queueCount }) + "\n" +
			i18n.cmd("**{emoji} Playlist:** {count}/50 tracks", { emoji: emoji.get("info"), count: selectedPlaylist.track_count }) + "\n" +
			i18n.cmd("**{emoji} Available Slots:** {count}", { emoji: emoji.get("add"), count: availableSlots }) + "\n\n" +
			i18n.cmd("Select what you want to add to this playlist:") + "\n\n" +
			i18n.cmd("*Use the buttons below to make your selection*");

		const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder()
				.setCustomId("add_current")
				.setLabel(i18n.cmd("Add Current Track"))
				.setStyle(ButtonStyle.Primary)
				.setEmoji(emoji.get("add") || "➕"),
			new ButtonBuilder()
				.setCustomId("add_queue")
				.setLabel(i18n.cmd("Add Queue ({count})", { count: queueCount + 1 }))
				.setStyle(ButtonStyle.Secondary)
				.setEmoji(emoji.get("folder") || "📁"),
		);

		return buildContainer({
			title: selectedPlaylist.name,
			content: content,
			thumbnail: current.info.artworkUrl || config.assets?.defaultTrackArtwork,
			components: [buttons],
			icon: emoji.get("folder") || "ℹ️"
		});
	}

	_createSuccessContainer(playlist: any, addedCount: any, skippedCount: any, action: any) {
		const actionText = action === "current" ? i18n.cmd("Current Track") : i18n.cmd("Entire Queue");
		const note = phrases.get("playlistUpdated");
		const statusText = skippedCount > 0 ? i18n.cmd("*Some tracks were skipped due to limits*") : `*${note}*`;
		const content =
			i18n.cmd("**Tracks Added to Playlist**") + "\n\n" +
			i18n.cmd("**{emoji} Playlist:** {name}", { emoji: emoji.get("folder"), name: playlist.name }) + "\n" +
			i18n.cmd("**{emoji} Action:** Added {action}", { emoji: emoji.get("add"), action: actionText }) + "\n" +
			i18n.cmd("**{emoji} Added:** {count} track(s)", { emoji: emoji.get("check"), count: addedCount }) + "\n" +
			i18n.cmd("**{emoji} Total:** {count}/50 tracks", { emoji: emoji.get("info"), count: playlist.track_count }) + "\n" +
			`${skippedCount > 0 ? i18n.cmd("**{emoji} Skipped:** {count} track(s)", { emoji: emoji.get("cross"), count: skippedCount }) + "\n" : ""}` +
			`\n${statusText}\n\n` +
			i18n.cmd("**{emoji} Next Steps:**", { emoji: emoji.get("info") }) + "\n" +
			i18n.cmd("└─ Use `my-playlists` to view all playlists") + "\n" +
			i18n.cmd("└─ Use `playlist-info {name}` for details", { name: playlist.name }) + "\n" +
			i18n.cmd("└─ Use `load-pl {name}` to play", { name: playlist.name });

		return buildSuccess(content, "Successfully Added");
	}

	_createErrorContainer(message: string) {
		return buildError(message, "Error");
	}

	_setupSelectionCollector(message: any, context: any, userId: any, player: any, playlists: any) {
		const filter = (i: any) => i.user.id === userId;
		const collector = componentCollectorSource(message).createMessageComponentCollector({
			filter,
			time: 300000,
		});

		let selectedPlaylist: any = null;

		collector.on("collect", async (interaction: any) => {
			await interaction.deferUpdate();

			try {
				if (interaction.customId === "playlist_select") {
					const playlistId = interaction.values[0];
					selectedPlaylist = playlists.find((pl: any) => pl.id === playlistId);

					if (selectedPlaylist) {
						await interaction.editReply({
							components: [this._createPlaylistFoundContainer(selectedPlaylist, player)],
							flags: MessageFlags.IsComponentsV2,
						});
					}
				} else if (
					interaction.customId === "add_current" ||
					interaction.customId === "add_queue"
				) {
					if (selectedPlaylist) {
						const action = interaction.customId;
						const result: any = await this._processAdd(interaction, userId, player, selectedPlaylist, action);

						if (result?.success) {
							const { addedCount, skippedCount } = result;
							await interaction.editReply({
								components: [
									this._createSuccessContainer(
										selectedPlaylist,
										addedCount,
										skippedCount,
										action.replace("add_", ""),
									),
								],
								flags: MessageFlags.IsComponentsV2,
							});
						} else {
							await interaction.editReply({
								components: [this._createErrorContainer(result?.message || i18n.cmd("Failed to add tracks"))],
								flags: MessageFlags.IsComponentsV2,
							});
						}
					}
				}
			} catch (error: any) {
				logger.error("Add2PlaylistCommand", "Error processing collector", error);
				await interaction.editReply({
					components: [this._createErrorContainer(i18n.cmd("An error occurred while adding tracks."))],
					flags: MessageFlags.IsComponentsV2,
				});
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
						"Add2PlaylistCommand",
						i18n.cmd("Error updating expired message"),
						error,
					);
				}
			}
		});
	}

	_setupDirectCollector(message: any, context: any, userId: any, player: any, playlist: any) {
		const filter = (i: any) => i.user.id === userId;
		const collector = componentCollectorSource(message).createMessageComponentCollector({
			filter,
			time: 300000,
		});

		collector.on("collect", async (interaction: any) => {
			await interaction.deferUpdate();
			await this._processAdd(
				interaction,
				userId,
				player,
				playlist,
				interaction.customId,
			);
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
						"Add2PlaylistCommand",
						i18n.cmd("Error updating expired message"),
						error,
					);
				}
			}
		});
	}

	async _processAdd(interaction: any, userId: any, player: any, playlist: any, action: any) {
		try {
			const current = player.queue.current;
			const queue = player.queue.tracks;
			let tracksToAdd = [];
			let addedCount = 0;
			let skippedCount = 0;

			if (action === "add_current") {
				tracksToAdd = [current];
			} else if (action === "add_queue") {
				tracksToAdd = [current, ...queue];
			}

			for (const track of tracksToAdd) {
				const availableSlots = 50 - (playlist.track_count + addedCount);
				if (availableSlots <= 0) break;

				const trackInfo = {
					identifier: track.info.identifier,
					title: track.info.title,
					author: track.info.author,
					uri: track.info.uri,
					duration: track.info.duration,
					sourceName: track.info.sourceName,
					artworkUrl: track.info.artworkUrl,
				};

				try {
					playlist = db.playlists.addTrackToPlaylist(
						playlist.id,
						userId,
						trackInfo,
					);
					addedCount++;
				} catch (error: any) {
					if (
						error.message.includes("already exists") ||
						error.message.includes("limit reached")
					) {
						skippedCount++;
					} else {
						throw error;
					}
				}
			}

			return { success: true, addedCount, skippedCount };
		} catch (error: any) {
			logger.error("Add2PlaylistCommand", "Error processing add", error);
			return { success: false, message: i18n.cmd("An error occurred while adding tracks.") };
		}
	}

	_createExpiredContainer() {
		const content =
			i18n.cmd("**This interaction has expired**") + "\n\n" +
			i18n.cmd("**{emoji} Status:** Session timed out", { emoji: emoji.get("reset") }) + "\n\n" +
			i18n.cmd("Run the command again to add tracks to your playlists.") + "\n\n" +
			i18n.cmd("**{emoji} Available Commands:**", { emoji: emoji.get("info") }) + "\n" +
			i18n.cmd("└─ `add2pl` - Select from menu") + "\n" +
			i18n.cmd("└─ `add2pl <playlist_name>` - Direct add") + "\n" +
			i18n.cmd("└─ `my-playlists` - View all playlists") + "\n\n" +
			i18n.cmd("*Commands expire after 5 minutes of inactivity*");

		return buildContainer({
			title: "Interaction Expired",
			content: content,
			thumbnail: config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork,
			icon: emoji.get("info") || "ℹ️"
		});
	}

	async _reply(context: any, container: any) {
		const payload = {
			components: [container],
			flags: MessageFlags.IsComponentsV2,
		};

		try {
			if (context.replied || context.deferred) {
				return context.editReply({ ...payload, fetchReply: true });
			} else if (typeof context.reply === "function") {
				return (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))({ ...payload, fetchReply: true });
			} else {
				return context.channel.send(payload);
			}
		} catch (error: any) {
			logger.error("Add2PlaylistCommand", "Error in _reply", error);
			return null;
		}
	}
}

export default new Add2PlaylistCommand();

// Made by Nikhil Under CodeX Devs
