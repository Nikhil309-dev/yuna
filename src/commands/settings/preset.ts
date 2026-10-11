import { Command, CommandContext } from '#core/Command';
import { db } from '#database/Database';
import {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import emoji from '#config/emoji';
import { config } from '#config/config';
import { buildError, buildSuccess } from '#ui/Theme';
import phrases from '#utils/phrases';
import { i18n } from "#utils/i18n";
import { splitFooter } from "#ui/Formatters";

class PresetCommand extends Command {
  constructor() {
    super({
      name: 'preset',
      description: 'Change your preferred Now Playing style (Card or Text).',
      usage: 'preset <card|text>',
      aliases: ['style', 'npstyle'],
      category: 'settings',
      examples: [
        'preset card',
        'preset text'
      ],
      slash: {
        enabled: true,
        data: {
          name: 'preset',
          description: 'Change your preferred Now Playing style (Card or Text).',
          options: [
            {
              name: 'style',
              description: i18n.cmd('The style to use for Now Playing messages.'),
              type: 3,
              required: true,
              choices: [
                { name: i18n.cmd('Card Style'), value: 'card' },
                { name: i18n.cmd('Text Style'), value: 'text' }
              ]
            }
          ]
        }
      }
    });
  }

  async execute({ message, args }: any) {
    if (!args[0]) {
      return this.sendCurrentStyle(message, message.author.id);
    }
    const style = args[0].toLowerCase();
    await this.setStyle(message, message.author.id, style);
  }

  async slashExecute({ interaction }: any) {
    const rawStyle = interaction.options.getString('style');

    if (!rawStyle) return this.sendCurrentStyle(interaction, interaction.user.id);
    await this.setStyle(interaction, interaction.user.id, rawStyle.toLowerCase());
  }

  async sendCurrentStyle(context: CommandContext, userId: any) {
    const currentStyle = db.getNpStyle(userId);
    const button = new ButtonBuilder()
      .setLabel(i18n.cmd("Support"))
      .setURL(config.links?.supportServer || "https://discord.gg/XYwwyDKhec")
      .setStyle(ButtonStyle.Link);

    const container = new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### ${emoji.get('info') || 'ℹ️'} ${i18n.cmd("Current Player Style")}`)
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(i18n.cmd("Your current Now Playing style is set to: **{style}**\n\nUse `.preset <card|text>` to change it.", {
              style: currentStyle === 'card' ? i18n.cmd("Card Style") : i18n.cmd("Text Style"),
            }))
          )
          .setButtonAccessory(button)
      );

    const payload = { components: [container], flags: MessageFlags.IsComponentsV2 };
    if (context.editReply && (context.deferred || context.replied)) await context.editReply(payload);
    else if (context.reply) await context.reply(payload);
    else await context.channel.send(payload);
  }

  async setStyle(context: CommandContext, userId: any, style: any) {
    if (!['card', 'text'].includes(style)) {
      const errorContainer = buildError(i18n.cmd('Please specify either `card` or `text`.'), i18n.translateTitle('Invalid Style'));
      const payload = { components: [errorContainer], flags: MessageFlags.IsComponentsV2 };
      if (context.editReply && (context.deferred || context.replied)) await context.editReply(payload);
      else if (context.reply) await context.reply(payload);
      else await context.channel.send(payload);
      return;
    }

    db.setNpStyle(userId, style);

    const note = phrases.get("presetUpdated");
    const body = splitFooter(i18n.cmd("Your Now Playing style has been successfully changed to **{style}**.\n\n*{note}*", {
      style: style === 'card' ? i18n.cmd("Card Style") : i18n.cmd("Text Style"),
      note,
    }));
    const successContainer = buildSuccess(
      { message: body.content, footer: body.footer },
      i18n.translateTitle('Style Updated')
    );

    const payload = { components: [successContainer], flags: MessageFlags.IsComponentsV2 };
    if (context.editReply && (context.deferred || context.replied)) await context.editReply(payload);
    else if (context.reply) await context.reply(payload);
    else await context.channel.send(payload);
  }
}

export default new PresetCommand();

// Made by Nikhil Under CodeX Devs
