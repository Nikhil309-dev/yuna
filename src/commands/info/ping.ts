import { Command, CommandContext } from '#core/Command';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import type { Client } from "discord.js";
import emoji from "#config/emoji";
import { PingCard } from "#ui/cards/PingCard";
import { logger } from "#utils/logger";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import { componentCollectorSource } from "#ui/Components";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";

class PingCommand extends Command {
  constructor() {
    super({
      name: "ping",
      description: "Shows visual Yuna network latency card.",
      usage: "ping",
      aliases: ["latency", "lag", "ms"],
      category: "info",
      examples: ["ping", "latency"],
      cooldown: 3,
      slash: {
        enabled: true,
        // This command defers itself to measure API latency accurately, so the
        // shared pipeline must not pre-defer it.
        autoDefer: false,
        data: {
          name: "ping",
          description: "Check visual Yuna latency card",
        },
      },
    });
  }

  async execute({ client, message }: any) {
    try {
      const wsPing = Math.max(0, client.ws.ping || 0);
      const msgLatency = Math.max(1, Date.now() - message.createdTimestamp);
      const { container, attachment } = await this._createPingContainer(client, wsPing, msgLatency);

      const pingMessage = await message.reply({
        components: [container],
        files: [attachment],
        flags: MessageFlags.IsComponentsV2,
      });

      this._setupCollector(pingMessage ?? message, message.author.id, client);
    } catch (error: any) {
      logger.error("PingCommand", `Error in prefix command: ${error.message}`, error);
      await message
        .reply({
          components: [this._createErrorContainer(i18n.cmd("An error occurred while checking ping."))],
          flags: MessageFlags.IsComponentsV2,
        })
        .catch(() => {});
    }
  }

  async slashExecute({ client, interaction }: any) {
    try {
      const wsPing = Math.max(0, client.ws.ping || 0);
      const start = Date.now();
      await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });
      const msgLatency = Math.max(1, Date.now() - start);

      const { container, attachment } = await this._createPingContainer(client, wsPing, msgLatency);

      const pingMessage = await interaction.editReply({
        components: [container],
        files: [attachment],
        flags: MessageFlags.IsComponentsV2,
      });

      this._setupCollector(pingMessage ?? interaction, interaction.user.id, client);
    } catch (error: any) {
      logger.error("PingCommand", `Error in slash command: ${error.message}`, error);
    }
  }

  async _createPingContainer(client: Client, wsPing: any, messageLatency: any) {
    const pingCard = new PingCard({ wsPing, msgLatency: messageLatency });
    const imageBuffer = await pingCard.render();
    const attachment = new AttachmentBuilder(imageBuffer, { name: "yuna-ping.png" });

    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ping_refresh")
        .setLabel("Refresh Diagnostics")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🌸")
    );

    const container = buildContainer({
      title: "Yuna Diagnostics",
      content: `├─ 📡 **WebSocket Ping:** \`${wsPing}ms\`\n` +
        `├─ ⚡ **API Latency:** \`${messageLatency}ms\`\n` +
        `└─ 🌸 **Status:** Audio & Recommendation Engine Operational`,
      image: "attachment://yuna-ping.png",
      components: [buttonRow],
      icon: "🌸"
    });

    return { container, attachment };
  }

  _createErrorContainer(msg: any) {
    return buildError(msg);
  }

  _setupCollector(source: any, userId: any, client: Client) {
    const collectorTarget = componentCollectorSource(source);
    // Slash replies can resolve to an interaction (whose collector lives on
    // `interaction.response`); guard so a missing collector never crashes the
    // command after an otherwise successful reply.
    if (typeof collectorTarget?.createMessageComponentCollector !== "function") return;

    const collector = collectorTarget.createMessageComponentCollector({
      filter: (i: any) => i.user.id === userId,
      time: 120_000,
    });

    collector.on("collect", async (interaction: any) => {
      try {
        if (interaction.customId === "ping_refresh") {
          const wsPing = Math.max(0, client.ws.ping || 0);
          const { container, attachment } = await this._createPingContainer(client, wsPing, 12);

          await interaction.update({
            components: [container],
            files: [attachment],
            flags: MessageFlags.IsComponentsV2,
          });
        }
      } catch (error: any) {
        logger.error("PingCommand", `Error in collector interaction: ${error.message}`, error);
      }
    });
  }
}

export default new PingCommand();

// Made by Nikhil Under CodeX Devs
