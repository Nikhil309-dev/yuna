import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import { Command } from '#core/Command';
import { db } from '#database/Database';
import { StatsRepo } from '#database/repos/StatsRepo';
import { buildError } from '#ui/Theme';
import ProfileCard from '#ui/cards/ProfileCard';
import { logger } from '#utils/logger';
import phrases from '#utils/phrases';

const BRAND_FOOTER = 'Built with ♥ under CodeX Development';
const CARD_NAME = 'yuna-profile.png';

type View = 'overview' | 'streaks' | 'tracks' | 'artists' | 'activity';

const VIEW_ORDER: View[] = ['overview', 'streaks', 'tracks', 'artists', 'activity'];

const VIEW_META: Record<View, { label: string; description: string }> = {
  overview: { label: '1 · Overview', description: 'Coins, playtime and totals' },
  streaks: { label: '2 · Streaks', description: 'Current and longest listening streak' },
  tracks: { label: '3 · Top Tracks', description: 'Your 5 most-played tracks' },
  artists: { label: '4 · Top Artists', description: 'Your 5 most-played artists' },
  activity: { label: '5 · Activity', description: 'Today, week, month and year' },
};

interface Target {
  id: string;
  user: any;
  coins: number;
  premium: boolean;
  rank: number | null;
  aggregate: any;
  report: any;
}

class ProfileCommand extends Command {
  constructor() {
    super({
      name: 'profile',
      description: 'View your user profile, coins, and listening stats',
      usage: 'profile [user]',
      aliases: ['me', 'mypremium', 'status'],
      category: 'info',
      cooldown: 3,
      slash: {
        enabled: true,
        autoDefer: true,
        data: {
          name: 'profile',
          description: 'View your user profile, coins, and listening stats',
          options: [
            {
              name: 'user',
              description: 'View another member\'s profile',
              type: 6,
              required: false,
            },
          ],
        },
      },
    });
  }

  async execute(ctx: any) {
    const { message, interaction, args = [] } = ctx;
    const context = interaction || message;
    const author = context.user || context.author;

    let target: any = author;
    if (interaction) {
      target = interaction.options?.getUser('user') || author;
    } else if (message?.mentions?.users?.first()) {
      target = message.mentions.users.first();
    } else if (args[0]) {
      const id = args[0].replace(/\D/g, '');
      target = (id && (await message.client.users.fetch(id).catch(() => null))) || author;
    }

    return this._handle(context, target, author);
  }

  async slashExecute(ctx: any) {
    return this.execute(ctx);
  }

  _collect(user: any, guildId?: string): Target {
    const id = user.id;
    const coins = db.economy ? db.economy.getCoins(id) : 0;
    const premium = db.hasAnyPremium
      ? !!db.hasAnyPremium(id, guildId || '')
      : (db.premium ? !!db.premium.isUserPremium(id) : false);

    let aggregate: any = { total_tracks_played: 0, total_listen_time_ms: 0, current_streak: 0, longest_streak: 0 };
    let report: any = { topTracks: [], topArtists: [], topSources: [], period: {} };
    if (db.stats) {
      const full = db.stats.getFullReport(id, 'all');
      if (full) {
        aggregate = full.aggregate || aggregate;
        report = full;
      }

      const logged = Number(report?.period?.total_duration_ms) || 0;
      aggregate.total_listen_time_ms = Math.max(Number(aggregate.total_listen_time_ms) || 0, logged);
    }

    let rank: number | null = null;
    if (db.economy?.getTopUsers) {
      const board = db.economy.getTopUsers(1000) as any[];
      const idx = board.findIndex((r) => r.user_id === id);
      if (idx >= 0) rank = idx + 1;
    }

    return { id, user, coins, premium, rank, aggregate, report };
  }

  _formatTime(ms: number): string {
    if (!ms || isNaN(ms)) return '0h 0m';
    const mins = Math.floor(ms / 60000);
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  async _handle(context: any, user: any, viewer: any) {
    const guildId = context.guildId || context.guild?.id;
    const target = this._collect(user, guildId);

    let cardBuffer: Buffer | null = null;
    try {
      const generator = new ProfileCard();
      cardBuffer = await generator.createProfileCard(user, {
        coins: target.coins,
        premium: target.premium,
        stats: target.aggregate,
      });
    } catch (err: any) {
      logger.error('ProfileCommand', `Profile card generation failed: ${err.message}`, err);
    }

    const message = await this._reply(context, this._payload('overview', target, cardBuffer));
    if (message && typeof message.createMessageComponentCollector === 'function') {
      this._setupCollector(message, target, viewer, cardBuffer);
    }
    return message;
  }

  _payload(view: View, target: Target, cardBuffer: Buffer | null) {
    const payload: any = {
      components: [this._container(view, target, cardBuffer)],
      flags: MessageFlags.IsComponentsV2,
    };

    if (view === 'overview' && cardBuffer) {
      payload.files = [new AttachmentBuilder(cardBuffer, { name: CARD_NAME })];
    }
    return payload;
  }

  _container(view: View, target: Target, cardBuffer: Buffer | null) {
    const c = new ContainerBuilder();

    const name = target.user.displayName || target.user.username || 'Unknown';
    const badge = target.premium ? '  ·  **Premium**' : '';
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🌸 ${name}${badge}`));

    const handle = `> @${target.user.username || 'unknown'}`;
    try {
      const thumb = target.user.displayAvatarURL?.({ extension: 'png', size: 256, forceStatic: true });
      c.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(handle))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb)),
      );
    } catch {
      c.addTextDisplayComponents(new TextDisplayBuilder().setContent(handle));
    }

    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(this._body(view, target)));

    if (view === 'overview' && cardBuffer) {
      c.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL(`attachment://${CARD_NAME}`),
        ),
      );
    }

    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    c.addActionRowComponents(this._selectRow(view));
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    c.addActionRowComponents(this._buttonRow());
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${BRAND_FOOTER}`));
    return c;
  }

  _body(view: View, t: Target): string {
    const agg = t.aggregate || {};
    switch (view) {
      case 'overview': {
        const rank = t.rank ? `#${t.rank}` : '—';
        return [
          '**Overview**',
          `├─ Coins · ${t.coins.toLocaleString()}`,
          `├─ Tracks Played · ${(agg.total_tracks_played || 0).toLocaleString()}`,
          `├─ Listen Time · ${this._formatTime(agg.total_listen_time_ms || 0)}`,
          `└─ Global Rank · ${rank}`,
        ].join('\n');
      }
      case 'streaks': {
        return [
          '### 🔥 Listening Streaks',
          `**🔥 Current** · ${agg.current_streak || 0} day${(agg.current_streak || 0) === 1 ? '' : 's'}`,
          `**🏅 Longest** · ${agg.longest_streak || 0} day${(agg.longest_streak || 0) === 1 ? '' : 's'}`,
          `**📅 First Listen** · ${agg.first_listen_date || '—'}`,
          `**🕒 Last Listen** · ${agg.last_listen_date || '—'}`,
        ].join('\n');
      }
      case 'tracks': {
        const rows = (t.report?.topTracks || []).slice(0, 5);
        if (!rows.length) return '### 🎵 Top Tracks\n-# No listening history yet — play something to get started!';
        return [
          '### 🎵 Top Tracks',
          ...rows.map((r: any, i: number) =>
            `**${i + 1}.** ${r.title || 'Unknown'} — *${r.artist || 'Unknown'}* · **${r.play_count}** play${r.play_count === 1 ? '' : 's'}`),
        ].join('\n');
      }
      case 'artists': {
        const rows = (t.report?.topArtists || []).slice(0, 5);
        if (!rows.length) return '### 🎤 Top Artists\n-# No listening history yet — play something to get started!';
        return [
          '### 🎤 Top Artists',
          ...rows.map((r: any, i: number) =>
            `**${i + 1}.** ${r.artist || 'Unknown'} · **${r.play_count}** play${r.play_count === 1 ? '' : 's'}`),
        ].join('\n');
      }
      case 'activity': {
        const periods: Array<[string, string]> = [
          ['Today', 'today'], ['This Week', 'week'], ['This Month', 'month'], ['This Year', 'year'],
        ];
        const lines = periods.map(([text, period]) => {
          const since = StatsRepo.getSinceDate(period);
          const s: any = db.stats?.getPeriodStats?.(t.id, since) || {};
          return `**${text}** · ${(s.tracks_played || 0).toLocaleString()} tracks · ${s.unique_artists || 0} artists · ${this._formatTime(s.total_duration_ms || 0)}`;
        });
        return ['### 📈 Activity Breakdown', ...lines].join('\n');
      }
      default:
        return '';
    }
  }

  _selectRow(active: View) {
    const options = VIEW_ORDER.map((v) => {
      const meta = VIEW_META[v];
      return new StringSelectMenuOptionBuilder()
        .setLabel(meta.label)
        .setDescription(meta.description)
        .setValue(v)
        .setDefault(v === active);
    });

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('pf_view')
        .setPlaceholder('Choose a view…')
        .addOptions(options),
    );
  }

  _buttonRow() {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('pf_refresh').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('pf_close').setLabel('Close').setEmoji('✖️').setStyle(ButtonStyle.Danger),
    );
  }

  _setupCollector(message: any, target: Target, viewer: any, cardBuffer: Buffer | null) {
    let current: View = 'overview';

    const collector = message.createMessageComponentCollector({
      time: 300_000,
      filter: (i: any) => typeof i.customId === 'string' && i.customId.startsWith('pf_'),
    });

    collector.on('collect', async (i: any) => {
      if (i.user.id !== viewer.id) {
        return i.reply(this._error(phrases.get('notYourInteraction') || 'This panel is not for you.', 'Not Your Panel')).catch(() => {});
      }
      try {
        if (i.customId === 'pf_close') {
          return i.update({ components: [], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
        if (i.customId === 'pf_view') {
          current = (i.values?.[0] as View) || 'overview';
          return i.update(this._payload(current, target, cardBuffer));
        }
        if (i.customId === 'pf_refresh') {
          return i.update(this._payload(current, target, cardBuffer));
        }
      } catch (err: any) {
        logger.error('ProfileCommand', `Collector error (${i.customId}): ${err.message}`, err);
        if (!i.replied && !i.deferred) {
          i.deferUpdate().catch(() => {});
        }
      }
    });

    collector.on('end', async (_c: any, reason: string) => {
      if (reason === 'messageDelete') return;
      try {
        await message.edit({ components: [], flags: MessageFlags.IsComponentsV2 });
      } catch (error: any) {
        if (error.code !== 10008) logger.error('ProfileCommand', 'Failed to clear profile components on end', error);
      }
    });
  }

  async _reply(context: any, payload: any) {
    const withFetch = { ...payload, fetchReply: true };
    if (context.editReply && (context.deferred || context.replied)) {
      await context.editReply(withFetch);
      return context.fetchReply?.().catch(() => null);
    }
    return context.reply(withFetch);
  }

  _error(message: string, title = 'Something Went Wrong') {

    return { components: [buildError(message, title)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
  }
}

export default new ProfileCommand();

// Made by Nikhil Under CodeX Devs
