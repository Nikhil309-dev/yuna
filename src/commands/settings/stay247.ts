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
import type { Client } from "discord.js";
import { config } from "#config/config";
import emoji from "#config/emoji";
import { db } from "#database/Database";
import { logger } from "#utils/logger";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import phrases from "#utils/phrases";

class Stay247Command extends Command {
  constructor() {
    super({
      name: "247",
      description: "Toggle 24/7 mode to keep the bot connected to a voice channel",
      usage: "247 [on/off]",
      aliases: ["stay247", "alwayson", "keepalive", "24/7"],
      category: "settings",
      examples: [
        "247",
        "247 on",
        "247 off"
      ],
      cooldown: 5,
      access: {
        permissions: [PermissionFlagsBits.ManageMessages],
        botPermissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
      },
      slash: {
        enabled: true,
        data: {
          name: "247",
          description: "Toggle 24/7 mode to keep the bot connected to a voice channel",
          options: [
            {
              name: "action",
              description: "Enable or disable 24/7 mode",
              type: 3,
              required: false,
              choices: [
                {
                  name: "Enable",
                  value: "on"
                },
                {
                  name: "Disable",
                  value: "off"
                }
              ]
            }
          ]
        },
      },
    });
  }

  async execute({ message, args }: any) {
    try {
      const guildId = message.guild.id;
      const current247Settings = db.guild.get247Settings(guildId);
      const action = args[0]?.toLowerCase();

      if (!action) {
        await message.reply({
          components: [this._createStatusContainer(current247Settings, message.guild, message.client)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (["on", "enable", "true", "start"].includes(action)) {
        await message.reply({
          components: [await this._handleEnable247(message, current247Settings)],
          flags: MessageFlags.IsComponentsV2,
        });
      } else if (["off", "disable", "false", "stop"].includes(action)) {
        await message.reply({
          components: [await this._handleDisable247(message, current247Settings)],
          flags: MessageFlags.IsComponentsV2,
        });
      } else {
        await message.reply({
          components: [this._createErrorContainer("Invalid option. Use: `247 on` or `247 off`")],
          flags: MessageFlags.IsComponentsV2,
        });
      }
    } catch (error: any) {
      logger.error("Stay247Command", `Error in prefix command: ${error?.message}`, error);
      await message.reply({
        components: [this._createErrorContainer("An error occurred while changing 24/7 settings.")],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    }
  }

  async slashExecute({ interaction }: any) {
    try {
      const guildId = interaction.guild.id;
      const current247Settings = db.guild.get247Settings(guildId);
      const action = interaction.options.getString("action");

      if (!action) {
        await interaction.reply({
          components: [this._createStatusContainer(current247Settings, interaction.guild, interaction.client)],
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (action === "on") {
        await interaction.reply({
          components: [await this._handleEnable247(interaction, current247Settings)],
          flags: MessageFlags.IsComponentsV2,
        });
      } else if (action === "off") {
        await interaction.reply({
          components: [await this._handleDisable247(interaction, current247Settings)],
          flags: MessageFlags.IsComponentsV2,
        });
      }
    } catch (error: any) {
      logger.error("Stay247Command", `Error in slash command: ${error?.message}`, error);
      const errorPayload = {
        components: [this._createErrorContainer("An error occurred while changing 24/7 settings.")],
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(errorPayload).catch(() => {});
      } else {
        await interaction.reply(errorPayload).catch(() => {});
      }
    }
  }

  _createStatusContainer(settings: any, guild: any, client: Client) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.get('info')} **24/7 Mode Status**`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    let content = `**Current Status:** ${settings.enabled ? `${emoji.get('check')} Enabled` : `${emoji.get('cross')} Disabled`}\n\n`;

    if (settings.enabled) {
      const voiceChannel = settings.voiceChannel ? guild.channels.cache.get(settings.voiceChannel) : null;
      const textChannel = settings.textChannel ? guild.channels.cache.get(settings.textChannel) : null;

      content += `**${emoji.get('folder')} Configuration**\n`;
      content += `├─ **Voice Channel:** ${voiceChannel ? `${voiceChannel.name}` : 'Channel not found'}\n`;
      content += `├─ **Text Channel:** ${textChannel ? `${textChannel.name}` : 'Same as voice channel'}\n`;
      content += `└─ **Auto Disconnect:** ${settings.autoDisconnect ? 'Enabled' : 'Disabled'}\n\n`;
    }

    const player = (client as any).music?.getPlayer(guild.id);
    const connectionStatus = player && player.voiceChannelId
      ? `${emoji.get('check')} Connected to <#${player.voiceChannelId}>`
      : `${emoji.get('cross')} Not connected`;

    content += `**${emoji.get('reset')} Connection Status**\n`;
    content += `└─ ${connectionStatus}`;

    const thumbnailUrl = config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    return container;
  }

  async _handleEnable247(messageOrInteraction: any, current247Settings: any) {
    const guild = messageOrInteraction.guild;
    const member = messageOrInteraction.member;
    const channel = messageOrInteraction.channel;
    const client = messageOrInteraction.client;

    const targetVoiceChannel = member.voice?.channel;
    const targetTextChannel = channel;

    if (!targetVoiceChannel) {
      return this._createErrorContainer("You must be in a voice channel to enable 24/7 mode.");
    }

    const botMember = guild.members.cache.get(client.user.id);
    const voicePerms = targetVoiceChannel.permissionsFor(botMember);

    if (!voicePerms.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
      return this._createErrorContainer(`Missing permissions for ${targetVoiceChannel.name}.\nI need \`Connect\` and \`Speak\` permissions in that voice channel.`);
    }

    const textPerms = targetTextChannel.permissionsFor(botMember);
    if (!textPerms.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      return this._createErrorContainer(`Missing permissions for ${targetTextChannel.name}.\nI need \`View Channel\` and \`Send Messages\` permissions in that text channel.`);
    }

    try {
      db.guild.set247Mode(guild.id, true, targetVoiceChannel.id, targetTextChannel.id);
      logger.info("Stay247Command", `24/7 mode enabled in guild ${guild.id} - Voice: ${targetVoiceChannel.id}, Text: ${targetTextChannel.id}`);

      let player = (client as any).music?.getPlayer(guild.id);
      let connectionStatus = "";

      if (!player || !player.voiceChannelId) {
        try {
          player = await (client as any).music.createPlayer({
            guildId: guild.id,
            textChannelId: targetTextChannel.id,
            voiceChannelId: targetVoiceChannel.id,
            selfMute: false,
            selfDeaf: true,
            volume: db.guild.getDefaultVolume(guild.id),
          });

          if (!player.connected) {
            await player.connect();
          }

          connectionStatus = "Connected to voice channel";
        } catch (connectError) {
          logger.error("Stay247Command", `Failed to connect to voice channel:`, connectError);
          connectionStatus = "Failed to connect - will retry automatically";
        }
      } else if (player.voiceChannelId !== targetVoiceChannel.id) {
        try {
          await player.changeVoiceState({ voiceChannelId: targetVoiceChannel.id });
          connectionStatus = "Moved to new voice channel";
        } catch (moveError) {
          logger.error("Stay247Command", `Failed to move to new voice channel:`, moveError);
          connectionStatus = "Failed to move - will reconnect automatically";
        }
      }

      return this._createSuccessContainer(
        "24/7 Mode Enabled",
        `**${emoji.get('folder')} Configuration**\n` +
        `├─ **Voice Channel:** ${targetVoiceChannel.name}\n` +
        `├─ **Text Channel:** ${targetTextChannel.name}\n` +
        `└─ **Status:** Bot will stay connected even when queue is empty\n\n` +
        `**${emoji.get('check')} Connection:** ${connectionStatus}`
      );
    } catch (error) {
      logger.error("Stay247Command", "Error enabling 24/7 mode:", error);
      return this._createErrorContainer("Failed to enable 24/7 mode. Please try again later.");
    }
  }

  async _handleDisable247(messageOrInteraction: any, current247Settings: any) {
    const guild = messageOrInteraction.guild;
    const guildId = guild.id;

    if (!current247Settings.enabled) {
      return this._createErrorContainer("24/7 mode is already disabled.");
    }

    try {
      db.guild.set247Mode(guildId, false);
      logger.info("Stay247Command", `24/7 mode disabled in guild ${guildId}`);

      return this._createSuccessContainer(
        "24/7 Mode Disabled",
        `**${emoji.get('cross')} Status:** Bot will disconnect when queue is empty\n\n` +
        `Use \`247 on\` to re-enable 24/7 mode`
      );
    } catch (error) {
      logger.error("Stay247Command", "Error disabling 24/7 mode:", error);
      return this._createErrorContainer("Failed to disable 24/7 mode. Please try again later.");
    }
  }

  _createSuccessContainer(title: any, description: any) {
    const note = phrases.get("modeToggled");
    return buildSuccess(`${description}\n\n*${note}*`, title);
  }

  _createErrorContainer(message: string) {
    return buildError(message, "Error");
  }
}

export default new Stay247Command();

// Made by Nikhil Under CodeX Devs
