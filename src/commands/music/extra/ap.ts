import { MessageFlags } from "discord.js";
import { config } from "#config/config";
import { Command, CommandContext } from '#core/Command';
import { buildContainer, buildSuccess } from '#ui/Theme';
import { logger } from "#utils/logger";
import phrases from "#utils/phrases";
import { splitFooter } from "#ui/Formatters";
import { i18n } from "#utils/i18n";

class AutoplayCommand extends Command {
  constructor() {
    super({
      name: "autoplay",
      description: "Toggle autoplay mode",
      usage: "autoplay [on|off]",
      aliases: ["ap", "auto"],
      category: "music",
      examples: ["autoplay", "autoplay on", "autoplay off", "ap"],
      cooldown: 3,
      access: {
        voice: false,
      },
      slash: {
        enabled: true,
        autoDefer: true,
        data: {
          name: "autoplay",
          description: "Toggle autoplay mode",
          options: [
            {
              name: "state",
              description: "Turn autoplay on or off",
              type: 3,
              required: false,
              choices: [
                { name: "On", value: "on" },
                { name: "Off", value: "off" },
              ],
            },
          ],
        },
      },
    });
  }

  async execute(ctx: CommandContext) {
    const { client, message, interaction, args = [] } = ctx;
    const context = interaction || message;
    const state = interaction ? interaction.options.getString("state") : args[0]?.toLowerCase();
    return this._handleAutoplay(client, context.guild.id, context, state);
  }

  async slashExecute(ctx: CommandContext) {
    return this.execute(ctx);
  }

  async _handleAutoplay(client: any, guildId: any, context: CommandContext, state: any) {
    const player = client.music?.getPlayer(guildId);
    const currentStatus = player?.get("autoplayEnabled") || false;
    const userId = context.user?.id || context.author?.id;

    let newStatus;
    if (state === "on" || state === "enable" || state === "true") {
      newStatus = true;
    } else if (state === "off" || state === "disable" || state === "false") {
      newStatus = false;
    } else {
      newStatus = !currentStatus;
    }

    if (player) {
      player.set("autoplayEnabled", newStatus);
      player.set("autoplaySetBy", userId);
    }

    const container = this._createAutoplayContainer(newStatus);
    await this._reply(context, container);

    logger.info("AutoplayCommand", `Autoplay toggled to ${newStatus} in ${guildId}`);
  }

  _createAutoplayContainer(isEnabled: any) {
    const apNote = phrases.get("apToggled");
    if (!isEnabled) {
      const { content, footer } = splitFooter(
        i18n.cmd("Autoplay has been turned **off**.\n\n*{note}*", { note: apNote }),
      );
      return buildContainer({
        title: "Autoplay",
        content,
        footer,
        thumbnail: config.assets?.defaultThumbnail,
        icon: "⏹️"
      });
    }

    const on = splitFooter(
      i18n.cmd("Autoplay has been turned **on**. Similar songs will play when the queue ends.\n\n*{note}*", { note: apNote }),
    );
    return buildSuccess({ message: on.content, footer: on.footer }, "Autoplay");
  }

  async _reply(context: CommandContext, container: any) {
    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    };
    try {
      if (context.deferred || context.replied) {
        return await context.editReply!(payload);
      }
      return await context.reply!(payload);
    } catch (e) {
      logger.error("AutoplayCommand", "Failed to reply in Autoplay command:", e);
    }
  }
}

export default new AutoplayCommand();

// Made by Nikhil Under CodeX Devs
