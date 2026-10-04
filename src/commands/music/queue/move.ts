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

class MoveCommand extends Command {
  constructor() {
    super({
      name: 'move',
      description: i18n.cmd('Move a track to a different position in the queue'),
      usage: 'move <from> <to>',
      aliases: ['mv'],
      category: 'music',
      examples: [
        'move 3 1',
        'move 5 2',
        'mv 1 10',
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
          name: 'move',
          description: i18n.cmd('Move a track to a different position in the queue'),
          options: [
            {
              name: 'from',
              description: i18n.cmd('Current position of the track (1-based)'),
              type: 4,
              required: true,
              min_value: 1,
            },
            {
              name: 'to',
              description: 'New position for the track (1-based)',
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
      return this._sendError(context, ctx.t("noTrackPlaying"));
    }

    let fromPos, toPos;
    if (interaction) {
      fromPos = interaction.options.getInteger('from');
      toPos = interaction.options.getInteger('to');
    } else {
      if (args.length < 2) {
        return this._sendUsageError(context);
      }
      fromPos = parseInt(args[0], 10);
      toPos = parseInt(args[1], 10);
    }

    if (isNaN(fromPos) || isNaN(toPos)) {
      return this._sendError(context, i18n.cmd('Both positions must be valid numbers.'));
    }

    const queue = activePlayer.queue.tracks;

    if (!queue || queue.length === 0) {
      return this._sendError(context, i18n.cmd('There are no tracks in the queue to move.'));
    }

    if (fromPos < 1 || fromPos > queue.length || toPos < 1 || toPos > queue.length) {
      return this._sendError(context, i18n.cmd('Positions must be between 1 and {max}.', { max: queue.length }));
    }

    if (fromPos === toPos) {
      return this._sendError(context, i18n.cmd('The track is already at that position.'));
    }

    const track = queue[fromPos - 1];
    queue.splice(fromPos - 1, 1);
    queue.splice(toPos - 1, 0, track);

    const container = this._createSuccessContainer(track, fromPos, toPos, queue.length);
    const sent = await this._reply(context, container);

    if (sent) {
      this._setupCollector(sent, context.author || context.user);
    }
  }

  async slashExecute(ctx: any) {
    return this.execute(ctx);
  }

  _createSuccessContainer(track: any, fromPos: any, toPos: any, queueLength: any) {
    const content = i18n.cmd("Moved [{title}]({uri}) from position **{from}** to **{to}**.", { title: track.info.title, uri: track.info.uri, from: fromPos, to: toPos });
    const container = buildContainer({ image: undefined,
      title: i18n.translateTitle("Track Moved"),
      content: content,
      thumbnail: config.assets.defaultThumbnail || config.assets.defaultTrackArtwork,
      icon: emoji.get("check") || "ℹ️"
    });

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const buttons = new ActionRowBuilder<any>().addComponents(
      new ButtonBuilder()
        .setCustomId('move_back')
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
      new TextDisplayBuilder().setContent(i18n.cmd("{emoji} **{title}**", { emoji: emoji.get('info'), title: i18n.translateTitle("Move Help") }))
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = i18n.cmd("**Reorder tracks in your music queue**\n\n") +
      i18n.cmd("**{emoji} What it does:**", { emoji: emoji.get('check') }) + "\n" +
      i18n.cmd("└─ Moves a track from one position to another") + "\n" +
      i18n.cmd("└─ Other tracks automatically adjust positions") + "\n" +
      i18n.cmd("└─ Queue order is preserved around the moved track") + "\n" +
      i18n.cmd("└─ Currently playing song is unaffected") + "\n\n" +
      i18n.cmd("**{emoji} Command Examples:**", { emoji: emoji.get('folder') }) + "\n" +
      i18n.cmd("└─ `move 5 1` → Move track 5 to the front") + "\n" +
      i18n.cmd("└─ `mv 1 10` → Move first track to position 10") + "\n" +
      i18n.cmd("└─ `move 3 7` → Move track from 3rd to 7th position") + "\n" +
      i18n.cmd("└─ Use `queue` command to see current positions") + "\n\n" +
      `**${emoji.get('add')} Tips:**\n` +
      `└─ Check queue first to find track positions\n` +
      `└─ Moving up: other tracks shift down\n` +
      `└─ Moving down: other tracks shift up\n` +
      `└─ Use \`bump\` to quickly move tracks to top`;

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
        .setCustomId('move_back')
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

        if (interaction.customId === "move_help") {
          await interaction.editReply({
            components: [this._createHelpContainer()],
          });
        } else if (interaction.customId === "move_back") {
          await interaction.editReply({
            components: [this._createHelpContainer()],
          });
        }
      } catch (error) {
        logger.error("MoveCommand", "Collector Error:", error);
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
      logger.debug("MoveCommand", `Message was deleted, cannot disable components. Reason: ${reason}`);
    } else if (error.code === 50001) {
      logger.warn("MoveCommand", `Missing permissions to edit message. Reason: ${reason}`);
    } else {
      logger.error("MoveCommand", `Error disabling components: ${error.message}. Reason: ${reason}`, error);
    }
  }

  _createUsageContainer() {
    return buildError({
      title: i18n.translateTitle("Invalid Usage"),
      issue: i18n.cmd("Please provide both the source and target track positions."),
      tip: i18n.cmd("Example: `/move 5 1` or `.move 3 1` to move a song in the queue.")
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
      logger.error("MoveCommand", "Failed to reply in Move command:", e);
      return null;
    }
  }
}

export default new MoveCommand();

// Made by Nikhil Under CodeX Devs
