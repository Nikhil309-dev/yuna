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

class RemoveCommand extends Command {
  constructor() {
    super({
      name: 'remove',
      description: i18n.cmd('Remove a track from the queue'),
      usage: 'remove <position>',
      aliases: ['rm', 'del'],
      category: 'music',
      examples: [
        'remove 3',
        'rm 1',
        'del 5',
      ],
      cooldown: 3,
      access: {
        voice: true,
        sameVoice: true,
        player: true,
        playing: true,
      },
      slash: {
        enabled: true,
        autoDefer: true,
        data: {
          name: 'remove',
          description: i18n.cmd('Remove a track from the queue'),
          options: [
            {
              name: 'position',
              description: i18n.cmd('Position of the track to remove (1-based)'),
              type: 4,
              required: true,
              min_value: 1,
            },
          ],
        },
      },
    });
  }

  async execute(ctx: any) {
    const { client, message, interaction, player, pm, args = [] } = ctx;
    const context = interaction || message;
    const activePm = pm || (player ? new PlayerManager(player) : (client?.music?.getPlayer(context.guildId || context.guild?.id) ? new PlayerManager(client.music.getPlayer(context.guildId || context.guild?.id)) : null));
    const activePlayer = activePm?.player || player;

    if (!activePlayer || !activePlayer.queue.current) {
      return this._sendError(context, ctx.t('noTrackPlaying'));
    }

    let position;
    if (interaction) {
      position = interaction.options.getInteger('position');
    } else {
      if (args.length === 0) {
        return this._sendUsageError(context);
      }
      position = parseInt(args[0], 10);
    }

    if (isNaN(position)) {
      return this._sendError(context, i18n.cmd('Position must be a valid number.'));
    }

    const queue = activePlayer.queue.tracks;

    if (!queue || queue.length === 0) {
      return this._sendError(context, i18n.cmd('There are no tracks in the queue to remove.'));
    }

    if (position < 1 || position > queue.length) {
      return this._sendError(context, i18n.cmd('Position must be between 1 and {max}.', { max: queue.length }));
    }

    const track = queue[position - 1];
    queue.splice(position - 1, 1);

    const container = this._createSuccessContainer(track, position, queue.length);
    const sent = await this._reply(context, container);

    if (sent) {
      this._setupCollector(sent, context.author || context.user);
    }
  }

  async slashExecute(ctx: any) {
    return this.execute(ctx);
  }

  _createSuccessContainer(track: any, position: any, remainingCount: any) {
    const content = i18n.cmd("Removed [{title}]({uri}) from position **{position}**.", { title: track.info.title, uri: track.info.uri, position });
    const container = buildContainer({ image: undefined,
      title: i18n.translateTitle("Track Removed"),
      content: content,
      thumbnail: config.assets.defaultThumbnail || config.assets.defaultTrackArtwork,
      icon: emoji.get("check") || "ℹ️"
    });

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const buttons = new ActionRowBuilder<any>().addComponents(
      new ButtonBuilder()
        .setCustomId('remove_back')
        .setLabel(i18n.cmd('Back'))
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get('reset'))
    );

    container.addActionRowComponents(buttons);
    return container;
  }

  _createHelpContainer() {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(i18n.cmd("{emoji} **{title}**", { emoji: emoji.get('info'), title: i18n.translateTitle("Remove Help") }))
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = i18n.cmd(
      "**Remove tracks from your music queue**\n\n" +
      "**{check} What it does:**\n" +
      "└─ Permanently removes a track from the queue\n" +
      "└─ Other tracks move up to fill the gap\n" +
      "└─ Queue positions automatically adjust\n" +
      "└─ Currently playing song is unaffected\n\n" +
      "**{folder} Command Examples:**\n" +
      "└─ `remove 1` → Remove first queued track\n" +
      "└─ `rm 3` → Remove track at position 3\n" +
      "└─ `del 10` → Remove track at position 10\n" +
      "└─ Use `queue` command to see positions\n\n" +
      "**{add} Tips:**\n" +
      "└─ Check queue first to find track positions\n" +
      "└─ Positions change after each removal\n" +
      "└─ Cannot remove currently playing track\n" +
      "└─ Use `clear` to remove all tracks",
      { check: emoji.get('check'), folder: emoji.get('folder'), add: emoji.get('add') }
    );

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(config.assets.defaultThumbnail || config.assets.defaultTrackArtwork)
      );

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const buttons = new ActionRowBuilder<any>().addComponents(
      new ButtonBuilder()
        .setCustomId('remove_back')
        .setLabel(i18n.cmd('Back'))
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get('reset'))
    );

    container.addActionRowComponents(buttons);
    return container;
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

        if (interaction.customId === "remove_help") {
          await interaction.editReply({
            components: [this._createHelpContainer()],
          });
        } else if (interaction.customId === "remove_back") {
          await interaction.editReply({
            components: [this._createUsageContainer()],
          });
        }
      } catch (error) {
        logger.error("RemoveCommand", "Collector Error:", error);
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
      logger.debug("RemoveCommand", `Message was deleted, cannot disable components. Reason: ${reason}`);
    } else if (error.code === 50001) {
      logger.warn("RemoveCommand", `Missing permissions to edit message. Reason: ${reason}`);
    } else {
      logger.error("RemoveCommand", `Error disabling components: ${error.message}. Reason: ${reason}`, error);
    }
  }

  _createUsageContainer() {
    return buildError({
      title: i18n.translateTitle("Invalid Usage"),
      issue: i18n.cmd("Please provide the track position number to remove from the queue."),
      tip: i18n.cmd("Example: `/remove 3` or `.remove 1`")
    });
  }

  async _sendUsageError(context: any) {
    const container = this._createUsageContainer();
    const sent = await this._reply(context, container);

    if (sent) {
      this._setupCollector(sent, context.author || context.user);
    }
    return sent;
  }

  _sendError(context: any, message: any) {
    const container = buildError(message);
    return this._reply(context, container);
  }

  _formatDuration(ms: number) {
    if (!ms || ms === 0) return '0:00';
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
      logger.error("RemoveCommand", "Failed to reply in Remove command:", e);
      return null;
    }
  }
}

export default new RemoveCommand();

// Made by Nikhil Under CodeX Devs
