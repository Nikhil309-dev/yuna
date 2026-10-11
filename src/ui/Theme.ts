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
 * Signature Boxed Error Card Builder
 * Chrome labels are localized; callers pass already-translated content/titles.
 */
export function buildError(errorInput: any, title: any = undefined, avatarUrl: any = undefined) {
  const infoIcon = emoji.get('info') || 'ℹ️';
  const resetIcon = emoji.get('reset') || '🔄';
  const crossIcon = emoji.get('cross') || '❌';

  const cardTitle = title ?? i18n.tr('ui.error.title');
  const issueLabel = i18n.tr('ui.error.issue');
  const actionLabel = i18n.tr('ui.error.action');

  const issueText = typeof errorInput === 'string' ? errorInput : (errorInput.issue || errorInput.message || i18n.tr('ui.error.title'));
  const actionText = typeof errorInput === 'object' && errorInput.tip ? errorInput.tip : i18n.tr('ui.error.contact');
  const subtitle = typeof errorInput === 'object' && errorInput.title ? errorInput.title : null;

  const body = `┌─ **${infoIcon} ${issueLabel}:** ${issueText}\n└─ **${resetIcon} ${actionLabel}:** ${actionText}`;

  return statusCard({ title: cardTitle, subtitle, accent: STATUS_ACCENT.error, icon: crossIcon, body, footer: i18n.tr('ui.error.hint'), thumbnail: avatarUrl });
}

/**
 * Signature Boxed Success Card Builder
 */
export function buildSuccess(successInput: any, title: any = undefined, avatarUrl: any = undefined) {
  const checkIcon = emoji.get('check') || '✅';

  const cardTitle = title ?? i18n.tr('ui.success.title');
  const resultLabel = i18n.tr('ui.success.result');
  const detailLabel = i18n.tr('ui.success.detail');

  const messageText = typeof successInput === 'string' ? successInput : (successInput.message || successInput.content || i18n.tr('ui.success.status'));
  const detailText = typeof successInput === 'object' && successInput.detail ? successInput.detail : null;
  const subtitle = typeof successInput === 'object' && successInput.title ? successInput.title : null;

  let body = `┌─ **${resultLabel}:** ${messageText}`;
  if (detailText) body += `\n└─ **${detailLabel}:** ${detailText}`;

  return statusCard({ title: cardTitle, subtitle, accent: STATUS_ACCENT.success, icon: checkIcon, body, footer: null, thumbnail: avatarUrl });
}

/**
 * Signature Boxed Info Card Builder
 */
export function buildInfo(infoInput: any, title: any = undefined, avatarUrl: any = undefined) {
  const infoIcon = emoji.get('info') || 'ℹ️';
  const cardTitle = title ?? i18n.tr('ui.info.title');
  const messageText = typeof infoInput === 'string' ? infoInput : (infoInput.message || infoInput.content || i18n.tr('ui.info.title'));
  const subtitle = typeof infoInput === 'object' && infoInput.title ? infoInput.title : null;

  return statusCard({ title: cardTitle, subtitle, accent: STATUS_ACCENT.info, icon: infoIcon, body: messageText, footer: null, thumbnail: avatarUrl });
}

/**
 * Signature Boxed Warning Card Builder
 */
export function buildWarning(warningInput: any, title: any = undefined, avatarUrl: any = undefined) {
  const warningIcon = '⚠️';
  const resetIcon = emoji.get('reset') || '🔄';

  const cardTitle = title ?? i18n.tr('ui.warning.title');
  const warningLabel = i18n.tr('ui.warning.title');
  const actionLabel = i18n.tr('ui.error.action');

  const messageText = typeof warningInput === 'string' ? warningInput : (warningInput.message || warningInput.content || i18n.tr('ui.warning.attention'));
  const subtitle = typeof warningInput === 'object' && warningInput.title ? warningInput.title : null;

  const body = `┌─ **${warningLabel}:** ${messageText}\n└─ **${resetIcon} ${actionLabel}:** ${i18n.tr('ui.warning.action')}`;

  return statusCard({ title: cardTitle, subtitle, accent: STATUS_ACCENT.warning, icon: warningIcon, body, footer: null, thumbnail: avatarUrl });
}

/**
 * Signature Boxed Loading Card Builder
 */
export function buildLoading(loadingInput: any, title: any = undefined, avatarUrl: any = undefined) {
  const loadingIcon = emoji.get('loading') || '⏳';
  const cardTitle = title ?? i18n.tr('ui.loading.title');
  const messageText = typeof loadingInput === 'string' ? loadingInput : (loadingInput.message || loadingInput.content || i18n.tr('ui.loading.wait'));

  return statusCard({ title: cardTitle, subtitle: null, accent: STATUS_ACCENT.loading, icon: loadingIcon, body: messageText, footer: null, thumbnail: avatarUrl });
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
