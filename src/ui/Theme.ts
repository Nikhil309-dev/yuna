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
import phrases from '#utils/phrases.js';
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
  const { title, content, thumbnail, image, components, icon, subtitle, accent, footer, separatorBeforeButtons } = options;
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

  const rows = (components || []).filter((r: any) => r instanceof ActionRowBuilder);
  if (separatorBeforeButtons && rows.length) {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  }
  rows.forEach((row: any) => container.addActionRowComponents(row));

  if (footer) {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(clampText(`-# ${resolveFooter(footer)}`)));
  }

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
 * Returns a randomized, locale-aware phrase from the `phrases` pool. This is
 * what keeps repeated cards from showing the exact same sentence every time;
 * falls back to `fallback` when the category is missing.
 */
function phraseOr(category: string | undefined, fallback: string): string {
  if (!category) return fallback;
  // Guard against unknown categories: `phrases.get` falls back to the generic
  // *error* pool when a category is missing, which would put "something went
  // wrong" on a healthy card. Skip the lookup entirely when the category is
  // not defined anywhere.
  if (!phrases.has(category)) return fallback;
  const p = phrases.get(category);
  return p && p !== category ? p : fallback;
}

/**
 * Resolves a card footer. `phrases.<category>` rotates the sentence from the
 * phrase pool; anything else is used verbatim. Falls back to the brand credit.
 */
function resolveFooter(footer: any): string {
  if (!footer) return BRAND_FOOTER;
  if (typeof footer === 'string' && footer.startsWith('phrases.')) {
    return phraseOr(footer.slice('phrases.'.length), BRAND_FOOTER);
  }
  return String(footer);
}

/**
 * Renders the card body. Uses a "quote bar" style: each block's label is bold
 * and its text sits in a blockquote, which Discord draws as a soft vertical bar
 * — cleaner than ASCII tree connectors.
 */
function renderBody(blocks: any[]): string {
  const items = (blocks || []).filter((b: any) => b && b.text);
  return items
    .map((b: any) => {
      // A block may supply a randomized phrase pool instead of a fixed string;
      // that keeps repeated cards from reading identically every time.
      const text = b.phrase ? phraseOr(b.phrase, String(b.text)) : String(b.text);
      const quoted = text
        .split('\n')
        .map((l: string) => `> ${l}`)
        .join('\n');
      return b.label ? `**${b.label}**\n${quoted}` : quoted;
    })
    .join('\n\n');
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

  const cleanTitleText = cleanTitle(i18n.translateTitle(title));
  let header = `${icon || ''} **${cleanTitleText}**`.trim();
  if (subtitle) {
    const cleanSub = cleanTitle(subtitle);
    if (cleanSub && cleanSub !== cleanTitleText) header += `\n${cleanSub}`;
  }
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(clampText(header)));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  const body = renderBody(blocks);

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

  // Footer section: separator, optional action button, then the credit line.
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  if (buttons && buttons.length) {
    container.addActionRowComponents(
      new ActionRowBuilder<any>().addComponents(...buttons)
    );
  }
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(clampText(`-# ${resolveFooter(footer)}`)));

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
    { label: label('ui.block.problem', 'What went wrong'), text: what, phrase: obj.issuePhrase },
    fix && fix !== cardTitle && fix !== what ? { label: label('ui.block.solution', 'How to fix it'), text: fix, phrase: obj.tipPhrase } : null
  ];

  // A "blocked" error (blacklist / restriction) gets a link button to support,
  // where the user can appeal — matching how the card tells them to. `support`
  // does the same for bot-side failures the user may want to report.
  const buttons = (obj.blocked || obj.support) ? [supportButton(obj.supportLabel)] : [];

  return statusCard({ title: cardTitle, accent: STATUS_ACCENT.error, icon: crossIcon, blocks, buttons, footer: obj.footer, thumbnail: avatarUrl });
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
 * Generic multi-block result card (e.g. filter applied/reset). Callers pass the
 * blocks and a context icon; layout matches the status cards (style A).
 */
export function buildResult(
  { title, subtitle, blocks = [], icon, accent, avatarUrl, footer, buttons }: any = {}
) {
  return statusCard({
    title,
    subtitle,
    accent: typeof accent === 'number' ? accent : STATUS_ACCENT.success,
    icon,
    blocks,
    footer,
    buttons,
    thumbnail: avatarUrl
  });
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
    detail && detail !== message ? { label: label('ui.block.next', "What's next"), text: detail, phrase: obj.detailPhrase } : null
  ];

  return statusCard({ title: cardTitle, accent: STATUS_ACCENT.success, icon: checkIcon, blocks, footer: obj.footer, thumbnail: avatarUrl });
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

  return statusCard({ title: cardTitle, accent: STATUS_ACCENT.warning, icon: warningIcon, blocks, footer: obj.footer, thumbnail: avatarUrl });
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
  buildResult,
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
