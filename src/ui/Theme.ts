import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder
} from 'discord.js';
import emoji from '#config/emoji';
import branding from '#config/branding';
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
const BRAND_FOOTER = 'Built with ♥ under CodeX Development';

// Body labels for the two-part "progression" layout. Falls back to English when
// a locale has not translated a key yet, so nothing ever renders as a raw key.
function label(key: string, fallback: string) {
  const v = i18n.tr(key);
  return v && v !== key ? v : fallback;
}

/**
 * Renders the card body as a tree: each block is a node on a branch connector
 * (├─ / └─) with its text hanging below on a matching guide.
 */
function renderTree(blocks: any[]): string {
  const items = (blocks || []).filter((b: any) => b && b.text);
  const n = items.length;
  return items
    .map((b: any, i: number) => {
      const isLast = i === n - 1;
      const connector = isLast ? '└─' : '├─';
      const pipe = isLast ? '   ' : '│  ';
      const textLines = String(b.text).split('\n');
      const first = b.label ? `**${b.label}**` : textLines[0];
      const rest = b.label ? textLines : textLines.slice(1);
      return [`${connector} ${first}`, ...rest.map((l: string) => `${pipe}${l}`)].join('\n');
    })
    .join('\n');
}

/**
 * Shared status-card shell (app-style "progression" layout):
 *   icon + title            -> what the card is about
 *   ─────────────
 *   ╭─ label  what happened -> the message, with the avatar alongside
 *   ╰─ label  next step     -> only when it adds info
 *   ─────────────
 *   -# branded footer
 */
function statusCard({ title, subtitle, accent, icon, blocks = [], footer, thumbnail, buttons = [] }: any) {
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

  const body = renderTree(blocks);

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

  if (buttons && buttons.length) {
    container.addActionRowComponents(
      new ActionRowBuilder<any>().addComponents(...buttons)
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(clampText(`-# ${footer || BRAND_FOOTER}`)));

  return container;
}

/** Link button to the support server, used on "blocked / restricted" cards. */
function supportButton(labelText?: string) {
  return new ButtonBuilder()
    .setLabel(labelText || label('ui.button.support', 'Join Support Server'))
    .setStyle(ButtonStyle.Link)
    .setURL(branding.links.supportServer);
}

/**
 * Signature Error Card Builder — "what went wrong" + "how to fix it".
 */
export function buildError(errorInput: any, title: any = undefined, avatarUrl: any = undefined) {
  const crossIcon = emoji.get('cross') || '❌';
  const obj = (typeof errorInput === 'object' && errorInput) ? errorInput : {};

  const cardTitle = title ?? obj.title ?? i18n.tr('ui.error.title');
  const what = typeof errorInput === 'string' ? errorInput : (obj.issue || obj.message || '');
  const fix = obj.tip;

  const blocks = [
    { label: label('ui.block.problem', 'What went wrong'), text: what },
    fix && fix !== cardTitle && fix !== what ? { label: label('ui.block.solution', 'How to fix it'), text: fix } : null
  ];

  // A "blocked" error (blacklist / restriction) gets a link button to support,
  // where the user can appeal — matching how the card tells them to.
  const buttons = obj.blocked ? [supportButton(obj.supportLabel)] : [];

  return statusCard({ title: cardTitle, accent: STATUS_ACCENT.error, icon: crossIcon, blocks, buttons, thumbnail: avatarUrl });
}

/**
 * Blocked / restricted card — same as an error but with a support-server link
 * button so the user has a one-click path to appeal.
 */
export function buildBlocked(blockedInput: any, title: any = undefined, avatarUrl: any = undefined) {
  const obj = (typeof blockedInput === 'object' && blockedInput) ? blockedInput : { issue: blockedInput };
  return buildError({ ...obj, blocked: true }, title ?? i18n.tr('mw.blacklisted.title'), avatarUrl);
}

/**
 * Signature Success Card Builder — "what's done" + optional "what's next".
 */
export function buildSuccess(successInput: any, title: any = undefined, avatarUrl: any = undefined) {
  const checkIcon = emoji.get('check') || '✅';
  const obj = (typeof successInput === 'object' && successInput) ? successInput : {};

  const cardTitle = title ?? obj.title ?? i18n.tr('ui.success.title');
  const message = typeof successInput === 'string' ? successInput : (obj.message || obj.content || i18n.tr('ui.success.status'));
  const detail = obj.detail;

  const blocks = [
    { label: label('ui.block.done', "What's done"), text: message },
    detail && detail !== message ? { label: label('ui.block.next', "What's next"), text: detail } : null
  ];

  return statusCard({ title: cardTitle, accent: STATUS_ACCENT.success, icon: checkIcon, blocks, thumbnail: avatarUrl });
}

/**
 * Signature Info Card Builder — plain details, no label.
 */
export function buildInfo(infoInput: any, title: any = undefined, avatarUrl: any = undefined) {
  const infoIcon = emoji.get('info') || 'ℹ️';
  const obj = (typeof infoInput === 'object' && infoInput) ? infoInput : {};

  const cardTitle = title ?? obj.title ?? i18n.tr('ui.info.title');
  const message = typeof infoInput === 'string' ? infoInput : (obj.message || obj.content || i18n.tr('ui.info.title'));

  return statusCard({ title: cardTitle, accent: STATUS_ACCENT.info, icon: infoIcon, blocks: [{ text: message }], thumbnail: avatarUrl });
}

/**
 * Signature Warning Card Builder — "heads up" + optional "what you can do".
 */
export function buildWarning(warningInput: any, title: any = undefined, avatarUrl: any = undefined) {
  const warningIcon = '⚠️';
  const obj = (typeof warningInput === 'object' && warningInput) ? warningInput : {};

  const cardTitle = title ?? obj.title ?? i18n.tr('ui.warning.title');
  const message = typeof warningInput === 'string' ? warningInput : (obj.message || obj.content || i18n.tr('ui.warning.attention'));
  const tip = obj.tip;

  const blocks = [
    { label: label('ui.block.headsUp', 'Heads up'), text: message },
    tip && tip !== cardTitle && tip !== message ? { label: label('ui.block.solution', 'What you can do'), text: tip } : null
  ];

  return statusCard({ title: cardTitle, accent: STATUS_ACCENT.warning, icon: warningIcon, blocks, thumbnail: avatarUrl });
}

/**
 * Signature Loading Card Builder.
 */
export function buildLoading(loadingInput: any, title: any = undefined, avatarUrl: any = undefined) {
  const loadingIcon = emoji.get('loading') || '⏳';
  const obj = (typeof loadingInput === 'object' && loadingInput) ? loadingInput : {};

  const cardTitle = title ?? obj.title ?? i18n.tr('ui.loading.title');
  const message = typeof loadingInput === 'string' ? loadingInput : (obj.message || obj.content || i18n.tr('ui.loading.wait'));

  return statusCard({ title: cardTitle, accent: STATUS_ACCENT.loading, icon: loadingIcon, blocks: [{ text: message }], thumbnail: avatarUrl });
}

const Theme = {
  buildContainer,
  buildError,
  buildSuccess,
  buildInfo,
  buildWarning,
  buildLoading,
  buildBlocked,
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
