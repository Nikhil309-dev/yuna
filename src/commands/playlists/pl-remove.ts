import type { Message, Interaction, CommandInteraction } from 'discord.js';
import type { YunaClient } from '#core/YunaClient';
import { Command } from "#core/Command";
import { MessageFlags } from "discord.js";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import { db } from "#database/Database";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";
import { splitFooter } from "#ui/Formatters";

class RemoveTrackCommand extends Command {
	constructor() {
		super({
			name: "remove-track",
			description: "Remove tracks from a playlist by position or range",
			usage: "remove-track <playlist_name_or_id> <positions>",
			aliases: ["rm-track", "pl-remove"],
			category: "music",
			examples: [
				"remove-track MyFavorites 5",
				"rm-track MyFavorites: 3, 7, 10",
				"pl-remove MyFavorites 5-10",
			],
			cooldown: 3,
			slash: {
				enabled: true,
				autoDefer: true,
				data: {
					name: "remove-track",
					description: "Remove tracks from a playlist",
					options: [
						{
							name: "playlist",
							description: i18n.cmd("The ID or name of the playlist"),
							type: 3,
							required: true,
						},
						{
							name: "positions",
							description: i18n.cmd("Track numbers or ranges to remove (e.g., 5, 8-10)"),
							type: 3,
							required: true,
						},
					],
				},
			},
		});
	}

	async execute(ctx: any) {
		const { client, message, interaction, player, pm, args = [] } = ctx;
		const context = interaction || message;
		let query, positions;

		if (interaction) {
			query = interaction.options.getString("playlist");
			positions = interaction.options.getString("positions");
		} else {
			if (args.length < 2) {
				const container = this._createUsageContainer();
				return this._reply(context, container);
			}
			positions = args.pop();
			query = args.join(" ");
		}

		return this._handleRemove(context.user || context.author, context, query, positions);
	}

	async slashExecute(ctx: any) {
		return this.execute(ctx);
	}

	async _handleRemove(user: any, context: any, query: any, positionsStr: any) {
		const playlist = this._findPlaylist(user.id, query);
		if (!playlist)
			return this._reply(
				context,
				this._createErrorContainer(
					i18n.cmd('Playlist not found for query`{query}`', { query }),
				),
			);
		if (playlist.tracks.length === 0)
			return this._reply(
				context,
				this._createErrorContainer(i18n.cmd("This playlist is empty.")),
			);

		const indicesToRemove = this._parseTrackIndices(
			positionsStr,
			playlist.tracks.length,
		);
		if (indicesToRemove.length === 0) {
			return this._reply(
				context,
				this._createErrorContainer(
					i18n.cmd("Invalid or out-of-range track numbers provided."),
				),
			);
		}

		const removedTracks = [];
		let successCount = 0;
		let failCount = 0;

		indicesToRemove.sort((a, b) => b - a);

		for (const index of indicesToRemove) {
			const track = playlist.tracks[index];
			if (track) {
				try {
					await db.playlists.removeTrackFromPlaylist(
						playlist.id,
						user.id,
						track.identifier,
					);
					removedTracks.push(`**${index + 1}.** ${track.title}`);
					successCount++;
				} catch (error: any) {
					logger.error(
						"RemoveTrack",
						`Failed to remove track at index ${index}`,
						error,
					);
					failCount++;
				}
			}
		}

		const finalPlaylist = db.playlists.getPlaylist(playlist.id);
		return this._reply(
			context,
			this._createSuccessContainer(
				finalPlaylist,
				removedTracks,
				successCount,
				failCount,
			),
		);
	}

	_parseTrackIndices(str: string, max: number): number[] {
		const indices = new Set<number>();
		const parts = str.split(",");

		for (const part of parts) {
			if (part.includes("-")) {
				const [start, end] = part.split("-").map(Number);
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
				const num = Number(part);
				if (!isNaN(num) && num > 0 && num <= max) {
					indices.add(num - 1);
				}
			}
		}
		return Array.from(indices);
	}

	_findPlaylist(userId: any, query: any) {
		const userPlaylists = db.playlists.getUserPlaylists(userId);
		const trimmedQuery = String(query ?? "").trim();
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

	_createSuccessContainer(playlist: any, removedTracks: any, success: any, failed: any) {
		const note = phrases.get("playlistUpdated");
		const body = splitFooter(i18n.cmd("Successfully removed **{count}** track(s) from **{name}**.\n\n*{note}*", { count: success, name: playlist.name, note }));

		return buildSuccess({ message: body.content, footer: body.footer }, "Tracks Removed");
	}

	_createErrorContainer(message: string) {
		return buildError(message);
	}

	_createUsageContainer() {
		const content =
			`**Usage:** \`remove-track <playlist_name_or_id> <positions>\`\n\n` +
			`Remove specific tracks or ranges from a playlist.\n\n` +
			`**Examples:**\n` +
			`└─ \`remove-track MyFavorites 5\` (removes track 5)\n` +
			`└─ \`remove-track MyFavorites: 3,7,10\` (removes: 3, 7, 10)\n` +
			`└─ \`remove-track MyFavorites 5-10\` (removes 5 through 10)`;
		return buildContainer({
			title: "Remove Track Command",
			content,
			icon: emoji.get("info") || "ℹ️"
		});
	}

	async _reply(context: any, container: any) {
		const payload = {
			components: [container],
			flags: MessageFlags.IsComponentsV2,
		};
		if (context.replied || context.deferred) return context.editReply(payload);
		return (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload);
	}
}

export default new RemoveTrackCommand();

// Made by Nikhil Under CodeX Devs
