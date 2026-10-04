import type { Message, Interaction, CommandInteraction } from 'discord.js';
import type { YunaClient } from '#core/YunaClient';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MessageFlags,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	ThumbnailBuilder,
} from "discord.js";
import { config } from "#config/config";
import { Command } from "#core/Command";
import emoji from "#config/emoji";
import { logger } from "#utils/logger";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import { componentCollectorSource } from "#ui/Components";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";

class LavalinkCommand extends Command {
	constructor() {
		super({
			name: "lavalink",
			description: "Inspect Lavalink nodes status, memory, CPU, and manage connections (Developer Only)",
			usage: "lavalink",
			aliases: ["nodes", "nodeinfo", "lavanode"],
			category: "developer",
			access: { ownerOnly: true },
		});
	}

	async execute({ client, message }: any) {
		try {
			const container = this._createNodeStatusContainer(client);
			const msgInstance = await message.reply({
				components: [container],
				flags: MessageFlags.IsComponentsV2,
			});

			this._setupCollector(msgInstance, message.author.id, client);
		} catch (error: any) {
			logger.error("LavalinkCommand", "Error in lavalink command", error);
			await message.reply({
				components: [buildError("An error occurred.")],
				flags: MessageFlags.IsComponentsV2,
			}).catch(() => {});
		}
	}

	_createNodeStatusContainer(client: YunaClient) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(i18n.cmd("### {emoji} **{title}**", { emoji: emoji.get("music"), title: i18n.translateTitle("Lavalink Nodes Dashboard") })),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
		);

		const nodes = client.lavalink?.nodeManager?.nodes || new Map();
		const nodeCount = nodes.size || 0;

		if (nodeCount === 0) {
			const emptySection = new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(i18n.cmd("**No Lavalink nodes connected.**\n\nCheck Lavalink server configuration in `.env`.")),
				)
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork),
				);

			container.addSectionComponents(emptySection);
		} else {
			let totalPlayers = 0;
			let playingPlayers = 0;
			let nodeDetails = "";

			nodes.forEach((node: any, name: any) => {
				const isConnected = node.connected;
				const stats = node.stats || {};
				const players = stats.players || node.players?.size || 0;
				const playing = stats.playingPlayers || 0;
				totalPlayers += players;
				playingPlayers += playing;

				const memUsedMb = stats.memory?.allocated ? (stats.memory.allocated / 1024 / 1024).toFixed(1) : "N/A";
				const memFreeMb = stats.memory?.free ? (stats.memory.free / 1024 / 1024).toFixed(1) : "N/A";
				const cpuSystem = stats.cpu?.systemLoad ? (stats.cpu.systemLoad * 100).toFixed(1) + "%" : "0%";
				const cpuLavalink = stats.cpu?.lavalinkLoad ? (stats.cpu.lavalinkLoad * 100).toFixed(1) + "%" : "0%";
				const uptimeMs = stats.uptime || 0;

				const statusDot = isConnected ? "🟢" : "🔴";
				const hostStr = `${node.options?.host || i18n.cmd("Host")}:${node.options?.port || "9000"}`;

				nodeDetails += i18n.cmd("{dot} **Node:** `{name}` ({host})\n", { dot: statusDot, name, host: hostStr }) +
					i18n.cmd("├─ **Status:** {status}\n", { status: isConnected ? i18n.cmd("Connected") : i18n.cmd("Disconnected") }) +
					i18n.cmd("├─ **Players:** {playing} playing / {total} total\n", { playing, total: players }) +
					i18n.cmd("├─ **CPU Load:** Lavalink {lavalink} | System {system}\n", { lavalink: cpuLavalink, system: cpuSystem }) +
					i18n.cmd("├─ **Memory:** {used} MB used / {free} MB free\n", { used: memUsedMb, free: memFreeMb }) +
					i18n.cmd("└─ **Node Uptime:** {uptime}\n\n", { uptime: this._formatUptime(uptimeMs) });
			});

			const overview = i18n.cmd("**Overall Overview**\n") +
				i18n.cmd("├─ **Connected Nodes:** {count}\n", { count: nodeCount }) +
				i18n.cmd("├─ **Total Players:** {count}\n", { count: totalPlayers }) +
				i18n.cmd("└─ **Active Playbacks:** {count}\n\n", { count: playingPlayers }) +
				i18n.cmd("**Connected Node Details:**\n") + nodeDetails.trim();

			const section = new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(overview),
				)
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork),
				);

			container.addSectionComponents(section);
		}

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
		);

		const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder()
				.setCustomId("node_refresh")
				.setLabel(i18n.cmd("Refresh Stats"))
				.setStyle(ButtonStyle.Primary),
			new ButtonBuilder()
				.setCustomId("node_reconnect")
				.setLabel(i18n.cmd("Reconnect Nodes"))
				.setStyle(ButtonStyle.Secondary),
		);

		container.addActionRowComponents(buttons);

		return container;
	}

	_setupCollector(messageInstance: Message, userId: string, client: YunaClient) {
		const collector = componentCollectorSource(messageInstance).createMessageComponentCollector({
			filter: (i: any) => i.user.id === userId,
			time: 120_000,
		});

		collector.on("collect", async (interaction: any) => {
			try {
				if (interaction.customId === "node_refresh") {
					const updatedContainer = this._createNodeStatusContainer(client);
					await interaction.update({
						components: [updatedContainer],
						flags: MessageFlags.IsComponentsV2,
					});
				} else if (interaction.customId === "node_reconnect") {
					await interaction.deferUpdate();
					const nodes = client.lavalink?.nodeManager?.nodes;
					if (nodes) {
						nodes.forEach(async (node: any) => {
							try {
								if (!node.connected) await node.connect();
							} catch (_) {}
						});
					}
					const updatedContainer = this._createNodeStatusContainer(client);
					await interaction.editReply({
						components: [updatedContainer],
						flags: MessageFlags.IsComponentsV2,
					});
				}
			} catch (error: any) {
				logger.error("LavalinkCommand", "Error in collector interaction", error);
			}
		});
	}

	_createErrorContainer(msg: string) {
		const container = new ContainerBuilder();
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(i18n.cmd("### {emoji} **{title}**", { emoji: emoji.get("cross"), title: i18n.translateTitle("Lavalink Error") })),
		);
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(msg))
				.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail)),
		);
		return container;
	}

	_formatUptime(ms: number) {
		if (!ms || ms <= 0) return "0s";
		const seconds = Math.floor((ms / 1000) % 60);
		const minutes = Math.floor((ms / (1000 * 60)) % 60);
		const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
		const days = Math.floor(ms / (1000 * 60 * 60 * 24));

		if (days > 0) return `${days}d ${hours}h ${minutes}m`;
		if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
		if (minutes > 0) return `${minutes}m ${seconds}s`;
		return `${seconds}s`;
	}
}

export default new LavalinkCommand();

// Made by Nikhil Under CodeX Devs
