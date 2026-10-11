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
  StringSelectMenuBuilder,
} from 'discord.js';
import emoji from '#config/emoji';
import { config } from '#config/config';
import { db } from '#database/Database';
import { buildContainer } from '#ui/Theme';
import { formatDuration, truncate, timeAgo } from '#ui/Formatters';
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

export const FAV_ACCENT = 0xf47fff;
export const FAV_OPTIONS_PER_PAGE = 25; // Discord select-menu option cap

function totalDuration(tracks: any[]): string {
  const ms = tracks.reduce((sum, t) => sum + (t?.duration || 0), 0);
  if (!ms) return i18n.cmd('Live');
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function topArtist(tracks: any[]): string {
  const counts = new Map<string, number>();
  for (const t of tracks) {
    const a = t?.author && t.author !== 'Unknown' ? t.author : null;
    if (a) counts.set(a, (counts.get(a) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || i18n.cmd('Unknown Artist');
}

function selectorHeader(container: ContainerBuilder, title: string, icon: string) {
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${icon} **${title}**`));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
}

function favoriteFooter(container: ContainerBuilder, note: string) {
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${note}`));
}

/**
 * Interactive favorites hub. The dropdown lists the page's liked songs; picking
 * one opens the per-track action panel (`buildFavoriteTrackCard`). Stats sit in
 * the header so the user sees the shape of their library at a glance.
 */
export function buildFavoriteSelector({ tracks, user, page }: any) {
  const totalPages = Math.ceil(tracks.length / FAV_OPTIONS_PER_PAGE) || 1;
  const current = Math.max(1, Math.min(page, totalPages));
  const start = (current - 1) * FAV_OPTIONS_PER_PAGE;
  const pageTracks = tracks.slice(start, start + FAV_OPTIONS_PER_PAGE);

  const container = new ContainerBuilder();
  container.setAccentColor(FAV_ACCENT);
  selectorHeader(container, i18n.cmd('{name}’s Liked Songs', { name: user.username }), ICONS.music);

  const stats =
    `**${i18n.cmd('Your Library')}**\n` +
    tree([
      `${ICONS.music} ${i18n.cmd('Liked songs: {count}', { count: tracks.length })}`,
      `${ICONS.info} ${i18n.cmd('Total playtime: {duration}', { duration: totalDuration(tracks) })}`,
      `${ICONS.folder} ${i18n.cmd('Top artist: {name}', { name: topArtist(tracks) })}`,
    ]);
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(stats))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(user.displayAvatarURL({ dynamic: true }))),
  );

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`fav_select_${current}`)
    .setPlaceholder(i18n.cmd('Choose a liked song to manage…'));
  pageTracks.forEach((t: any, i: number) => {
    menu.addOptions({
      label: truncate(`${start + i + 1}. ${t?.title || i18n.cmd('Unknown Track')}`, 95),
      description: truncate(
        `${t?.author || i18n.cmd('Unknown Artist')} · ${t?.duration ? formatDuration(t.duration) : i18n.cmd('Live')}`,
        95,
      ),
      value: String(t.identifier),
    });
  });
  container.addActionRowComponents(new ActionRowBuilder<any>().addComponents(menu));

  if (totalPages > 1) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`fav_prev_${current}`)
          .setLabel(i18n.cmd('Previous'))
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(emoji.get('left'))
          .setDisabled(current <= 1),
        new ButtonBuilder()
          .setCustomId(`fav_page_${current}`)
          .setLabel(`${current} / ${totalPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`fav_next_${current}`)
          .setLabel(i18n.cmd('Next'))
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(emoji.get('right'))
          .setDisabled(current >= totalPages),
        new ButtonBuilder()
          .setCustomId('fav_close')
          .setLabel(i18n.cmd('Close'))
          .setStyle(ButtonStyle.Danger),
      ),
    );
  } else {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('fav_playall')
          .setLabel(i18n.cmd('Play All'))
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('fav_close')
          .setLabel(i18n.cmd('Close'))
          .setStyle(ButtonStyle.Danger),
      ),
    );
  }

  favoriteFooter(container, phrases.get('likedList'));
  return container;
}

/**
 * Per-track action panel, opened by choosing a row in the favorites dropdown.
 * Every action works without re-running the command — that is the whole point.
 */
export function buildFavoriteTrackCard({ track, user }: any) {
  const container = new ContainerBuilder();
  container.setAccentColor(0xfee75c);
  selectorHeader(container, i18n.cmd('Liked Song'), ICONS.music);

  const content =
    `**${i18n.cmd('Track')}**\n` +
    tree([
      `${ICONS.music} **${track?.title || i18n.cmd('Unknown Track')}**`,
      `${ICONS.folder} ${track?.author && track.author !== 'Unknown' ? track.author : i18n.cmd('Unknown Artist')}`,
      `${ICONS.info} ${track?.duration ? formatDuration(track.duration) : i18n.cmd('Live')}`,
      `${ICONS.check} ${i18n.cmd('Saved {when}', { when: timeAgo(track?.addedAt || Date.now()) })}`,
    ]);
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(track?.artworkUrl || config.assets?.defaultTrackArtwork),
      ),
  );

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('fav_playnext').setLabel(i18n.cmd('Play Next')).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('fav_queue').setLabel(i18n.cmd('Add to Queue')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('fav_playnow').setLabel(i18n.cmd('Play Now')).setStyle(ButtonStyle.Success),
    ),
  );
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('fav_remove').setLabel(i18n.cmd('Unlike')).setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('fav_back').setLabel(i18n.cmd('Back')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('fav_close').setLabel(i18n.cmd('Close')).setStyle(ButtonStyle.Danger),
    ),
  );

  favoriteFooter(container, phrases.get('likedTrack'));
  return container;
}

/** Resolves a stored liked entry back into a playable Lavalink track. */
export async function resolveLikedTrack(client: any, stored: any, requester: any) {
  const query = stored?.uri || (stored?.author ? `${stored.title} ${stored.author}` : stored?.title);
  if (!query) return null;
  try {
    const res = await client.music.search(query, { requester });
    return res?.tracks?.[0] || null;
  } catch {
    return null;
  }
}

/**
 * Queues one liked track. `mode` is `playnow` (jump the line and start it),
 * `playnext` (front of queue) or `queue` (append). Creates/connects the player
 * on demand, so the action works straight from the favorites menu.
 */
export async function queueLikedTrack({ client, stored, requester, voiceChannel, guildId, textChannelId, mode = 'queue' }: any) {
  let player = client.music.getPlayer(guildId);
  if (!player) {
    if (!voiceChannel) return { ok: false, reason: 'no-voice' };
    player = await client.music.createPlayer({ guildId, textChannelId, voiceChannelId: voiceChannel.id });
  }

  const pm = new PlayerManager(player);
  if (!pm.isConnected) await pm.connect();

  const resolved = await resolveLikedTrack(client, stored, requester);
  if (!resolved) return { ok: false, reason: 'unresolved' };

  if (mode === 'playnow') {
    if (pm.currentTrack) {
      await pm.addTracks(resolved, 0);
      await pm.skip();
    } else {
      await pm.addTracks(resolved, 0);
      await pm.play();
    }
  } else if (mode === 'playnext') {
    await pm.addTracks(resolved, 0);
    if (!pm.currentTrack) await pm.play();
  } else {
    await pm.addTracks(resolved);
    if (!pm.currentTrack) await pm.play();
  }

  return { ok: true, track: resolved };
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

/** Result card for a single queue action taken from the favorites menu. */
export function buildQueueResultCard({ mode, title, ok, reason }: any) {
  const note = phrases.get(ok ? 'trackQueued' : 'trackResolveFailed');
  const action = {
    playnow: i18n.cmd('Now Playing'),
    playnext: i18n.cmd('Playing Next'),
    queue: i18n.cmd('Added to Queue'),
  }[mode as string] || i18n.cmd('Added to Queue');

  const content =
    `**${i18n.cmd('Action')}**\n` +
    tree([
      `${ICONS.check} ${action}`,
      `${ICONS.music} **${title}**`,
    ]) +
    `\n\n*${note}*`;

  return buildContainer({
    title: i18n.translateTitle(ok ? 'Favorites Update' : 'Could Not Queue Track'),
    content,
    thumbnail: config.assets?.defaultTrackArtwork,
    icon: ok ? ICONS.check : ICONS.info,
    accent: ok ? 0x57f287 : 0xfee75c,
  });
}

/** `Play All` result card — queues the entire liked library. */
export function buildPlayAllCard({ addedCount, total, ok }: any) {
  const note = phrases.get(ok ? 'likedQueued' : 'likedResolveFailed');
  const content =
    `**${i18n.cmd('Play All')}**\n` +
    tree([
      `${ICONS.check} ${i18n.cmd('Queued: {count} tracks', { count: addedCount })}`,
      `${ICONS.info} ${i18n.cmd('Library size: {count} songs', { count: total })}`,
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
