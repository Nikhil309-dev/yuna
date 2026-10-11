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
} from 'discord.js';
import { Command } from '#core/Command';
import { db } from '#database/Database';
import { buildError } from '#ui/Theme';
import { logger } from '#utils/logger';
import phrases from '#utils/phrases';

const BRAND_FOOTER = 'Built with ♥ under CodeX Development';
const TIP = 'You earn 5 coins per minute listening to music and 1 coin per command used!';

class CoinsCommand extends Command {
  constructor() {
    super({
      name: 'coins',
      description: 'Check your current coin balance',
      usage: 'coins [user]',
      aliases: ['bal', 'balance'],
      category: 'info',
      slash: {
        enabled: true,
        autoDefer: true,
        data: {
          name: 'coins',
          description: 'Check your current coin balance',
          options: [
            {
              name: 'user',
              description: 'Check another member\'s balance',
              type: 6,
              required: false,
            },
          ],
        },
      },
    });
  }

  async execute(ctx: any) {
    const { message, args = [] } = ctx;
    let target = message.author;
    if (message?.mentions?.users?.first()) {
      target = message.mentions.users.first();
    } else if (args[0]) {
      const id = args[0].replace(/\D/g, '');
      target = (id && (await message.client.users.fetch(id).catch(() => null))) || message.author;
    }
    return this._handle(message, target, message.author);
  }

  async slashExecute({ interaction }: any) {
    const target = interaction.options?.getUser('user') || interaction.user;
    return this._handle(interaction, target, interaction.user);
  }

  async _handle(context: any, target: any, viewer: any) {
    if (!db.economy) {
      return this._reply(context, { components: [buildError('Economy system is currently offline.', 'Economy Offline')], flags: MessageFlags.IsComponentsV2 });
    }
    const payload = { components: [this._container(target)], flags: MessageFlags.IsComponentsV2 };
    const message = await this._reply(context, payload);
    if (message && typeof message.createMessageComponentCollector === 'function') {
      this._setupCollector(message, target, viewer);
    }
    return message;
  }

  _balance(userId: string) {
    return db.economy ? db.economy.getCoins(userId) : 0;
  }

  _rank(userId: string): number | null {
    if (!db.economy?.getTopUsers) return null;
    const board = db.economy.getTopUsers(1000) as any[];
    const idx = board.findIndex((r) => r.user_id === userId);
    return idx >= 0 ? idx + 1 : null;
  }

  _container(target: any) {
    const coins = this._balance(target.id);
    const rank = this._rank(target.id);
    const name = target.displayName || target.username || 'Unknown';

    const c = new ContainerBuilder();
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 💰 Coin Balance`));
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    const handle = `> ${name} · @${target.username || 'unknown'}`;
    try {
      const thumb = target.displayAvatarURL?.({ extension: 'png', size: 256, forceStatic: true });
      c.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(handle))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb)),
      );
    } catch {
      c.addTextDisplayComponents(new TextDisplayBuilder().setContent(handle));
    }

    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      [
        '**_Wallet_**',
        `├─ Coins · **${coins.toLocaleString()}**`,
        `└─ Wealth Rank · ${rank ? `#${rank}` : '—'}`,
        '',
        `-# ${TIP}`,
      ].join('\n'),
    ));

    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    c.addActionRowComponents(this._buttonRow());
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${BRAND_FOOTER}`));
    return c;
  }

  _buttonRow() {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('co_refresh').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('co_close').setLabel('Close').setEmoji('✖️').setStyle(ButtonStyle.Danger),
    );
  }

  _setupCollector(message: any, target: any, viewer: any) {
    const collector = message.createMessageComponentCollector({
      time: 180_000,
      filter: (i: any) => typeof i.customId === 'string' && i.customId.startsWith('co_'),
    });

    collector.on('collect', async (i: any) => {
      if (i.user.id !== viewer.id) {
        return i.reply(this._error(phrases.get('notYourInteraction') || 'This panel is not for you.', 'Not Your Panel')).catch(() => {});
      }
      try {
        if (i.customId === 'co_close') {
          return i.update({ components: [], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
        if (i.customId === 'co_refresh') {
          return i.update({ components: [this._container(target)], flags: MessageFlags.IsComponentsV2 });
        }
      } catch (err: any) {
        logger.error('CoinsCommand', `Collector error (${i.customId}): ${err.message}`, err);
        if (!i.replied && !i.deferred) i.deferUpdate().catch(() => {});
      }
    });

    collector.on('end', async (_c: any, reason: string) => {
      if (reason === 'messageDelete') return;
      try {
        await message.edit({ components: [], flags: MessageFlags.IsComponentsV2 });
      } catch (error: any) {
        if (error.code !== 10008) logger.error('CoinsCommand', 'Failed to clear coins components on end', error);
      }
    });
  }

  _error(message: string, title = 'Something Went Wrong') {
    return { components: [buildError(message, title)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
  }

  async _reply(context: any, payload: any) {
    const withFetch = { ...payload, fetchReply: true };
    if (context.replied || context.deferred) return context.editReply(withFetch);
    if (typeof context.reply === 'function') return context.reply(withFetch);
    return context.channel.send(payload);
  }
}

export default new CoinsCommand();

// Made by Nikhil Under CodeX Devs
