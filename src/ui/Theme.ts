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

export function buildContainer(options: any = {}) {
  const { title, content, thumbnail, image, components, icon, subtitle } = options;
  const container = new ContainerBuilder();

  // Titles are authored as English literals in the commands; translate known
  // ones for the active locale (dynamic titles fall through unchanged).
  const localizedTitle = i18n.translateTitle(title);

  let headerText = `${icon || ''} **${localizedTitle}**`;
  if (subtitle) {
    headerText += `\n**${subtitle}**`;
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
 * Signature Boxed Error Card Builder
 * Chrome labels are localized; callers pass already-translated content/titles.
 */
export function buildError(errorInput: any, title: any = undefined) {
  const infoIcon = emoji.get('info') || 'ℹ️';
  const resetIcon = emoji.get('reset') || '🔄';
  const crossIcon = emoji.get('cross') || '❌';

  const cardTitle = title ?? i18n.tr('ui.error.title');
  const issueLabel = i18n.tr('ui.error.issue');
  const actionLabel = i18n.tr('ui.error.action');

  let issueText = typeof errorInput === 'string' ? errorInput : (errorInput.issue || errorInput.message || i18n.tr('ui.error.title'));
  let actionText = typeof errorInput === 'object' && errorInput.tip ? errorInput.tip : i18n.tr('ui.error.contact');
  let subtitle = typeof errorInput === 'object' && errorInput.title ? errorInput.title : i18n.tr('ui.error.title');

  let content = `┌─ **${infoIcon} ${issueLabel}:** ${issueText}\n`;
  content += `└─ **${resetIcon} ${actionLabel}:** ${actionText}\n\n`;
  content += `*${i18n.tr('ui.error.hint')}*`;

  return buildContainer({ image: null, thumbnail: null, title: cardTitle, subtitle, content, icon: undefined } as any);
}

/**
 * Signature Boxed Success Card Builder
 */
export function buildSuccess(successInput: any, title: any = undefined) {
  const checkIcon = emoji.get('check') || '✅';
  const infoIcon = emoji.get('info') || 'ℹ️';

  const cardTitle = title ?? i18n.tr('ui.success.title');
  const resultLabel = i18n.tr('ui.success.result');
  const detailLabel = i18n.tr('ui.success.detail');

  let messageText = typeof successInput === 'string' ? successInput : (successInput.message || successInput.content || i18n.tr('ui.success.status'));
  let detailText = typeof successInput === 'object' && successInput.detail ? successInput.detail : null;
  let subtitle = typeof successInput === 'object' && successInput.title ? successInput.title : i18n.tr('ui.success.status');

  let content = `┌─ **${checkIcon} ${resultLabel}:** ${messageText}\n`;
  if (detailText) {
    content += `└─ **${infoIcon} ${detailLabel}:** ${detailText}`;
  } else {
    content += `└─ **${infoIcon} ${i18n.tr('ui.success.status')}:** ${i18n.tr('ui.success.status')}`;
  }

  return buildContainer({ image: null, thumbnail: null, title: cardTitle, subtitle, content, icon: undefined } as any);
}

/**
 * Signature Boxed Info Card Builder
 */
export function buildInfo(infoInput: any, title: any = undefined) {
  const infoIcon = emoji.get('info') || 'ℹ️';
  const cardTitle = title ?? i18n.tr('ui.info.title');
  let messageText = typeof infoInput === 'string' ? infoInput : (infoInput.message || infoInput.content || i18n.tr('ui.info.title'));
  let subtitle = typeof infoInput === 'object' && infoInput.title ? infoInput.title : null;

  return buildContainer({ image: null, thumbnail: null,
    title: cardTitle,
    subtitle,
    content: messageText,
    icon: infoIcon
  });
}

/**
 * Signature Boxed Warning Card Builder
 */
export function buildWarning(warningInput: any, title: any = undefined) {
  const infoIcon = emoji.get('info') || 'ℹ️';
  const warningIcon = emoji.get('cross') || '⚠️';

  const cardTitle = title ?? i18n.tr('ui.warning.title');
  const warningLabel = i18n.tr('ui.warning.title');
  const actionLabel = i18n.tr('ui.error.action');

  let messageText = typeof warningInput === 'string' ? warningInput : (warningInput.message || warningInput.content || i18n.tr('ui.warning.attention'));
  let subtitle = typeof warningInput === 'object' && warningInput.title ? warningInput.title : i18n.tr('ui.warning.attention');

  let content = `┌─ **${warningIcon} ${warningLabel}:** ${messageText}\n`;
  content += `└─ **${emoji.get('reset') || '🔄'} ${actionLabel}:** ${i18n.tr('ui.warning.action')}`;

  return buildContainer({ image: null, thumbnail: null, title: cardTitle, subtitle, content, icon: undefined } as any);
}

/**
 * Signature Boxed Loading Card Builder
 */
export function buildLoading(loadingInput: any, title: any = undefined) {
  const loadingIcon = emoji.get('loading') || '⏳';
  const cardTitle = title ?? i18n.tr('ui.loading.title');
  let messageText = typeof loadingInput === 'string' ? loadingInput : (loadingInput.message || loadingInput.content || i18n.tr('ui.loading.wait'));

  return buildContainer({ image: null, thumbnail: null,
    title: cardTitle,
    content: `${loadingIcon} ${messageText}`,
    icon: loadingIcon
  });
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
