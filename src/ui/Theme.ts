import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  ActionRowBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder
} from 'discord.js';
import emoji from '#config/emoji';
import { i18n } from '#utils/i18n.js';

// Discord Components V2 hard limits. Exceeding them throws at build time, so
// every text field is clamped here — this protects EVERY command from a crash
// on unusually long user input (long playlist names, queries, track titles…).
const TEXT_DISPLAY_LIMIT = 4000;

function clampText(value: any, limit = TEXT_DISPLAY_LIMIT): any {
  if (typeof value !== 'string' || value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

// Titles are rendered as `**${title}**`, so callers that pass markdown-wrapped
// titles (`` `### **Heading**` ``) produce broken output like
// `**`### **Heading**`**` — literal asterisks/backticks instead of a heading.
// Strip the wrapping so the title renders cleanly regardless of the caller.
function cleanTitle(value: any): any {
  if (typeof value !== 'string') return value;
  return value
    .replace(/`/g, '')
    .replace(/^\s*#{1,6}\s*/, '')
    .replace(/^\*\*(.*)\*\*$/s, '$1')
    .trim();
}

// Status accents give each card a colored left stripe in Discord's Components
// V2 renderer — the single biggest "looks designed" win, and it's free.
const STATUS_ACCENT = {
  error: 0xED4245,
  success: 0x57F287,
  warning: 0xFEE75C,
  info: 0x5865F2,
  loading: 0x99AAB5
} as const;

export function buildContainer(options: any = {}) {
  const { title, content, thumbnail, image, components, icon, subtitle, accent } = options;
  const container = new ContainerBuilder();

  if (typeof accent === 'number') container.setAccentColor(accent);

  // Titles are authored as English literals in the commands; translate known
  // ones for the active locale (dynamic titles fall through unchanged).
  const localizedTitle = cleanTitle(i18n.translateTitle(title));

  let headerText = `${icon || ''} **${localizedTitle}**`;
  if (subtitle) {
    // Only add the subtitle when it actually differs — several builders used to
    // pass the same string as title and subtitle, rendering it twice.
    const cleanSub = cleanTitle(subtitle);
    if (cleanSub && cleanSub !== localizedTitle) headerText += `\n**${cleanSub}**`;
  }
  headerText = clampText(headerText);
  const safeContent = clampText(content);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(headerText)
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
  );

  if (safeContent && thumbnail) {
    try {
      const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(safeContent))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail));
      container.addSectionComponents(section);
    } catch (_) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(safeContent)
      );
    }
  } else if (safeContent) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(safeContent)
    );
  }

  if (image) {
    const mediaGallery = new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(image)
    );
    container.addMediaGalleryComponents(mediaGallery);
  }

  (components || []).forEach((row: any) => {
    if (row instanceof ActionRowBuilder) {
      container.addActionRowComponents(row);
    }
  });

  return container;
}

/**
 * Shared status-card shell: accent stripe, icon + title header, body, and an
 * optional subtext footer (`-# …`). Keeps every status card visually consistent.
 */
function statusCard({ title, subtitle, accent, icon, body, footer, thumbnail }: any) {
  const container = new ContainerBuilder();
  if (typeof accent === 'number') container.setAccentColor(accent);

  const cleanTitleText = cleanTitle(title);
  let header = `${icon || ''} **${cleanTitleText}**`.trim();
  if (subtitle) {
    const cleanSub = cleanTitle(subtitle);
    if (cleanSub && cleanSub !== cleanTitleText) header += `\n${cleanSub}`;
  }
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(clampText(header)));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  if (body && thumbnail) {
    try {
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(clampText(body)))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail))
      );
    } catch (_) {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(clampText(body)));
    }
  } else if (body) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(clampText(body)));
  }

  if (footer) {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(clampText(`-# ${footer}`)));
  }

  return container;
}

/**
 * Signature Error Card Builder
 * Renders as: `❌ **Title**` / separator / message / optional `-# tip`.
 * Chrome labels ("Issue:", "Action:", box-drawing) are deliberately avoided —
 * they bury the actual reason under noise.
 */
export function buildError(errorInput: any, title: any = undefined, avatarUrl: any = undefined) {
  const crossIcon = emoji.get('cross') || '❌';
  const obj = (typeof errorInput === 'object' && errorInput) ? errorInput : {};

  const cardTitle = title ?? obj.title ?? i18n.tr('ui.error.title');
  const message = typeof errorInput === 'string' ? errorInput : (obj.issue || obj.message || '');
  const tip = obj.tip;

  return statusCard({
    title: cardTitle,
    accent: STATUS_ACCENT.error,
    icon: crossIcon,
    body: message,
    // Only show the tip when it adds something the title/message doesn't already say.
    footer: tip && tip !== cardTitle && tip !== message ? tip : null,
    thumbnail: avatarUrl
  });
}

/**
 * Signature Success Card Builder
 */
export function buildSuccess(successInput: any, title: any = undefined, avatarUrl: any = undefined) {
  const checkIcon = emoji.get('check') || '✅';
  const obj = (typeof successInput === 'object' && successInput) ? successInput : {};

  const cardTitle = title ?? obj.title ?? i18n.tr('ui.success.title');
  const message = typeof successInput === 'string' ? successInput : (obj.message || obj.content || i18n.tr('ui.success.status'));
  const detail = obj.detail;

  return statusCard({
    title: cardTitle,
    accent: STATUS_ACCENT.success,
    icon: checkIcon,
    body: message,
    footer: detail && detail !== message ? detail : null,
    thumbnail: avatarUrl
  });
}

/**
 * Signature Info Card Builder
 */
export function buildInfo(infoInput: any, title: any = undefined, avatarUrl: any = undefined) {
  const infoIcon = emoji.get('info') || 'ℹ️';
  const obj = (typeof infoInput === 'object' && infoInput) ? infoInput : {};

  const cardTitle = title ?? obj.title ?? i18n.tr('ui.info.title');
  const message = typeof infoInput === 'string' ? infoInput : (obj.message || obj.content || i18n.tr('ui.info.title'));

  return statusCard({ title: cardTitle, accent: STATUS_ACCENT.info, icon: infoIcon, body: message, footer: null, thumbnail: avatarUrl });
}

/**
 * Signature Warning Card Builder
 */
export function buildWarning(warningInput: any, title: any = undefined, avatarUrl: any = undefined) {
  const warningIcon = '⚠️';
  const obj = (typeof warningInput === 'object' && warningInput) ? warningInput : {};

  const cardTitle = title ?? obj.title ?? i18n.tr('ui.warning.title');
  const message = typeof warningInput === 'string' ? warningInput : (obj.message || obj.content || i18n.tr('ui.warning.attention'));
  const tip = obj.tip;

  return statusCard({
    title: cardTitle,
    accent: STATUS_ACCENT.warning,
    icon: warningIcon,
    body: message,
    footer: tip && tip !== cardTitle && tip !== message ? tip : null,
    thumbnail: avatarUrl
  });
}

/**
 * Signature Loading Card Builder
 */
export function buildLoading(loadingInput: any, title: any = undefined, avatarUrl: any = undefined) {
  const loadingIcon = emoji.get('loading') || '⏳';
  const obj = (typeof loadingInput === 'object' && loadingInput) ? loadingInput : {};

  const cardTitle = title ?? obj.title ?? i18n.tr('ui.loading.title');
  const message = typeof loadingInput === 'string' ? loadingInput : (obj.message || obj.content || i18n.tr('ui.loading.wait'));

  return statusCard({ title: cardTitle, subtitle: null, accent: STATUS_ACCENT.loading, icon: loadingIcon, body: message, footer: null, thumbnail: avatarUrl });
}

const Theme = {
  buildContainer,
  buildError,
  buildSuccess,
  buildInfo,
  buildWarning,
  buildLoading,
  buildYunaContainer: buildContainer,
  buildYunaError: buildError,
  buildYunaSuccess: buildSuccess
};

export {
  buildContainer as buildYunaContainer,
  buildError as buildYunaError,
  buildSuccess as buildYunaSuccess
};

export default Theme;

// Made by Nikhil Under CodeX Devs
