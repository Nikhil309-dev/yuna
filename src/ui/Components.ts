import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder
} from 'discord.js';
import { formatDuration } from './Formatters';
import { i18n } from '#utils/i18n.js';
import { localeFor, runWithLocale } from '#utils/locale.js';

// Button/select text is localized through `i18n.tr`, which reads the locale of
// the current request context (user → guild → en-US).
const tr = (key: string, replacements?: Record<string, any>) => i18n.tr(key, replacements);

/**
 * Runs a collector listener inside the locale scope of the user/guild that
 * created it.
 *
 * Discord.js collector callbacks fire from the gateway event loop, which is
 * detached from the command's async context. Without this re-binding, every
 * `i18n.tr()` / `translateTitle()` inside a collector would silently fall back
 * to en-US regardless of the user's chosen language.
 */
export function withLocaleCollector<T>(collector: T, userId?: string | null, guildId?: string | null): T {
  if (!collector || typeof (collector as any).on !== 'function') return collector;
  const locale = localeFor(userId, guildId);
  for (const event of ['on', 'once'] as const) {
    const original = (collector as any)[event].bind(collector);
    (collector as any)[event] = (name: string, handler: any) => {
      if (typeof handler !== 'function') return original(name, handler);
      return original(name, (...args: any[]) => runWithLocale(locale, () => handler(...args)));
    };
  }
  return collector;
}

/**
 * Resolves the object a message-component collector can be created from.
 *
 * Slash-command interactions do NOT expose `createMessageComponentCollector`
 * directly (only `interaction.response` does), while plain messages do. Callers
 * frequently pass either one, so route collectors through this helper to keep
 * buttons working from both slash commands and prefix commands.
 *
 * The collector it produces is additionally bound to the caller's locale so
 * localized strings keep working inside the collector callbacks.
 */
export function componentCollectorSource(messageOrInteraction: any): any {
  const target = messageOrInteraction;
  if (!target) return target;

  let collectorTarget = target;
  if (typeof collectorTarget.createMessageComponentCollector !== 'function') {
    if (target.response && typeof target.response.createMessageComponentCollector === 'function') {
      collectorTarget = target.response;
    } else {
      return target;
    }
  }

  const userId = target.user?.id ?? target.author?.id ?? target.member?.id ?? null;
  const guildId = target.guildId ?? target.guild?.id ?? null;
  if (!collectorTarget.__localeBound && (userId || guildId)) {
    const original = collectorTarget.createMessageComponentCollector.bind(collectorTarget);
    const bound = (options: any) => withLocaleCollector(original(options), userId, guildId);
    Object.defineProperty(collectorTarget, 'createMessageComponentCollector', {
      value: bound,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(collectorTarget, '__localeBound', { value: true, configurable: true });
  }

  return collectorTarget;
}

export function createPlayerControls(options: any = {}) {
  const { mode = 'default' } = options;

  if (mode === 'playback') {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('yuna:music:rewind10').setLabel('-10s').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('yuna:music:rewind5').setLabel('-5s').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('yuna:music:forward5').setLabel('+5s').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('yuna:music:forward10').setLabel('+10s').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('yuna:music:replay').setLabel(tr('btn.replay')).setStyle(ButtonStyle.Primary)
    );
  }

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('yuna:music:previous').setLabel(tr('btn.previous')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('yuna:music:pause').setLabel(tr('btn.pause')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('yuna:music:skip').setLabel(tr('btn.skip')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('yuna:music:stop').setLabel(tr('btn.stop')).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('yuna:music:like').setLabel(tr('btn.like')).setStyle(ButtonStyle.Success)
  );
}

export function createPaginationRow(currentPage: any, totalPages: any, prefix: any = 'page') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`yuna:${prefix}:first`)
      .setLabel(tr('btn.first'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 1),
    new ButtonBuilder()
      .setCustomId(`yuna:${prefix}:prev`)
      .setLabel(tr('btn.prev'))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === 1),
    new ButtonBuilder()
      .setCustomId(`yuna:${prefix}:current`)
      .setLabel(`${currentPage} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`yuna:${prefix}:next`)
      .setLabel(tr('btn.next'))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === totalPages),
    new ButtonBuilder()
      .setCustomId(`yuna:${prefix}:last`)
      .setLabel(tr('btn.last'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === totalPages)
  );
}

export function createConfirmRow(confirmId = 'yuna:confirm:yes', cancelId = 'yuna:confirm:no') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmId)
      .setLabel(tr('btn.confirm'))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(cancelId)
      .setLabel(tr('btn.cancel'))
      .setStyle(ButtonStyle.Danger)
  );
}

export function createFilterSelect(presets: any = []) {
  if (presets.length === 0) {
    // Values must map to real FilterEngine presets (`filter_<preset>`) or the
    // special `filter_reset`, otherwise applying them fails at runtime.
    presets = [
      { label: 'Reset Filters', description: 'Clear all active audio filters', value: 'filter_reset' },
      { label: 'Bassboost', description: 'Enhanced bass profile', value: 'filter_bassboost' },
      { label: 'Deep Bass', description: 'Heavy sub-bass profile', value: 'filter_deepbass' },
      { label: 'Nightcore', description: 'Faster pitch & tempo', value: 'filter_nightcore' },
      { label: 'Vaporwave', description: 'Slow & relaxed retro vibe', value: 'filter_vaporwave' },
      { label: 'Pop EQ', description: 'Vocal & pop acoustics', value: 'filter_pop' },
      { label: 'Rock EQ', description: 'Rock & heavy instruments', value: 'filter_rock' },
      { label: 'Treble Boost', description: 'Crisp high frequencies', value: 'filter_treble' }
    ];
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId('yuna:music:filter')
    .setPlaceholder(tr('sel.filter.placeholder'));

  presets.forEach((preset: any) => {
    menu.addOptions({
      label: preset.label,
      description: preset.description,
      value: preset.value
    });
  });

  return new ActionRowBuilder().addComponents(menu);
}

export function createFeatureSelect() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('yuna:music:feature')
    .setPlaceholder(tr('sel.feature.placeholder'))
    .addOptions(
      { label: 'Default Controls', description: 'Prev / Pause / Skip / Stop / Like', value: 'mode_default' },
      { label: 'Playback Controls', description: 'Seek / Rewind / Forward / Replay', value: 'mode_playback' },
      { label: 'Audio Filters', description: 'Apply audio filters & EQ presets', value: 'mode_filters' }
    );

  return new ActionRowBuilder().addComponents(menu);
}

export function createPlayerContainer(mode: any = 'default', options: any = {}) {
  const { isTextMode = false, track = null, hasImage = false } = options;
  const container = new ContainerBuilder();

  // Show the music card image if attachment is included
  if (!isTextMode && hasImage) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://yuna-nowplaying.png')
      )
    );
  }

  if (isTextMode && track && track.info) {
    const duration = track.info.duration || 0;
    const position = options.position || 0;
    let progressBar = '';

    if (duration > 0 && !track.info.isStream) {
      const length = 15;
      const index = Math.max(0, Math.min(length, Math.round((position / duration) * length)));
      progressBar = `\n\n\`${formatDuration(position)}\` [${'▬'.repeat(index)}🔘${'▬'.repeat(length - index)}] \`${formatDuration(duration)}\``;
    } else if (track.info.isStream) {
      progressBar = `\n\n\`LIVE\` [🔘▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬]`;
    }

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### 🎵 Now Playing: **${track.info.title}**\nby **${track.info.author}**${progressBar}`)
    );
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  }

  // Add the appropriate control row based on mode
  if (mode === 'filters') {
    // Show filter presets dropdown
    const filterRow = createFilterSelect();
    container.addActionRowComponents(filterRow as any);
  } else {
    // Show the button controls (default or playback mode)
    const controlsRow = createPlayerControls({ mode });
    container.addActionRowComponents(controlsRow as any);
  }

  // Add the feature mode select dropdown (switch between default/playback/filters)
  const featureRow = createFeatureSelect();
  container.addActionRowComponents(featureRow as any);

  return container;
}

const Components = {
  createPlayerControls,
  createPaginationRow,
  createConfirmRow,
  createFilterSelect,
  createFeatureSelect,
  createPlayerContainer
};

export default Components;

// Made by Nikhil Under CodeX Devs

