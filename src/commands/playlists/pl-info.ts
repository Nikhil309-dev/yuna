import type { Message, Interaction, CommandInteraction } from 'discord.js';
import type { YunaClient } from '#core/YunaClient';
import { Command } from "#core/Command";
import { ButtonStyle, MessageFlags, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder } from "discord.js";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import { componentCollectorSource } from "#ui/Components";
import { PlayerManager } from "#audio/PlayerManager";
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
			accent: 0x5865F2,
			footer: "phrases.playlistLoaded",
			icon: emoji.get("folder") || "ℹ️"
		});
	}

	_createMainInfoContainer(playlist: any) {
		const LIMIT = 50;
		const shortId = playlist.id.replace("pl_", "").substring(0, 8);
		const tracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];
		const count = playlist.track_count || tracks.length || 0;
		const avg = count > 0 ? this._formatDuration(Math.round(playlist.total_duration / count)) : "0:00";

		const tree = (lines: string[]) => lines.map((l, i) => `${i === lines.length - 1 ? "└─" : "├─"} ${l}`).join("\n");
		const filled = count > 0 ? Math.min(10, Math.round((count / LIMIT) * 10)) : 0;
		const bar = "█".repeat(filled) + "░".repeat(Math.max(0, 10 - filled));

		const overview = [
			`${emoji.get("folder")} **Name:** ${playlist.name}`,
			...(playlist.description ? [`${emoji.get("info")} **Description:** ${playlist.description}`] : []),
			`${emoji.get("info")} **ID:** \`${shortId}\``,
			`${emoji.get("music")} **Tracks:** ${count} / ${LIMIT}`,
			`${emoji.get("reset")} **Duration:** ${this._formatDuration(playlist.total_duration)} (~${avg}/track)`,
		];

		const library = [
			`📊 **Capacity:** ${bar} ${Math.round((count / LIMIT) * 100)}%`,
		];

		const timeline = [
			`${emoji.get("check")} **Created:** ${new Date(playlist.created_at).toLocaleString()}`,
			`${emoji.get("add")} **Updated:** ${new Date(playlist.updated_at).toLocaleString()}`,
		];

		const content =
			`**Overview**\n` + tree(overview) +
			`\n\n**Library**\n` + tree(library) +
			`\n\n**Timeline**\n` + tree(timeline);

		const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId("plinfo_play")
				.setLabel(i18n.cmd("Play Now"))
				.setStyle(ButtonStyle.Success)
				.setEmoji(emoji.get("play") || "▶️")
				.setDisabled(count === 0),
			new ButtonBuilder()
				.setCustomId("plinfo_queue")
				.setLabel(i18n.cmd("Queue"))
				.setStyle(ButtonStyle.Primary)
				.setEmoji("➕")
				.setDisabled(count === 0),
			new ButtonBuilder()
				.setCustomId("plinfo_shuffle")
				.setLabel(i18n.cmd("Shuffle"))
				.setStyle(ButtonStyle.Primary)
				.setEmoji("🔀")
				.setDisabled(count === 0),
			new ButtonBuilder()
				.setCustomId("plinfo_view_tracks")
				.setLabel(i18n.cmd("Tracks ({count})", { count }))
				.setStyle(ButtonStyle.Secondary)
				.setEmoji(emoji.get("music") || "🎵")
				.setDisabled(count === 0),
			new ButtonBuilder()
				.setCustomId("plinfo_delreq")
				.setLabel(i18n.cmd("Delete"))
				.setStyle(ButtonStyle.Danger)
				.setEmoji(emoji.get("trash") || "🗑️"),
		);

		return buildContainer({
			title: i18n.cmd("Playlist Details: {name}", { name: playlist.name }),
			content: content,
			thumbnail: null,
			components: [buttons],
			separatorBeforeButtons: true,
			accent: 0x5865F2,
			footer: "phrases.playlistUpdated",
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
			accent: 0x5865F2,
			footer: "phrases.playlistLoaded",
			icon: emoji.get("music") || "ℹ️"
		});
	}

	_ephemeral(interaction: any, container: any) {
		return interaction.followUp({
			components: [container],
			flags: MessageFlags.IsComponentsV2,
			ephemeral: true,
		});
	}

	/**
	 * "Play Now" from the details card: queues the playlist into the caller's
	 * voice channel. Mirrors the load-playlist pipeline so behaviour (permission
	 * checks, connect, queue then play) stays identical.
	 */
	async _playPlaylist(interaction: any, playlist: any, userId: string, mode: string = "play") {
		if (!playlist) return;
		const client = interaction.client as any;
		const voiceChannel = interaction.member?.voice?.channel;
		if (!voiceChannel) {
			return this._ephemeral(interaction, buildError({ issue: i18n.cmd("Join a voice channel first, then press **Play Now**.") }, i18n.translateTitle("No Voice Channel")));
		}
		const perms = voiceChannel.permissionsFor(client.user);
		if (!perms?.has(["Connect", "Speak"])) {
			return this._ephemeral(interaction, buildError({ issue: i18n.cmd("I need permission to join and speak in that voice channel.") }, i18n.translateTitle("Missing Permissions")));
		}
		const tracks = Array.isArray(playlist.tracks) ? [...playlist.tracks] : [];
		if (tracks.length === 0) {
			return this._ephemeral(interaction, buildError({ issue: i18n.cmd("This playlist has no tracks to play.") }));
		}
		if (mode === "shuffle") {
			for (let i = tracks.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[tracks[i], tracks[j]] = [tracks[j], tracks[i]];
			}
		}

		const guildId = interaction.guild.id;
		try {
			let player = client.music?.getPlayer(guildId);
			if (!player) {
				player = await client.music.createPlayer({
					guildId,
					textChannelId: interaction.channel.id,
					voiceChannelId: voiceChannel.id,
				});
			}
			const pm = new PlayerManager(player);
			if (!pm.isConnected) await pm.connect();
			const wasEmpty = !player.playing && player.queue.tracks.length === 0;

			let added = 0;
			let failed = 0;
			for (const t of tracks) {
				const query = t.uri || t.identifier || (t.author ? `${t.title} ${t.author}` : t.title);
				try {
					const res = await client.music.search(query, { requester: { id: userId } });
					if (res?.tracks?.length) {
						await pm.addTracks(res.tracks[0]);
						added++;
					} else {
						failed++;
					}
				} catch (e) {
					failed++;
				}
			}

			if (mode !== "queue" && wasEmpty && added > 0) await pm.play();

			const verb = mode === "shuffle" ? i18n.cmd("shuffled") : i18n.cmd("queued");
			const container = buildSuccess(
				{
					message: i18n.cmd("**{added}** of **{total}** tracks from **{name}** {verb}.", { added, total: tracks.length, name: playlist.name, verb }),
					detail: failed > 0
						? i18n.cmd("{failed} track(s) could not be resolved.", { failed })
						: (mode !== "queue" && wasEmpty ? i18n.cmd("Playback started.") : i18n.cmd("Added to the queue.")),
				},
				i18n.translateTitle("Playlist Queued"),
			);
			return this._ephemeral(interaction, container);
		} catch (error: any) {
			logger.error("PlaylistInfo", i18n.cmd("Failed to play playlist"), error);
			return this._ephemeral(interaction, buildError({ issue: i18n.cmd("Something went wrong while starting playback.") }, i18n.translateTitle("Playback Error")));
		}
	}

	/** Two-step delete: the red button first asks the user to confirm. */
	async _confirmDelete(interaction: any, playlist: any) {
		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId("plinfo_delete")
				.setLabel(i18n.cmd("Confirm delete"))
				.setStyle(ButtonStyle.Danger)
				.setEmoji(emoji.get("trash") || "🗑️"),
			new ButtonBuilder()
				.setCustomId("plinfo_abort")
				.setLabel(i18n.cmd("Keep"))
				.setStyle(ButtonStyle.Secondary),
		);
		await interaction.editReply({
			components: [buildContainer({
				title: i18n.translateTitle("Delete Playlist?"),
				content: i18n.cmd("This permanently removes **{name}** and its {count} track(s). This cannot be undone.", { name: playlist.name, count: playlist.track_count }),
				components: [row],
				separatorBeforeButtons: true,
				accent: 0xED4245,
				icon: emoji.get("warning") || "⚠️"
			})],
		});
	}

	/**
	 * "Delete" from the details card: removes the playlist and swaps the card for
	 * a confirmation, so the message no longer offers actions on a dead playlist.
	 */
	async _deletePlaylist(interaction: any, playlist: any, userId: string) {
		if (!playlist) return;
		let ok = false;
		try {
			ok = db.playlists.deletePlaylist(playlist.id, userId);
		} catch (_) {
			ok = false;
		}
		if (!ok) {
			return this._ephemeral(interaction, buildError({ issue: i18n.cmd("Could not delete that playlist. Try again.") }, i18n.translateTitle("Delete Failed")));
		}
		await interaction.editReply({
			components: [buildSuccess({ message: i18n.cmd("Deleted **{name}**.", { name: playlist.name }) }, i18n.translateTitle("Playlist Deleted"))],
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
				case "play": {
					await this._playPlaylist(interaction, currentPlaylist, userId, "play");
					break;
				}
				case "queue": {
					await this._playPlaylist(interaction, currentPlaylist, userId, "queue");
					break;
				}
				case "shuffle": {
					await this._playPlaylist(interaction, currentPlaylist, userId, "shuffle");
					break;
				}
				case "delreq": {
					await this._confirmDelete(interaction, currentPlaylist);
					break;
				}
				case "delete": {
					await this._deletePlaylist(interaction, currentPlaylist, userId);
					break;
				}
				case "abort": {
					await interaction.editReply({ components: [this._createMainInfoContainer(currentPlaylist)] });
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
