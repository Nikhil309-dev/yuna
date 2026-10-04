import { Command, CommandContext } from '#core/Command';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	MessageFlags,
} from "discord.js";
import type { Client } from "discord.js";
import os from "os";
import { config } from "#config/config";
import emoji from "#config/emoji";
import { logger } from "#utils/logger";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import { componentCollectorSource } from "#ui/Components";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";

class BotInfoCommand extends Command {
	constructor() {
		super({
			name: "botinfo",
			description: "Shows detailed system, audio engine, and development statistics for Yuna.",
			usage: "botinfo",
			aliases: ["bot", "info", "about", "stats"],
			category: "info",
			examples: ["botinfo", "bot", "stats"],
			cooldown: 5,
			slash: {
				enabled: true,
				data: {
					name: "botinfo",
					description: "Get detailed information and live statistics about Yuna bot.",
				},
			},
		});
	}

	async execute({ client, message }: any) {
		try {
			const messageInstance = await message.reply({
				components: [this._createBotInfoContainer(client, "overview")],
				flags: MessageFlags.IsComponentsV2,
			});

			this._setupCollector(messageInstance, message.author.id, client);
		} catch (error: any) {
			logger.error("BotInfoCommand", `Error in prefix command: ${error.message}`, error);
			await message.reply({
				components: [this._createErrorContainer(i18n.cmd("An error occurred while loading bot information."))],
				flags: MessageFlags.IsComponentsV2,
			}).catch(() => {});
		}
	}

	async slashExecute({ client, interaction }: any) {
		try {
			const messageInstance = await interaction.editReply({
				components: [this._createBotInfoContainer(client, "overview")],
				flags: MessageFlags.IsComponentsV2,
			});

			this._setupCollector(messageInstance, interaction.user.id, client);
		} catch (error: any) {
			logger.error("BotInfoCommand", `Error in slash command: ${error.message}`, error);
			const errorPayload = {
				components: [this._createErrorContainer(i18n.cmd("An error occurred while loading bot information."))],
				ephemeral: true,
			};
			if (interaction.replied || interaction.deferred) {
				await interaction.editReply(errorPayload).catch(() => {});
			} else {
				await interaction.reply(errorPayload).catch(() => {});
			}
		}
	}

	_createBotInfoContainer(client: any, tab = "overview") {
		const buttonRow = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId("binfo_tab_overview")
				.setLabel(i18n.cmd("Overview"))
				.setStyle(tab === "overview" ? ButtonStyle.Primary : ButtonStyle.Secondary),
			new ButtonBuilder()
				.setCustomId("binfo_tab_audio")
				.setLabel(i18n.cmd("Audio Engine"))
				.setStyle(tab === "audio" ? ButtonStyle.Primary : ButtonStyle.Secondary),
			new ButtonBuilder()
				.setCustomId("binfo_tab_team")
				.setLabel(i18n.cmd("Team & Links"))
				.setStyle(tab === "team" ? ButtonStyle.Primary : ButtonStyle.Secondary),
			new ButtonBuilder()
				.setLabel("Support")
				.setStyle(ButtonStyle.Link)
				.setURL("https://discord.gg/XYwwyDKhec"),
		);

		if (tab === "overview") {
			const uptime = this._formatUptime(client.uptime);
			const memoryUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
			const totalMemGb = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);

			let activePlayers = 0;
			if (client.music?.players) {
				client.music.players.forEach((p: any) => { if (p.playing) activePlayers++; });
			}

			const content =
				`Hello! I am **Yuna**, a high-performance music bot designed for rich audio experiences.\n\n` +
				`**System Status**\n` +
				`└─ **Uptime:** ${uptime}\n` +
				`└─ **Memory:** ${memoryUsage} MB / ${totalMemGb} GB\n` +
				`└─ **Ping:** ${client.ws.ping}ms\n\n` +
				`**Network & Audio**\n` +
				`└─ **Servers:** ${client.guilds.cache.size.toLocaleString()} (${client.users.cache.size.toLocaleString()} users)\n` +
				i18n.cmd("└─ **Audio Sessions:** {active} active / {total} total\n", { active: activePlayers, total: client.music?.players?.size || 0 }) +
				`└─ **Framework:** Discord.js v14\n`;

			return buildContainer({
				title: "Yuna Bot Information & System Overview",
				content,
				thumbnail: config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork,
				components: [buttonRow],
				icon: "🌸"
			});

		} else if (tab === "audio") {
			const nodes = client.lavalink?.nodeManager?.nodes || new Map();
			let nodeDetails = "";

			nodes.forEach((node: any, name: any) => {
				const isConnected = node.connected;
				const stats = node.stats || {};
				const players = stats.players || 0;
				const playing = stats.playingPlayers || 0;
				const cpuLavalink = stats.cpu?.lavalinkLoad ? (stats.cpu.lavalinkLoad * 100).toFixed(1) + "%" : "0%";
				const memUsedMb = stats.memory?.allocated ? (stats.memory.allocated / 1024 / 1024).toFixed(1) : "N/A";

				nodeDetails += `└─ **${name}** (${isConnected ? "🟢" : "🔴"})\n` +
					`   ├─ **Players:** ${playing}/${players}\n` +
					`   ├─ **CPU:** ${cpuLavalink}\n` +
					`   └─ **Mem:** ${memUsedMb} MB\n\n`;
			});

			const content =
				`**Audio Infrastructure**\n` +
				i18n.cmd("└─ **Connected Nodes:** {count}\n", { count: nodes.size }) +
				`└─ **Sources:** YouTube, Spotify, JioSaavn, SoundCloud\n` +
				`└─ **Filters:** Bassboost, Nightcore, Vaporwave, 8D, EQ\n\n` +
				`**Node Health:**\n` + (nodeDetails.trim() || i18n.cmd("No active nodes."));

			return buildContainer({
				title: "Lavalink Audio Engine Stats",
				content,
				thumbnail: config.assets?.defaultThumbnail,
				components: [buttonRow],
				icon: "🎵"
			});

		} else if (tab === "team") {
			const content =
				`**Credits & Branding**\n` +
				`└─ **Lead Developer:** Nikhil\n` +
				`└─ **Bot Name:** Yuna\n` +
				`└─ **Framework:** discord jsv14 \n` +
				`└─ **Support Server:** [Join our Discord!](https://discord.gg/XYwwyDKhec)\n\n`;

			return buildContainer({
				title: "Yuna Development Team & Links",
				content,
				thumbnail: config.assets?.defaultThumbnail,
				components: [buttonRow],
				icon: "👑"
			});
		}
	}

	_createErrorContainer(message: string) {
		return buildError(message);
	}

	_formatUptime(ms: any) {
		const seconds = Math.floor((ms / 1000) % 60);
		const minutes = Math.floor((ms / (1000 * 60)) % 60);
		const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
		const days = Math.floor(ms / (1000 * 60 * 60 * 24));

		if (days > 0) return `${days}d ${hours}h ${minutes}m`;
		if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
		if (minutes > 0) return `${minutes}m ${seconds}s`;
		return `${seconds}s`;
	}

	_setupCollector(messageInstance: any, userId: any, client: Client) {
		const collector = componentCollectorSource(messageInstance).createMessageComponentCollector({
			filter: (i: any) => i.user.id === userId,
			time: 120_000,
		});

		collector.on("collect", async (interaction: any) => {
			try {
				if (interaction.customId === "binfo_tab_overview") {
					const container = this._createBotInfoContainer(client, "overview");
					await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
				} else if (interaction.customId === "binfo_tab_audio") {
					const container = this._createBotInfoContainer(client, "audio");
					await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
				} else if (interaction.customId === "binfo_tab_team") {
					const container = this._createBotInfoContainer(client, "team");
					await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
				}
			} catch (error: any) {
				logger.error("BotInfoCommand", `Error in collector interaction: ${error.message}`, error);
			}
		});
	}
}

export default new BotInfoCommand();

// Made by Nikhil Under CodeX Devs
