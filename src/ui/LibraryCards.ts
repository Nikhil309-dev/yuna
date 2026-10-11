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
} from 'discord.js';
import emoji from '#config/emoji';
import { config } from '#config/config';
import { db } from '#database/Database';
import { buildContainer } from '#ui/Theme';
import { formatDuration } from '#ui/Formatters';
import { PlayerManager } from '#audio/PlayerManager';
import { logger } from '#utils/logger';
import { i18n } from '#utils/i18n';
import phrases from '#utils/phrases';

export const LIKED_PER_PAGE = 8;

/** Tree connectors, matching the playlist cards so the whole bot reads the same. */
function tree(lines: string[]): string {
  return lines
    .map((l, i) => `${i === lines.length - 1 ? '└─' : '├─'} ${l}`)
    .join('\n');
}

const ICONS = {
  check: emoji.get('check') || '✅',
  info: emoji.get('info') || 'ℹ️',
  music: emoji.get('music') || '🎵',
  folder: emoji.get('folder') || '📁',
};

/** Title / artist / duration block shared by the like + unlike cards. */
function trackBlock(track: any): string {
  const title = track?.title || i18n.cmd('Unknown Track');
  const author = track?.author && track.author !== 'Unknown' ? track.author : i18n.cmd('Unknown Artist');
  const duration = track?.duration ? formatDuration(track.duration) : i18n.cmd('Live');
  return tree([
    `${ICONS.music} **${title}**`,
    `${ICONS.folder} ${author}`,
    `${ICONS.info} ${duration}`,
  ]);
}

function likedCount(userId: string): number {
  try {
    return (db as any).liked.getUserLiked(userId).length;
  } catch {
    return 0;
  }
}

/**
 * `like` result card — the track that was saved (or already present) plus the
 * running total, so the user sees the favourite actually land.
 */
export function buildLikeCard({ track, added, userId }: any) {
  const note = phrases.get(added ? 'likeAdded' : 'alreadyLiked');
  const content =
    `**${i18n.cmd('Current Track')}**\n` + trackBlock(track) +
    `\n\n**${i18n.cmd('Status')}**\n` +
    tree([
      added
        ? `${ICONS.check} ${i18n.cmd('Added to your liked songs')}`
        : `${ICONS.info} ${i18n.cmd('Already in your liked songs')}`,
      `${ICONS.folder} ${i18n.cmd('Total liked: {count}', { count: likedCount(userId) })}`,
    ]) +
    `\n\n*${note}*`;

  return buildContainer({
    title: i18n.translateTitle(added ? 'Song Liked' : 'Already Liked'),
    content,
    thumbnail: track?.artworkUrl || config.assets?.defaultTrackArtwork,
    icon: added ? ICONS.check : ICONS.info,
    accent: added ? 0x57f287 : 0x5865f2,
  });
}

/** `unlike` result card — mirrors `like`, but reports removal. */
export function buildUnlikeCard({ track, removed, userId }: any) {
  const note = phrases.get(removed ? 'likeRemoved' : 'notLiked');
  const content =
    `**${i18n.cmd('Current Track')}**\n` + trackBlock(track) +
    `\n\n**${i18n.cmd('Status')}**\n` +
    tree([
      removed
        ? `${ICONS.check} ${i18n.cmd('Removed from your liked songs')}`
        : `${ICONS.info} ${i18n.cmd('Not in your liked songs')}`,
      `${ICONS.folder} ${i18n.cmd('Total liked: {count}', { count: likedCount(userId) })}`,
    ]) +
    `\n\n*${note}*`;

  return buildContainer({
    title: i18n.translateTitle(removed ? 'Song Unliked' : 'Not Liked'),
    content,
    thumbnail: track?.artworkUrl || config.assets?.defaultTrackArtwork,
    icon: removed ? ICONS.check : ICONS.info,
    accent: removed ? 0x57f287 : 0xfee75c,
  });
}

/** `likeall` result card — a breakdown of what was saved vs skipped. */
export function buildLikeAllCard({ addedCount, alreadyCount, total, userId }: any) {
  const note = phrases.get(addedCount > 0 ? 'likedAll' : 'alreadyLikedAll');
  const content =
    `**${i18n.cmd('Queue Summary')}**\n` +
    tree([
      `${ICONS.check} ${i18n.cmd('Added: {count}', { count: addedCount })}`,
      `${ICONS.info} ${i18n.cmd('Skipped (already saved): {count}', { count: alreadyCount })}`,
      `${ICONS.music} ${i18n.cmd('Scanned: {count} tracks', { count: total })}`,
      `${ICONS.folder} ${i18n.cmd('Total liked: {count}', { count: likedCount(userId) })}`,
    ]) +
    `\n\n*${note}*`;

  return buildContainer({
    title: i18n.translateTitle(addedCount > 0 ? 'Queue Liked' : 'Already All Liked'),
    content,
    thumbnail: config.assets?.defaultThumbnail,
    icon: addedCount > 0 ? ICONS.check : ICONS.info,
    accent: addedCount > 0 ? 0x57f287 : 0xfee75c,
  });
}

/** `showliked` list card, with show-liked pagination controls. */
export function buildLikedSongsContainer({ tracks, user, page }: any) {
  const totalPages = Math.ceil(tracks.length / LIKED_PER_PAGE) || 1;
  const current = Math.max(1, Math.min(page, totalPages));
  const start = (current - 1) * LIKED_PER_PAGE;
  const pageTracks = tracks.slice(start, start + LIKED_PER_PAGE);

  const container = new ContainerBuilder();
  container.setAccentColor(0xf47fff);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `${ICONS.music} **${i18n.cmd('{name}’s Liked Songs', { name: user.username })}**`,
    ),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  let content = i18n.cmd('**Page {page} of {total}** ({count} songs)\n\n', {
    page: current,
    total: totalPages,
    count: tracks.length,
  });
  pageTracks.forEach((t: any, i: number) => {
    const globalIndex = start + i + 1;
    const author = t?.author && t.author !== 'Unknown' ? t.author : i18n.cmd('Unknown Artist');
    const duration = t?.duration ? formatDuration(t.duration) : i18n.cmd('Live');
    content +=
      `${ICONS.music} **${globalIndex}. ${t?.title || i18n.cmd('Unknown Track')}**\n` +
      `   └─ ${author} · ${duration}\n`;
  });

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(user.displayAvatarURL({ dynamic: true })),
      ),
  );

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`liked_prev_${current}`)
      .setLabel(i18n.cmd('Previous'))
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(emoji.get('left'))
      .setDisabled(current <= 1),
    new ButtonBuilder()
      .setCustomId(`liked_next_${current}`)
      .setLabel(i18n.cmd('Next'))
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(emoji.get('right'))
      .setDisabled(current >= totalPages),
    new ButtonBuilder()
      .setCustomId(`liked_play_${current}`)
      .setLabel(i18n.cmd('Play All'))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('liked_close')
      .setLabel(i18n.cmd('Close'))
      .setStyle(ButtonStyle.Danger),
  );

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  container.addActionRowComponents(buttons);
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(clampNote(phrases.get('likedList'))),
  );

  return container;
}

function clampNote(text: string): string {
  return `-# ${text}`;
}

/** Shown when a liked-songs menu times out or is closed. */
export function buildLibraryExpiredCard() {
  return buildContainer({
    title: i18n.translateTitle('Interaction Expired'),
    content: `${ICONS.info} ${i18n.cmd('**This menu has expired. Run `/showliked` again.**')}`,
    icon: ICONS.info,
    accent: 0x99aab5,
  });
}

/** Shared page-size helper for the collector. */
export function likedPageCount(total: number): number {
  return Math.ceil(total / LIKED_PER_PAGE) || 1;
}

/**
 * Resolves a user's stored liked tracks back into playable tracks and queues
 * them. Shared by the `playliked` command and the "Play All" button so both
 * paths behave identically.
 */
export async function playLikedTracks({ client, userId, requester, voiceChannel, textChannelId, guildId }: any) {
  const tracks = (db as any).liked.getUserLiked(userId);
  if (tracks.length === 0) {
    return { ok: false, reason: 'empty', addedCount: 0, total: 0 };
  }

  let player = client.music.getPlayer(guildId);
  const alreadyConnected = Boolean(player);
  if (!player) {
    player = await client.music.createPlayer({
      guildId,
      textChannelId,
      voiceChannelId: voiceChannel.id,
    });
  }

  const pm = new PlayerManager(player);
  if (!pm.isConnected) {
    await pm.connect();
  }

  const wasEmpty = !pm.currentTrack && pm.queueSize === 0;
  let addedCount = 0;

  for (const t of tracks) {
    try {
      const query = t.uri || (t.author ? `${t.title} ${t.author}` : t.title);
      const searchResult = await client.music.search(query, { requester });
      if (searchResult?.tracks?.length > 0) {
        await pm.addTracks(searchResult.tracks[0]);
        addedCount++;
      }
    } catch (err: any) {
      logger.warn('LibraryCards', `Failed to resolve liked track: ${err.message}`);
    }
  }

  if (wasEmpty && addedCount > 0) {
    await pm.play();
  }

  return { ok: addedCount > 0, addedCount, total: tracks.length, alreadyConnected };
}

/** `playliked` result card — how many favourites were resolved and queued. */
export function buildPlayLikedCard({ addedCount, total, ok }: any) {
  const note = phrases.get(ok ? 'likedQueued' : 'likedResolveFailed');
  const content =
    `**${i18n.cmd('Playback')}**\n` +
    tree([
      `${ICONS.check} ${i18n.cmd('Queued: {count} tracks', { count: addedCount })}`,
      `${ICONS.info} ${i18n.cmd('Available: {count} liked songs', { count: total })}`,
    ]) +
    `\n\n*${note}*`;

  return buildContainer({
    title: i18n.translateTitle(ok ? 'Playing Favorites' : 'Could Not Load Favorites'),
    content,
    thumbnail: config.assets?.defaultThumbnail,
    icon: ok ? ICONS.check : ICONS.info,
    accent: ok ? 0x57f287 : 0xfee75c,
  });
}
