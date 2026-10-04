import { Command, CommandContext } from '#core/Command';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import type { Message } from "discord.js";
import { db } from "#database/Database";
import { config } from "#config/config";
import emoji from "#config/emoji";
import { logger } from "#utils/logger";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import { componentCollectorSource } from "#ui/Components";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";

class SetDefaultVolumeCommand extends Command {
  constructor() {
    super({
      name: "setdefaultvolume",
      description: i18n.cmd("Set the default volume for new music players in this server"),
      usage: "setdefaultvolume [volume]",
      aliases: [ "defaultvolume", "setdefvol"],
      category: "settings",
      examples: [
        "setdefaultvolume 50",
        "setdefaultvolume 100",
        "defaultvolume 25"
      ],
      cooldown: 3,
      access: {
        permissions: [PermissionFlagsBits.ManageMessages],
        botPermissions: [PermissionFlagsBits.SendMessages],
      },
      slash: {
        enabled: true,
        data: {
          name: "setdefaultvolume",
          description: i18n.cmd("Set the default volume for new music players in this server"),
          options: [{
            name: "volume",
            description: i18n.cmd("Volume level (1-100). Leave empty to view current setting."),
            type: 4,
            required: false,
            min_value: 1,
            max_value: 100,
          }],
        },
      },
    });
  }

  async execute({ message, args }: any) {
    const volume = args[0] ? parseInt(args[0]) : null;
    await this._handleCommand(message, volume);
  }

  async slashExecute({ interaction }: any) {
    const volume = interaction.options.getInteger("volume");
    await this._handleCommand(interaction, volume);
  }

  async _handleCommand(ctx: any, volume: any) {
    const isInteraction = !!ctx.user;
    const user = isInteraction ? ctx.user : ctx.author;

    if (!ctx.member.permissions.has(PermissionFlagsBits.Administrator) && !config.ownerIds.includes(user.id)) {
      return this._sendError(ctx, i18n.translateTitle("Permission Denied"), i18n.cmd("Only server administrators can change the default volume setting."));
    }

    if (volume !== null) {
      if (isNaN(volume) || volume < 1 || volume > 100) {
        return this._sendError(ctx, i18n.translateTitle("Invalid Volume"), i18n.cmd("Volume must be a number between 1 and 100."));
      }
      await this._setDefaultVolume(ctx, volume);
    } else {
      await this._showVolumeSettings(ctx);
    }
  }

  async _setDefaultVolume(ctx: any, volume: any) {
    try {
      db.guild.setDefaultVolume(ctx.guild.id, volume);

      const container = this._createSuccessContainer(
        i18n.translateTitle("Default Volume Updated"),
        i18n.cmd("The default volume for new music players has been set to **{volume}%**.\n\nThis will apply to all new music sessions started in this server.", { volume }),
        volume
      );

      const replyOptions = {
        components: [container],
        flags: MessageFlags.IsComponentsV2
      };

      const isInteraction = !!ctx.user;
      if (isInteraction) {
        if (ctx.deferred || ctx.replied) await ctx.editReply(replyOptions);
        else await ctx.reply(replyOptions);
      } else {
        await ctx.channel.send(replyOptions);
      }
    } catch (error) {
      logger.error("SetDefaultVolume", "Error setting default volume:", error);
      return this._sendError(ctx, i18n.translateTitle("Database Error"), i18n.cmd("Failed to update the default volume setting. Please try again."));
    }
  }

  async _showVolumeSettings(ctx: any) {
    try {
      const currentVolume = db.guild.getDefaultVolume(ctx.guild.id);
      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(i18n.cmd("{emoji} **{title}**", { emoji: emoji.get("info"), title: i18n.translateTitle("Default Volume Settings") }))
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const content = i18n.cmd("**{emoji} Current Default Volume:** {volume}%", { emoji: emoji.get("check"), volume: currentVolume }) + "\n\n" +
        i18n.cmd("This volume will be used when new music players are created in this server.") + "\n\n" +
        i18n.cmd("**{emoji} Usage Examples:**", { emoji: emoji.get("folder") }) + "\n" +
        i18n.cmd("├─ `setdefaultvolume 75`") + "\n" +
        i18n.cmd("└─ `/setdefaultvolume volume:75`");

      const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork));

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      );

      const quickVolumeRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('volume_25')
            .setLabel('25%')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('volume_50')
            .setLabel('50%')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('volume_75')
            .setLabel('75%')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('volume_100')
            .setLabel('100%')
            .setStyle(ButtonStyle.Secondary)
        );

      container.addActionRowComponents(quickVolumeRow);

      const isInteraction = !!ctx.user;
      const replyOptions = {
          components: [container],
          fetchReply: true,
          flags: MessageFlags.IsComponentsV2
      };
      let reply;
      if (isInteraction) {
          if (ctx.deferred || ctx.replied) reply = await ctx.editReply(replyOptions);
          else reply = await ctx.reply(replyOptions);
      } else {
          reply = await ctx.channel.send(replyOptions);
      }

      this._setupVolumeCollector(reply, isInteraction ? ctx.user.id : ctx.author.id);
    } catch (error) {
      logger.error("SetDefaultVolume", "Error showing volume settings:", error);
      return this._sendError(ctx, i18n.translateTitle("Database Error"), i18n.cmd("Failed to retrieve volume settings. Please try again."));
    }
  }

  _setupVolumeCollector(message: Message, userId: any) {
    const collector = componentCollectorSource(message).createMessageComponentCollector({
      filter: (i: any) => i.user.id === userId,
      time: 300_000,
    });

    collector.on('collect', async (interaction: any) => {
      if (interaction.customId.startsWith('volume_')) {
        const volume = parseInt(interaction.customId.split('_')[1]);

        try {
          await interaction.deferUpdate();
          db.guild.setDefaultVolume(message.guild!.id, volume);

          const newVolume = db.guild.getDefaultVolume(message.guild!.id);
          const container = this._createSuccessContainer(
            "Default Volume Updated",
            i18n.cmd("The default volume for new music players has been set to **{volume}%**.\n\nThis will apply to all new music sessions started in this server.", { volume: newVolume }),
            newVolume
          );

          await interaction.editReply({
            components: [container]
          });
        } catch (error) {
          logger.error("SetDefaultVolume", "Error updating volume:", error);
          await interaction.followUp({
            content: `${emoji.get("cross")} Failed to update the default volume. Please try again.`,
            ephemeral: true
          });
        }
      }
    });

    collector.on('end', async () => {
      try {
        const fetchedMessage = await message.fetch().catch(() => null);
        if (fetchedMessage && (fetchedMessage.components?.length ?? 0) > 0) {
          await fetchedMessage.edit({
            components: [this._createExpiredContainer()]
          });
        }
      } catch (error: any) {
        if (error?.code !== 10008) {
          logger.error("SetDefaultVolume", "Failed to disable volume components:", error);
        }
      }
    });
  }

  _createSuccessContainer(title: any, description: any, volume: any) {
    const note = phrases.get("volumeUpdated");
    const volumeIndicator = this._getVolumeIndicator(volume);
    const fullDescription = `${description}\n\n${volumeIndicator}\n\n*${note}*`;

    return buildSuccess(fullDescription, title);
  }

  _getVolumeIndicator(volume: any) {
    const barLength = 20;
    const filledBars = Math.round((volume / 100) * barLength);
    const emptyBars = barLength - filledBars;
    const volumeBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);

    let volumeLevel = "";
    if (volume <= 25) volumeLevel = i18n.cmd("{emoji} Low", { emoji: emoji.get("folder") });
    else if (volume <= 50) volumeLevel = i18n.cmd("{emoji} Medium", { emoji: emoji.get("info") });
    else if (volume <= 75) volumeLevel = i18n.cmd("{emoji} High", { emoji: emoji.get("check") });
    else volumeLevel = i18n.cmd("{emoji} Maximum", { emoji: emoji.get("add") });

    return i18n.cmd("**{emoji} Volume Level:** {level}\n`{bar}` {volume}%", { emoji: emoji.get("add"), level: volumeLevel, bar: volumeBar, volume });
  }

  _createExpiredContainer() {
    return buildError(i18n.cmd("Interaction Expired. Run the command again to manage volume settings."), "Interaction Expired");
  }

  async _sendError(ctx: any, title: any, description: any) {
    const container = buildError(description, title);

    const replyOptions = {
      components: [container],
      ephemeral: true,
      flags: MessageFlags.IsComponentsV2
    };

    const isInteraction = !!ctx.user;
    try {
      if (isInteraction) {
        if (ctx.deferred || ctx.replied) {
          await ctx.editReply(replyOptions);
        } else {
          await ctx.reply(replyOptions);
        }
      } else {
        await ctx.channel.send(replyOptions);
      }
    } catch (error) {
      logger.error("SetDefaultVolume", "Failed to send error message:", error);
    }
  }
}

export default new SetDefaultVolumeCommand();

// Made by Nikhil Under CodeX Devs
