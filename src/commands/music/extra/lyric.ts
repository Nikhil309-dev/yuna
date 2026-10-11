import { Command, CommandContext } from '#core/Command';
import type { Player } from 'lavalink-client';
import {
	ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Message,
  MessageFlags,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize
} from "discord.js";
import { config } from "#config/config";
import emoji from "#config/emoji";
import { logger } from "#utils/logger";
import { buildContainer, buildError } from '#ui/Theme';
import { componentCollectorSource } from '#ui/Components';
import phrases from "#utils/phrases";
import { Client as LrcClient, type Query, type Search } from "lrclib-api";
import { i18n } from "#utils/i18n";

const lrclib = new LrcClient();


class LyricsCommand extends Command {
	constructor() {
		super({
			name: "lyrics",
			description:
				"Get synchronized lyrics for the currently playing song with live timing",
			usage: "lyrics [song name]",
			aliases: ["ly", "lyric"],
			category: "music",
			examples: ["lyrics", "lyrics Never Gonna Give You Up"],
			cooldown: 5,
			access: {
				voice: false,
			},
			slash: {
				enabled: true,
				autoDefer: true,
				data: {
					name: "lyrics",
					description:
						"Get synchronized lyrics for the currently playing song",
					options: [
						{
							name: "query",
							description: i18n.cmd("Search lyrics by song name (optional — uses current song if empty)"),
							type: 3,
							required: false,
						},
					],
				},
			},
		});
	}

	async execute(ctx: CommandContext) {
		const { client, message, interaction, player, args = [] } = ctx;
		const context = interaction || message;
		try {
			const activePlayer = player || client.music?.getPlayer(context.guildId || context.guild?.id);
			const manualQuery = interaction ? (interaction.options.getString("query") || null) : (args.length > 0 ? args.join(" ") : null);

			if (!activePlayer?.queue?.current && !manualQuery) {
				const errorContainer = this._createErrorContainer("No song is currently playing. Use `/lyrics query:song name` or `.lyrics <song name>` to search manually.");
				const payload = { components: [errorContainer], flags: MessageFlags.IsComponentsV2 };
				if (context.editReply && (context.deferred || context.replied)) {
					return await context.editReply(payload);
				}
				return await (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload);
			}

			let loadingMsg;
			const loadPayload = {
				components: [this._createLoadingContainer()],
				flags: MessageFlags.IsComponentsV2,
			};
			if (interaction) {
				loadingMsg = await interaction.editReply(loadPayload);
			} else {
				loadingMsg = await message.reply(loadPayload);
			}

			const track = activePlayer?.queue?.current || null;
			const { trackName, artistName } = this._extractTrackInfo(track, manualQuery);

			const lyricsData = await this._fetchLyrics(trackName, artistName, track?.info?.duration, manualQuery ? null : track?.encoded);

			if (!lyricsData) {
				const notFoundPayload = {
					components: [this._createNotFoundContainer(trackName, artistName)],
					flags: MessageFlags.IsComponentsV2,
				};
				if (interaction) {
					return await interaction.editReply(notFoundPayload);
				}
				return await loadingMsg.edit(notFoundPayload);
			}

			const displayTarget = interaction || loadingMsg;
			await this._handleLyricsDisplay(
				displayTarget, lyricsData, track, activePlayer, client,
				context.guild.id, (context.user || context.author).id, !!interaction,
			);
		} catch (error) {
			logger.error("LyricsCommand", `Error in lyrics command: ${(error as Error).message}`, error);
			const errorContainer = this._createErrorContainer(i18n.cmd("An error occurred while fetching lyrics."));
			const payload = { components: [errorContainer], flags: MessageFlags.IsComponentsV2 };
			if (context.editReply && (context.deferred || context.replied)) {
				await context.editReply(payload).catch(() => {});
			} else if (context.reply) {
				await (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload).catch(() => {});
			}
		}
	}

	async slashExecute(ctx: CommandContext) {
		return this.execute(ctx);
	}

	_extractTrackInfo(track: any, manualQuery: any) {
		if (manualQuery) {

			const dashSplit = manualQuery.match(/^(.+?)\s*[-–—]\s*(.+)$/);
			if (dashSplit) {
				return { trackName: dashSplit[2].trim(), artistName: dashSplit[1].trim() };
			}
			return { trackName: manualQuery.trim(), artistName: "" };
		}

		if (!track?.info) return { trackName: "", artistName: "" };

		let title = track.info.title || "";
		let artist = track.info.author || "";

		title = title
			.replace(/\s*[\(\[](?:official|lyric|music|audio|video|hd|hq|4k|visualizer|feat\.|ft\.).*?[\)\]]/gi, "")
			.replace(/\s*\|.*$/, "")
			.trim();

		const titleDash = title.match(/^(.+?)\s*[-–—]\s*(.+)$/);
		if (titleDash && (!artist || artist === "Unknown" || artist === "Unknown Artist")) {
			artist = titleDash[1].trim();
			title = titleDash[2].trim();
		}

		artist = artist
			.replace(/\s*[-–—]\s*Topic$/i, "")
			.replace(/VEVO$/i, "")
			.trim();

		return { trackName: title, artistName: artist };
	}

	async _fetchNodeLinkLyrics(encodedTrack: any) {
		if (!encodedTrack) return null;
		try {
			const node = config.nodes?.[0];
			if (!node || !node.host || !node.port) return null;
			const protocol = node.secure ? 'https' : 'http';
			const url = `${protocol}://${node.host}:${node.port}/v4/loadlyrics?encodedTrack=${encodeURIComponent(encodedTrack)}`;

			const res = await fetch(url, {
				headers: {
					Authorization: node.authorization
				}
			});

			if (res.ok) {
				const json = await res.json();
				if (json.loadType === "lyrics" && json.data) {
					const data = json.data;
					const syncedLines = (data.lines || []).map((line: any) => ({
						timeMs: line.timestamp || line.time || 0,
						text: line.line || line.text || ""
					})).filter((l: any) => l.text);

					return {
						trackName: data.track?.title || "Unknown",
						artistName: data.track?.author || "Unknown",
						albumName: data.track?.album || "",
						duration: 0,
						plainLyrics: data.text || syncedLines.map((l: any) => l.text).join("\n"),
						syncedLyrics: "",
						syncedLines,
						source: i18n.cmd("NodeLink Native API")
					};
				}
			}
		} catch (error) {
			logger.debug("LyricsCommand", `NodeLink native lyrics fetch failed: ${(error as Error).message}`);
		}
		return null;
	}

	async _fetchLyrics(trackName: any, artistName: any, durationMs: any, encodedTrack: any) {

		if (encodedTrack) {
			const nodeLinkResult = await this._fetchNodeLinkLyrics(encodedTrack);
			if (nodeLinkResult && (nodeLinkResult.syncedLines.length > 0 || nodeLinkResult.plainLyrics)) {
				logger.info("LyricsCommand", `Successfully loaded lyrics via NodeLink Native API for: ${trackName}`);
				return nodeLinkResult;
			}
		}

		if (!trackName) return null;

		const query: Query = { track_name: trackName, artist_name: artistName || "" };
		if (durationMs && durationMs > 0) query.duration = Math.round(durationMs / 1000);

		try {

			const result = await lrclib.findLyrics(query);
			if (result && (result.syncedLyrics || result.plainLyrics)) {
				return this._normalizeLrcResult(result);
			}
		} catch (_) {}

		try {
			const queryNoDur: Query = { track_name: trackName, artist_name: artistName || "" };
			const result = await lrclib.findLyrics(queryNoDur);
			if (result && (result.syncedLyrics || result.plainLyrics)) {
				return this._normalizeLrcResult(result);
			}
		} catch (_) {}

		try {
			const searchResults = await lrclib.searchLyrics({
				query: artistName ? `${artistName} ${trackName}` : trackName,
			} as Search);
			if (searchResults && searchResults.length > 0) {
				const best = searchResults.find(r => r.syncedLyrics) || searchResults[0];
				if (best && (best.syncedLyrics || best.plainLyrics)) {
					return this._normalizeLrcResult(best);
				}
			}
		} catch (_) {}

		return null;
	}

	_normalizeLrcResult(result: any) {
		const data = {
			trackName: result.trackName || result.name || "Unknown",
			artistName: result.artistName || "Unknown",
			albumName: result.albumName || "",
			duration: result.duration || 0,
			plainLyrics: result.plainLyrics || "",
			syncedLyrics: result.syncedLyrics || "",
			syncedLines: [] as Array<{ timeMs: number; text: string }>,
			source: "LRCLIB",
		};

		if (data.syncedLyrics) {
			data.syncedLines = this._parseLRC(data.syncedLyrics);
		}

		return data;
	}

	_parseLRC(lrcText: any) {
		const lines = [];
		const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/;

		for (const raw of lrcText.split("\n")) {
			const match = raw.match(regex);
			if (match) {
				const mins = parseInt(match[1]);
				const secs = parseInt(match[2]);
				const ms = match[3].length === 2 ? parseInt(match[3]) * 10 : parseInt(match[3]);
				const timeMs = (mins * 60 + secs) * 1000 + ms;
				const text = match[4].trim();
				if (text) lines.push({ timeMs, text });
			}
		}

		return lines;
	}

	async _handleLyricsDisplay(msgOrInt: any, lyricsData: any, track: any, player: Player, client: Client, guildId: any, userId: any, isInteraction: any) {
		const hasSynced = lyricsData.syncedLines.length > 0;
		const isPlaying = player && player.queue?.current;

		if (hasSynced && isPlaying) {
			await this._displayLiveLyrics(msgOrInt, lyricsData, track, player, client, guildId, userId, isInteraction);
		} else if (lyricsData.plainLyrics) {
			await this._displayStaticLyrics(msgOrInt, lyricsData, track, guildId, userId, isInteraction);
		} else {
			const container = this._createErrorContainer("Lyrics data is incomplete or unavailable.");
			if (isInteraction) {
				await msgOrInt.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
			} else {
				await msgOrInt.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
			}
		}
	}

	async _displayLiveLyrics(msgOrInt: any, lyricsData: any, track: any, player: Player, client: Client, guildId: any, userId: any, isInteraction: any) {
		let currentLineIdx = -1;
		let isActive = true;
		let lastEditTime = 0;

		const getPosition = () => {
			try { return player.position || 0; } catch { return 0; }
		};

		const title = track?.info?.title || i18n.cmd('Unknown Track');
		const artist = track?.info?.author || i18n.cmd('Unknown Artist');
		const artworkUrl = track?.info?.artworkUrl || track?.info?.uri;

		const buildLiveContainer = (positionMs: any) => {
			const { currentLine, prevLines, nextLines } = this._getSyncContext(lyricsData.syncedLines, positionMs);

			const container = buildContainer({
      title: "`🎤 **Live Lyrics**`",
      content: `🎵 **${this._truncate(title, 45)}**\n🎤 ${this._truncate(artist, 40)}`,
      thumbnail: artworkUrl,
      icon: emoji.get("info") || "ℹ️"
    });
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

		const lyricsContent = prevLines.map((l: any) => l.text).join('\n') +
			`\n> **${currentLine?.text || ''}**\n` +
			nextLines.map((l: any) => l.text).join('\n');
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(lyricsContent)
		);
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

		const albumInfo = lyricsData.albumName ? `  •  💿 ${lyricsData.albumName}` : "";
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(i18n.cmd("-# 📖 Source: LRCLIB{album}", { album: albumInfo }))
		);

		return container;
	  };

		const initialPayload = { components: [buildLiveContainer(getPosition())], flags: MessageFlags.IsComponentsV2 };
		const sent = isInteraction
			? await msgOrInt.editReply(initialPayload).catch(() => null)
			: await msgOrInt.edit(initialPayload).catch(() => null);
		if (sent === null) return;

		const trackUri = track?.info?.uri || track?.info?.identifier;
		const maxDurationMs = (track?.info?.duration || 300_000) + 15_000;

		const interval = setInterval(async () => {
			if (!isActive) return;
			try {
				const positionMs = getPosition();

				const currentTrack = player?.queue?.current;
				const currentUri = currentTrack?.info?.uri || currentTrack?.info?.identifier;
				if (!currentTrack || (trackUri && currentUri && currentUri !== trackUri)) {
					isActive = false;
					clearInterval(interval);
					return;
				}

				if (positionMs >= maxDurationMs) {
					isActive = false;
					clearInterval(interval);
					return;
				}

				const { currentIdx } = this._getSyncContext(lyricsData.syncedLines, positionMs);
				const now = Date.now();

				if (currentIdx !== currentLineIdx && now - lastEditTime >= 2000) {
					currentLineIdx = currentIdx;
					lastEditTime = now;
					const payload = { components: [buildLiveContainer(positionMs)], flags: MessageFlags.IsComponentsV2 };
					if (isInteraction) {
						await msgOrInt.editReply(payload);
					} else {
						await msgOrInt.edit(payload);
					}
				}
			} catch {
				isActive = false;
				clearInterval(interval);
			}
		}, 1000);

		setTimeout(() => {
			isActive = false;
			clearInterval(interval);
		}, maxDurationMs);
	}

	_getSyncContext(syncedLines: any, positionMs: any) {
		if (!syncedLines?.length) {
			return { currentIdx: -1, currentLine: null, prevLines: [], nextLines: [] };
		}

		let currentIdx = 0;
		for (let i = 0; i < syncedLines.length; i++) {
			if (syncedLines[i].timeMs <= positionMs) currentIdx = i;
			else break;
		}

		const currentLine = syncedLines[currentIdx];
		const prevLines = syncedLines.slice(Math.max(0, currentIdx - 2), currentIdx);
		const nextLines = syncedLines.slice(currentIdx + 1, currentIdx + 4);
		return { currentIdx, currentLine, prevLines, nextLines };
	}

	async _displayStaticLyrics(msgOrInt: any, lyricsData: any, track: any, guildId: any, userId: any, isInteraction: any) {
		const title = track?.info?.title || lyricsData.trackName || i18n.cmd('Unknown Track');
		const artist = track?.info?.author || lyricsData.artistName || i18n.cmd('Unknown Artist');
		const artworkUrl = track?.info?.artworkUrl || track?.info?.uri;

		const chunks = this._chunkLyrics(lyricsData.plainLyrics || "");
		let page = 0;

		const buildPage = (pageIdx: number) => {
			const container = buildContainer({
				title: "`📜 **Lyrics**`",
				content: `🎵 **${this._truncate(title, 45)}**\n🎤 ${this._truncate(artist, 40)}`,
				thumbnail: artworkUrl,
				icon: emoji.get("info") || "ℹ️"
			});
			container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent(chunks[pageIdx]));
			container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
			const albumInfo = lyricsData.albumName ? `  •  💿 ${lyricsData.albumName}` : "";
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(i18n.cmd("-# 📖 Source: LRCLIB{album}", { album: albumInfo }))
			);
			return container;
		};

		const payload = () => ({
			components: [buildPage(page), this._getPaginationButtons(page, chunks.length, guildId, userId)],
			flags: MessageFlags.IsComponentsV2,
		});

		let message: Message | null = null;
		if (isInteraction) {
			await msgOrInt.editReply(payload()).catch(() => {});
			message = await msgOrInt.fetchReply().catch(() => null);
		} else {
			await msgOrInt.edit(payload()).catch(() => {});
			message = msgOrInt as Message;
		}
		if (!message || chunks.length <= 1) return;

		const filter = (i: any) =>
			(i.customId === `lyp_prev_${guildId}` || i.customId === `lyp_next_${guildId}`) && i.user.id === userId;

		const collector = componentCollectorSource(message).createMessageComponentCollector({ filter, time: 300_000 });

		collector.on("collect", async (interaction: any) => {
			try {
				await interaction.deferUpdate();

				if (interaction.customId === `lyp_prev_${guildId}` && page > 0) page--;
				if (interaction.customId === `lyp_next_${guildId}` && page < chunks.length - 1) page++;

				await interaction.editReply(payload());
			} catch (e) {
				logger.warn("LyricsCommand", `Pagination interaction failed: ${e}`);
			}
		});

		collector.on("end", async () => {
			try {
				await (message as Message).edit({
					components: [buildPage(page)],
					flags: MessageFlags.IsComponentsV2,
				}).catch(() => {});
			} catch {  }
		});
	}

	_createLoadingContainer() {
		const info = i18n.cmd("**Searching Lyric Libraries**\n└─ Fetching synchronized lyrics...");
		const container = buildContainer({
      title: i18n.translateTitle("Fetching Lyrics"),
      content: `${info}\n\n${i18n.cmd("*Try using `lyrics Artist - Song Name` for better results*")}`,
      thumbnail: config.assets?.defaultTrackArtwork,
      icon: emoji.get("loading") || "ℹ️"
    });

		return container;
	}

	_getPaginationButtons(page: any, total: any, guildId: any, userId: any) {
		return new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`lyp_prev_${guildId}`)
				.setLabel(i18n.cmd("Previous"))
				.setEmoji("◀️")
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(page === 0),
			new ButtonBuilder()
				.setCustomId(`lyp_page_${guildId}`)
				.setLabel(`${page + 1} / ${total}`)
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(true),
			new ButtonBuilder()
				.setCustomId(`lyp_next_${guildId}`)
				.setLabel(i18n.cmd("Next"))
				.setEmoji("▶️")
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(page === total - 1),
		);
	}

	_chunkLyrics(lyrics: any, maxLength = 1500) {
		const chunks = [];
		const lines = lyrics.split("\n");
		let current = "";

		for (const line of lines) {
			if ((current + line + "\n").length > maxLength) {
				if (current.trim()) chunks.push(current.trim());
				current = line + "\n";
			} else {
				current += line + "\n";
			}
		}

		if (current.trim()) chunks.push(current.trim());
		return chunks.length > 0 ? chunks : [i18n.cmd("No lyrics available")];
	}

	_createProgressBar(currentMs: any, totalMs: any, length = 16) {
		if (!totalMs || totalMs <= 0) return "▒".repeat(length);
		const progress = Math.max(0, Math.min(1, currentMs / totalMs));
		const filled = Math.round(progress * length);
		const empty = length - filled;
		return "█".repeat(filled) + "░".repeat(empty);
	}

	_fmt(ms: any) {
		if (!ms || ms < 0) return "0:00";
		const secs = Math.floor((ms / 1000) % 60).toString().padStart(2, "0");
		const mins = Math.floor((ms / (1000 * 60)) % 60);
		const hrs = Math.floor(ms / (1000 * 60 * 60));
		return hrs > 0 ? `${hrs}:${mins.toString().padStart(2, "0")}:${secs}` : `${mins}:${secs}`;
	}

	_truncate(str: any, maxLen: any) {
		if (!str) return "";
		return str.length > maxLen ? str.substring(0, maxLen - 1) + "…" : str;
	}

	_createErrorContainer(msg: any) {
		return buildError(msg);
	}

	_createNotFoundContainer(trackName: any, artistName: any) {
		return buildError(phrases.get("lyricNotFound"));
	}
}

export default new LyricsCommand();

// Made by Nikhil Under CodeX Devs
