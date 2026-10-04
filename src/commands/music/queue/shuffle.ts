import {
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder
} from "discord.js";

import { config } from '#config/config';
import { Command } from '#core/Command';
import { buildContainer, buildError, buildSuccess } from '#ui/Theme';
import { componentCollectorSource } from '#ui/Components';
import { logger } from '#utils/logger';
import emoji from '#config/emoji';
import phrases from '#utils/phrases';
import { PlayerManager } from '#audio/PlayerManager';
import { i18n } from "#utils/i18n";

class ShuffleCommand extends Command {
  constructor() {
    super({
      name: 'shuffle',
      description: 'Shuffle the entire queue to randomize track order',
      usage: 'shuffle',
      aliases: ['shu', 'sh', 'shuf', 'mix'],
      category: 'music',
      examples: [
        'shuffle',
        'shu',
        'mix',
        'shuf',
      ],
      cooldown: 3,
      access: {
        voice: true,
        sameVoice: true,
        player: true,
      },
      slash: {
        enabled: true,
        autoDefer: true,
        data: {
          name: 'shuffle',
          description: 'Shuffle the entire queue to randomize track order',
        },
      },
    });
  }

  async execute(ctx: any) {
    const { client, message, interaction, player, pm, args = [] } = ctx;
    const context = interaction || message;
    const activePm = pm || (player ? new PlayerManager(player) : (client?.music?.getPlayer(context.guildId || context.guild?.id) ? new PlayerManager(client.music.getPlayer(context.guildId || context.guild?.id)) : null));
    if (!activePm) return;
    return this._handleShuffle(context, activePm);
  }

  async slashExecute(ctx: any) {
    return this.execute(ctx);
  }

  async _handleShuffle(context: any, pm: any) {
    if (pm.queueSize < 1) {
      return this._reply(context, this._createErrorContainer(i18n.cmd("There are no tracks in the queue to shuffle.")));
    }

    await pm.shuffleQueue();

    const container = this._createSuccessContainer(pm);
    const message = await this._reply(context, container);

    if (message) {
      this._setupCollector(message, context.author || context.user);
    }
  }

  _createHelpContainer() {
    const content =
      `**Shuffle Help**\n\n` +
      `└─ **Shuffle:** Randomizes the order of all upcoming songs in your queue.\n` +
      `└─ **Preserves:** The currently playing song remains active without interruption.\n\n` +
      `*Use the buttons below to reshuffle or return.*`;

    const buttons = new ActionRowBuilder<any>().addComponents(
      new ButtonBuilder()
        .setCustomId('shuffle_again')
        .setLabel(i18n.cmd('Shuffle Again'))
        .setStyle(ButtonStyle.Primary)
        .setEmoji(emoji.get('shuffle') || "🔀"),
      new ButtonBuilder()
        .setCustomId('shuffle_back')
        .setLabel(i18n.cmd('Back'))
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get('reset') || "↩️")
    );

    return buildContainer({ image: undefined,
      title: i18n.translateTitle("Shuffle Guide"),
      content,
      components: [buttons],
      icon: emoji.get('info') || "ℹ️"
    });
  }

  _createSuccessContainer(pm: any) {
    const shuffleNote = phrases.get("shuffleSuccess");
    const content = `${emoji.get("check") || "✨"} **${shuffleNote}**\n\n` +
      i18n.cmd("└─ **{emoji} Tracks in Queue:** {count}", { emoji: emoji.get("folder") || "📁", count: pm.queueSize }) + "\n" +
      i18n.cmd("└─ **{emoji} Now Playing:** {title}", {
        emoji: emoji.get("music") || "🎵",
        title: pm.currentTrack?.info?.title || i18n.cmd("None"),
      });

    const container = buildContainer({ image: undefined,
      title: i18n.translateTitle("Queue Shuffled"),
      content: content,
      thumbnail: config.assets.defaultThumbnail || config.assets.defaultTrackArtwork,
      icon: emoji.get("music") || "ℹ️"
    });

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const buttons = new ActionRowBuilder<any>().addComponents(
      new ButtonBuilder()
        .setCustomId('shuffle_again')
        .setLabel(i18n.cmd('Shuffle Again'))
        .setStyle(ButtonStyle.Primary)
        .setEmoji(emoji.get('shuffle') || "🔀"),
      new ButtonBuilder()
        .setCustomId('shuffle_help')
        .setLabel(i18n.cmd('Help'))
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get('info') || "ℹ️")
    );

    container.addActionRowComponents(buttons);
    return container;
  }

  _createErrorContainer(message: string) {
    return buildError(message);
  }

  _setupCollector(message: any, author: any) {
    const filter = (i: any) => i.user.id === author.id;
    const collector = componentCollectorSource(message).createMessageComponentCollector({
      filter,
      time: 300_000,
    });

    collector.on("collect", async (interaction: any) => {
      try {
        await interaction.deferUpdate();

        if (interaction.customId === "shuffle_again") {
          const player = interaction.client.music?.getPlayer(interaction.guild.id);
          if (!player) {
            await interaction.editReply({
              components: [this._createErrorContainer(i18n.cmd('Queue is empty or player unavailable.'))],
            });
            return;
          }
          const currentPm = new PlayerManager(player);
          if (currentPm.queueSize < 1) {
            await interaction.editReply({
              components: [this._createErrorContainer(i18n.cmd('Queue is empty or player unavailable.'))],
            });
            return;
          }

          await currentPm.shuffleQueue();
          const updatedContainer = this._createSuccessContainer(currentPm);
          await interaction.editReply({ components: [updatedContainer] });
        } else if (interaction.customId === "shuffle_help") {
          await interaction.editReply({
            components: [this._createHelpContainer()],
          });
        } else if (interaction.customId === "shuffle_back") {
          const player = interaction.client.music?.getPlayer(interaction.guild.id);
          if (player) {
            const currentPm = new PlayerManager(player);
            const container = this._createSuccessContainer(currentPm);
            await interaction.editReply({ components: [container] });
          }
        }
      } catch (error) {
        logger.error("ShuffleCommand", "Collector Error:", error);
      }
    });

    collector.on("end", async (collected: any,  reason: any) => {
      if (reason === "limit" || reason === "messageDelete") return;

      try {
        const currentMessage = await this._fetchMessage(message).catch(() => null);

        if (!currentMessage?.components?.length) {
          return;
        }

        const containerWithoutButtons = new ContainerBuilder();

        currentMessage.components.forEach((component: any) => {
          if (component.type !== ComponentType.ActionRow) {
            if (component.type === ComponentType.TextDisplay) {
              containerWithoutButtons.addTextDisplayComponents(component);
            } else if (component.type === ComponentType.Separator) {
              containerWithoutButtons.addSeparatorComponents(component);
            } else if (component.type === ComponentType.Section) {
              containerWithoutButtons.addSectionComponents(component);
            }
          }
        });

        await currentMessage.edit({
          components: [containerWithoutButtons],
          flags: MessageFlags.IsComponentsV2,
        });
      } catch (error) {
        this._handleDisableError(error, reason);
      }
    });
  }

  async _fetchMessage(messageOrInteraction: any) {
    if (messageOrInteraction.fetchReply) {
      return await messageOrInteraction.fetchReply();
    } else if (messageOrInteraction.fetch) {
      return await messageOrInteraction.fetch();
    } else {
      return messageOrInteraction;
    }
  }

  _handleDisableError(error: any, reason: any) {
    if (error.code === 10008) {
      logger.debug("ShuffleCommand", `Message was deleted, cannot disable components. Reason: ${reason}`);
    } else if (error.code === 50001) {
      logger.warn("ShuffleCommand", `Missing permissions to edit message. Reason: ${reason}`);
    } else {
      logger.error("ShuffleCommand", `Error disabling components: ${error.message}. Reason: ${reason}`, error);
    }
  }

  async _reply(context: any, container: any) {
    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      fetchReply: true
    };
    try {
      if (context.editReply && (context.deferred || context.replied)) {
        return await context.editReply(payload);
      }
      return await (context.deferred || context.replied ? context.editReply.bind(context) : context.reply.bind(context))(payload);
    } catch(e) {
      logger.error("ShuffleCommand", "Failed to reply in Shuffle command:", e);
      return null;
    }
  }
}

export default new ShuffleCommand();

// Made by Nikhil Under CodeX Devs
