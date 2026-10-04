import type { Message, Interaction, CommandInteraction } from 'discord.js';
import type { YunaClient } from '#core/YunaClient';
import { Command } from "#core/Command";
import { MessageFlags } from "discord.js";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import { PlayerManager } from "#audio/PlayerManager";
import { db } from "#database/Database";
import { config } from "#config/config";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";

const MAX_TRACKS_TO_ADD = 50;

class LoadPlaylistCommand extends Command {
	constructor() {
		super({
			name: "load-playlist",
			description: "Load a playlist, or specific tracks/ranges from it",
			usage: "load-playlist <playlist_name_or_id> [positions]",
			aliases: ["load-pl", "lpl"],
			category: "music",
			examples: [
				"lpl My Favorites",
				"lpl ChillVibes 5",
				"load-pl MyFavorites: 3, 7, 10",
				"lpl RockClassics 5-10",
			],
			cooldown: 5,
			access: {
				voice: true,
			},
			slash: {
				enabled: true,
				autoDefer: true,
				data: {
					name: "load-playlist",
					description: "Load a playlist or specific tracks/ranges from it",
					options: [
						{
							name: "playlist",
							description: i18n.cmd("Playlist ID or name to load"),
							type: 3,
							required: true,
						},
						{
							name: "positions",
							description: i18n.cmd("Optional: Specific tracks or ranges (e.g., 5, 8-10)"),
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
		let positionsStr = null;
		let query = null;

		if (interaction) {
			query = interaction.options.getString("playlist");
			positionsStr = interaction.options.getString("positions") || null;
		} else {
			if (args.length === 0) {
				const container = this._createUsageContainer();
				return this._reply(context, container);
			}

			const lastArg = args[args.length - 1];
			if (args.length > 1 && /^[0-9,-]+$/.test(lastArg)) {
				positionsStr = args.pop();
				query = args.join(" ");
			} else {
				query = args.join(" ");
			}
		}

		return this._handleLoad(
			client,
			context,
			query,
			context.user || context.author,
			positionsStr,
		);
	}

	async slashExecute(ctx: any) {
		return this.execute(ctx);
	}

	async _handleLoad(client: any, context: any, query: any, user: any, positionsStr: any) {
		const loadingMessage = await this._reply(
			context,
			this._createLoadingContainer(query),
		);

		try {
			const playlist = this._findPlaylist(user.id, query);
			if (!playlist)
				return this._editReply(
					loadingMessage,
					this._createNotFoundContainer(query),
				);
			if (!playlist.tracks || playlist.tracks.length === 0)
				return this._editReply(
					loadingMessage,
					this._createEmptyPlaylistContainer(playlist),
				);

			let tracksToProcess;
			let selectionInfo;

			if (positionsStr) {
				const indices = this._parseTrackIndices(
					positionsStr,
					playlist.tracks.length,
				);
				if (indices.length === 0) {
					return this._editReply(
						loadingMessage,
						this._createErrorContainer(
							i18n.cmd("**Invalid Track Selection**\n\nThe positions `{positions}` are invalid or out of range for this playlist (1-{total}).", {
							positions: positionsStr,
							total: playlist.tracks.length,
						}),
						),
					);
				}
				tracksToProcess = indices.map((index: number) => playlist.tracks[index]);
				selectionInfo = i18n.cmd('{count} selected track(s)', { count: indices.length });
			} else {
				tracksToProcess = playlist.tracks.slice(0, MAX_TRACKS_TO_ADD);
				selectionInfo = i18n.cmd('up to {count} tracks', { count: MAX_TRACKS_TO_ADD });
			}

			const voiceChannel = context.member?.voice?.channel;
			if (!voiceChannel)
				return this._editReply(
					loadingMessage,
					this._createErrorContainer(
						i18n.cmd("**Voice Channel Required**\n\nYou must be in a voice channel to play music."),
					),
				);
			const permissions = voiceChannel.permissionsFor(context.guild.members.me);
			if (!permissions.has(["Connect", "Speak"]))
				return this._editReply(
					loadingMessage,
					this._createErrorContainer(
						i18n.cmd("**Missing Permissions**\n\nI need permission to join and speak in your voice channel."),
					),
				);

			let player = client.music?.getPlayer(context.guild.id);
			const wasEmpty =
				!player || (player.queue.tracks.length === 0 && !player.playing);
			const currentQueueSize = wasEmpty ? 0 : player.queue.tracks.length;
			const queueCheck = this._checkQueueLimit(
				currentQueueSize,
				tracksToProcess.length,
				context.guild.id,
				user.id,
			);

			if (!queueCheck.allowed)
				return this._editReply(
					loadingMessage,
					this._createErrorContainer(
						i18n.cmd("**Queue Limit Reached**\n\n{message}", { message: queueCheck.message }),
					),
				);

			if (!player)
				player = await client.music.createPlayer({
					guildId: context.guild.id,
					textChannelId: context.channel.id,
					voiceChannelId: voiceChannel.id,
				});
			const pm = new PlayerManager(player);
			if (!pm.isConnected) await pm.connect();

			const finalTracks = tracksToProcess.slice(0, queueCheck.tracksToAdd);
			let addedCount = 0;
			let failedCount = 0;

			await this._editReply(
				loadingMessage,
				this._createProcessingContainer(
					playlist.name,
					0,
					finalTracks.length,
					selectionInfo,
				),
			);

			const BATCH_SIZE = 10;
			for (let i = 0; i < finalTracks.length; i += BATCH_SIZE) {
				const batch = finalTracks.slice(i, i + BATCH_SIZE);

				const searchResults = await Promise.all(batch.map(async (track: any) => {
					const searchQuery = track.uri || track.identifier || (track.author ? `${track.title} ${track.author}` : track.title);
					return client.music.search(searchQuery, { requester: user });
				}));

				for (const searchResult of searchResults) {
					if (searchResult?.tracks?.length > 0) {
						await pm.addTracks(searchResult.tracks[0]);
						addedCount++;
					} else {
						failedCount++;
					}
				}
			}

			if (wasEmpty && addedCount > 0) await pm.play();

			const premiumStatus = this._getPremiumStatus(context.guild.id, user.id);
			return this._editReply(
				loadingMessage,
				this._createSuccessContainer(
					playlist,
					addedCount,
					failedCount,
					finalTracks.length,
					premiumStatus,
					queueCheck.limitWarning,
					wasEmpty && addedCount > 0,
				),
			);
		} catch (error: any) {
			logger.error("LoadPlaylistCommand", "Error loading playlist", error);
			return this._editReply(
				loadingMessage,
				this._createErrorContainer(
					i18n.cmd("An unexpected error occurred while loading the playlist."),
				),
			);
		}
	}

	_parseTrackIndices(str: string, max: number): number[] {
		const indices = new Set<number>();
		const parts = str.split(",");

		for (const part of parts) {
			if (part.includes("-")) {
				const [start, end] = part.trim().split("-").map(Number);
				if (
					!isNaN(start) &&
					!isNaN(end) &&
					start <= end &&
					start > 0 &&
					end <= max
				) {
					for (let i = start; i <= end; i++) {
						indices.add(i - 1);
					}
				}
			} else {
				const num = Number(part.trim());
				if (!isNaN(num) && num > 0 && num <= max) {
					indices.add(num - 1);
				}
			}
		}
		return Array.from(indices);
	}

	_findPlaylist(userId: any, query: any) {
		const userPlaylists = db.playlists.getUserPlaylists(userId);
		const trimmedQuery = query.trim();
		if (trimmedQuery.startsWith("pl_"))
			return userPlaylists.find((p) => p.id === trimmedQuery);
		if (trimmedQuery.length <= 16 && !trimmedQuery.includes(" ")) {
			const byId = userPlaylists.find((p) => p.id.includes(trimmedQuery));
			if (byId) return byId;
		}
		return userPlaylists.find(
			(p) => p.name.toLowerCase() === trimmedQuery.toLowerCase(),
		);
	}

	_createUsageContainer() {
		const content =
			`**Usage:** \`load-playlist <name_or_id> [positions]\`\n\n` +
			`Load an entire playlist or just specific tracks.\n\n` +
			`**Examples:**\n` +
			`└─ \`lpl My Favorites\` (loads all)\n` +
			`└─ \`lpl ChillVibes 5\` (loads track 5)\n` +
			`└─ \`lpl MyFavorites: 3,7,10\` (loads: 3, 7, 10)\n` +
			`└─ \`lpl RockClassics 5-10\` (loads 5 through 10)`;

		return buildContainer({
			title: "Load Playlist Command",
			content: content,
			thumbnail: null,
			icon: emoji.get("info") || "ℹ️"
		});
	}

	_createProcessingContainer(
		playlistName: any,
		processedCount: any,
		totalCount: any,
		selectionInfo: any,
	) {
		const progress = Math.round((processedCount / totalCount) * 100) || 0;
		const content =
			`**Adding songs to queue...**\n\n` +
			i18n.cmd("**{emoji} Playlist:** {name}", { emoji: emoji.get("folder"), name: playlistName }) + "\n" +
			i18n.cmd("**{emoji} Selection:** Loading {selection}", { emoji: emoji.get("music"), selection: selectionInfo }) + "\n" +
			i18n.cmd("**{emoji} Progress:** {processed}/{total} ({progress}%)", {
				emoji: emoji.get("loading"),
				processed: processedCount,
				total: totalCount,
				progress,
			});

		return buildContainer({
			title: i18n.translateTitle("Loading Playlist Tracks"),
			content: content,
			thumbnail: null,
			icon: emoji.get("loading") || "ℹ️"
		});
	}

	_createSuccessContainer(
		playlist: any,
		added: any,
		failed: any,
		totalSelected: any,
		premium: any,
		limitWarning: any,
		wasPlaying: any,
	) {
		const statusText = wasPlaying ? i18n.cmd("Started playing: ") : i18n.cmd("Added to queue");
		const title = added > 0 ? i18n.translateTitle("Playlist Loaded Successfully") : i18n.translateTitle("Failed to Load Playlist");
		const note = phrases.get("playlistLoaded");
		const content =
			i18n.cmd("**Loaded tracks from {name}**", { name: playlist.name }) + "\n\n" +
			i18n.cmd("**{emoji} Added:** {added} / {total} selected tracks", {
				emoji: emoji.get("check"),
				added,
				total: totalSelected,
			}) + "\n" +
			`${failed > 0 ? i18n.cmd("**{emoji} Failed:** {failed} tracks (not found)", { emoji: emoji.get("cross"), failed }) + "\n" : ""}` +
			i18n.cmd("**{emoji} Status:** {status}", { emoji: emoji.get("music"), status: statusText }) + "\n\n" +
			i18n.cmd("**Queue Info:** {tier} Tier ({max} limit)", {
				tier: premium.hasPremium ? i18n.cmd("Premium") : i18n.cmd("Free"),
				max: premium.maxSongs,
			}) + "\n" +
			`${limitWarning ? i18n.cmd("**{emoji} Notice:** {warning}", { emoji: emoji.get("info"), warning: limitWarning }) + "\n" : ""}` +
			`\n*${note}*`;

		return buildSuccess(content, title);
	}

	_createLoadingContainer(query: any) { return buildContainer({ title: i18n.translateTitle("Loading"), content: i18n.cmd("**Loading playlist `{query}`...**", { query }), icon: emoji.get("loading") || "ℹ️" }); }
	_createNotFoundContainer(query: any) { return buildError(i18n.cmd("Could not find a playlist matching `{query}`.", { query }), i18n.translateTitle("Playlist Not Found")); }
	_createEmptyPlaylistContainer(playlist: any) { return buildContainer({ title: i18n.translateTitle("Empty Playlist"), content: i18n.cmd("The playlist `{name}` has no tracks to load.", { name: playlist.name }), icon: emoji.get("info") || "ℹ️" }); }
	_createErrorContainer(message: string) { return buildError(message, "Error"); }
	_getPremiumStatus(guildId: any, userId: any) {
		const premiumStatus = db.hasAnyPremium(userId, guildId);
		return {
			hasPremium: !!premiumStatus,
			maxSongs: premiumStatus
				? config.queue.maxSongs.premium
				: config.queue.maxSongs.free,
		};
	}
	_checkQueueLimit(currentQueueSize: any, tracksToAdd: any, guildId: any, userId: any) {
		const premiumStatus = this._getPremiumStatus(guildId, userId);
		const availableSlots = premiumStatus.maxSongs - currentQueueSize;
		if (availableSlots <= 0)
			return {
				allowed: false,
				message: i18n.cmd('Queue is full ({max} songs).', { max: premiumStatus.maxSongs }),
			};
		const canAddAll = tracksToAdd <= availableSlots;
		const tracksToAddActual = canAddAll ? tracksToAdd : availableSlots;
		let limitWarning = !canAddAll
			? i18n.cmd('Only {count} tracks could be added due to queue limit.', { count: tracksToAddActual })
			: null;
		return {
			allowed: true,
			canAddAll,
			tracksToAdd: tracksToAddActual,
			limitWarning,
		};
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
	async _editReply(message: any, container: any) {
		if (!message) return null;
		return message.edit({
			components: [container],
			flags: MessageFlags.IsComponentsV2,
		});
	}
}

export default new LoadPlaylistCommand();

// Made by Nikhil Under CodeX Devs
