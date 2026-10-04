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
import os from "os";
import { config } from "#config/config";
import { Command } from "#core/Command";
import emoji from "#config/emoji";
import { logger } from "#utils/logger";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import { componentCollectorSource } from "#ui/Components";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";

class DevStatsCommand extends Command {
	constructor() {
		super({
			name: "devstats",
			description: "Comprehensive system, process health, memory, and performance dashboard (Developer Only)",
			usage: "devstats",
			aliases: ["system", "sysinfo", "health"],
			category: "developer",
			access: { ownerOnly: true },
		});
	}

	async execute({ client, message }: any) {
		try {
			const container = this._createHealthDashboardContainer(client);
			const msgInstance = await message.reply({
				components: [container],
				flags: MessageFlags.IsComponentsV2,
			});

			this._setupCollector(msgInstance, message.author.id, client);
		} catch (error: any) {
			logger.error("DevStatsCommand", "Error in devstats command", error);
			await message.reply({
				components: [buildError("An error occurred.")],
				flags: MessageFlags.IsComponentsV2,
			}).catch(() => {});
		}
	}

	_createHealthDashboardContainer(client: YunaClient) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`### 📊 **Bot System & Process Health Dashboard**`),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
		);

		const memUsage = process.memoryUsage();
		const heapUsedMb = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
		const heapTotalMb = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
		const rssMb = (memUsage.rss / 1024 / 1024).toFixed(2);
		const externalMb = (memUsage.external / 1024 / 1024).toFixed(2);

		const totalMemGb = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
		const freeMemGb = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
		const usedMemGb = (parseFloat(totalMemGb) - parseFloat(freeMemGb)).toFixed(2);
		const cpus = os.cpus();
		const cpuModel = cpus[0]?.model ? cpus[0].model.trim() : "Generic CPU";
		const cpuCores = cpus.length;
		const osUptime = this._formatUptime(os.uptime() * 1000);
		const processUptime = this._formatUptime(process.uptime() * 1000);

		const players = client.music?.lavalink?.players?.size || 0;
		let playingCount = 0;
		if (client.music?.lavalink?.players) {
			client.music?.lavalink?.players.forEach((p) => {
				if (p.playing) playingCount++;
			});
		}

		const guildCount = client.guilds.cache.size;
		const userCount = client.users.cache.size;
		const ping = client.ws.ping;

		const processSectionContent =
			i18n.cmd("**Process & Memory Metrics**\n") +
			i18n.cmd("├─ **Heap Used:** {used} MB / {total} MB\n", { used: heapUsedMb, total: heapTotalMb }) +
			i18n.cmd("├─ **RSS Memory:** {value} MB\n", { value: rssMb }) +
			i18n.cmd("├─ **External Memory:** {value} MB\n", { value: externalMb }) +
			i18n.cmd("├─ **Process Uptime:** {uptime}\n", { uptime: processUptime }) +
			i18n.cmd("└─ **Node Version:** {version}\n\n", { version: process.version }) +
			i18n.cmd("**OS Host Metrics**\n") +
			i18n.cmd("├─ **Host Memory:** {used} GB used / {total} GB total ({free} GB free)\n", { used: usedMemGb, total: totalMemGb, free: freeMemGb }) +
			i18n.cmd("├─ **CPU Cores:** {cores} × `{model}`\n", { cores: cpuCores, model: cpuModel.substring(0, 30) }) +
			i18n.cmd("├─ **OS Platform:** `{platform}`\n", { platform: `${os.type()} ${os.arch()}` }) +
			i18n.cmd("└─ **Host Uptime:** {uptime}\n\n", { uptime: osUptime }) +
			i18n.cmd("**Discord & Music Engine**\n") +
			i18n.cmd("├─ **WebSocket Ping:** {ping}ms\n", { ping }) +
			i18n.cmd("├─ **Guilds / Users:** {guilds} servers / {users} users\n", { guilds: guildCount, users: userCount }) +
			i18n.cmd("├─ **Active Players:** {playing} playing / {total} total\n", { playing: playingCount, total: players }) +
			i18n.cmd("└─ **Environment:** {env}", { env: process.env.NODE_ENV || "production" });

		const section = new SectionBuilder()
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(processSectionContent),
			)
			.setThumbnailAccessory(
				new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork),
			);

		container.addSectionComponents(section);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
		);

		const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder()
				.setCustomId("sys_refresh")
				.setLabel("Refresh Dashboard")
				.setStyle(ButtonStyle.Primary),
			new ButtonBuilder()
				.setCustomId("sys_gc")
				.setLabel("Run GC (Garbage Collection)")
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
				if (interaction.customId === "sys_refresh") {
					const updatedContainer = this._createHealthDashboardContainer(client);
					await interaction.update({
						components: [updatedContainer],
						flags: MessageFlags.IsComponentsV2,
					});
				} else if (interaction.customId === "sys_gc") {
					await interaction.deferUpdate();
					if (global.gc) {
						global.gc();
					}
					const updatedContainer = this._createHealthDashboardContainer(client);
					await interaction.editReply({
						components: [updatedContainer],
						flags: MessageFlags.IsComponentsV2,
					});
				}
			} catch (error: any) {
				logger.error("DevStatsCommand", "Error in collector interaction", error);
			}
		});
	}

	_createErrorContainer(msg: string) {
		const container = new ContainerBuilder();
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(i18n.cmd("### {emoji} **{title}**", { emoji: emoji.get("cross"), title: i18n.translateTitle("System Dashboard Error") })),
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

export default new DevStatsCommand();

// Made by Nikhil Under CodeX Devs
