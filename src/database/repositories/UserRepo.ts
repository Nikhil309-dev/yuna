import type BetterSqlite3Database from 'better-sqlite3';
import { logger } from '#utils/logger';

const HISTORY_LIMIT = 10;
const USER_PREFIX_LIMIT = 3;

export class UserRepo {
  public db: BetterSqlite3Database.Database;
  public _getUser: BetterSqlite3Database.Statement;
  public _ensureUser: BetterSqlite3Database.Statement;
  public _updateNoPrefix: BetterSqlite3Database.Statement;
  public _updateNpStyle: BetterSqlite3Database.Statement;
  public _updateAutoplayCooldown: BetterSqlite3Database.Statement;
  public _updatePrefixes: BetterSqlite3Database.Statement;
  public _updateLocale: BetterSqlite3Database.Statement;
  public _updateBlacklist: BetterSqlite3Database.Statement;
  public _updateHistory: BetterSqlite3Database.Statement;
  public _updateSpotify: BetterSqlite3Database.Statement;
  public _unlinkSpotify: BetterSqlite3Database.Statement;

  constructor(db: BetterSqlite3Database.Database) {
    this.db = db;
    this._getUser = this.db.prepare('SELECT * FROM users WHERE id = ?');
    this._ensureUser = this.db.prepare('INSERT INTO users (id) VALUES (?) ON CONFLICT(id) DO NOTHING');

    this._updateNoPrefix = this.db.prepare('UPDATE users SET no_prefix = ?, no_prefix_expiry = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    this._updateNpStyle = this.db.prepare('UPDATE users SET np_style = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    this._updateAutoplayCooldown = this.db.prepare('UPDATE users SET autoplay_cooldown = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    this._updatePrefixes = this.db.prepare('UPDATE users SET custom_prefixes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    this._updateLocale = this.db.prepare('UPDATE users SET locale = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    this._updateBlacklist = this.db.prepare('UPDATE users SET blacklisted = ?, blacklist_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    this._updateHistory = this.db.prepare('UPDATE users SET history = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    this._updateSpotify = this.db.prepare('UPDATE users SET spotify_profile_url = ?, spotify_display_name = ?, spotify_linked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    this._unlinkSpotify = this.db.prepare('UPDATE users SET spotify_profile_url = NULL, spotify_display_name = NULL, spotify_linked_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  }

  getUser(userId: string) {
    return this._getUser.get(userId);
  }

  ensureUser(userId: string) {
    let user = this.getUser(userId);
    if (!user) {
      this._ensureUser.run(userId);
      user = this.getUser(userId);
    }
    return user;
  }

  setNoPrefix(userId: string, enabled: boolean, expiryTimestamp: number | null = null) {
    this.ensureUser(userId);
    this._updateNoPrefix.run(enabled ? 1 : 0, expiryTimestamp, userId);
  }

  hasNoPrefix(userId: string) {
    const user = this.getUser(userId);
    if (!user || !user.no_prefix) return false;
    if (!user.no_prefix_expiry) return true;
    if (user.no_prefix_expiry > Date.now()) return true;
    this.setNoPrefix(userId, false, null);
    return false;
  }

  getNpStyle(userId: string) {
    const user = this.getUser(userId);
    return user?.np_style || 'card';
  }

  setNpStyle(userId: string, style: string) {
    this.ensureUser(userId);
    this._updateNpStyle.run(style, userId);
  }

  setAutoplayCooldown(userId: string, cooldownTimestamp: number) {
    this.ensureUser(userId);
    this._updateAutoplayCooldown.run(cooldownTimestamp, userId);
  }

  getAutoplayCooldown(userId: string) {
    const user = this.getUser(userId);
    if (!user || !user.autoplay_cooldown) return 0;
    return user.autoplay_cooldown > Date.now() ? user.autoplay_cooldown : 0;
  }

  getUserPrefixes(userId: string) {
    const user = this.getUser(userId);
    if (!user || !user.custom_prefixes) return [];
    try {
      return JSON.parse(user.custom_prefixes);
    } catch {
      return [];
    }
  }

  getCustomPrefixes(userId: string) {
    return this.getUserPrefixes(userId);
  }

  setUserPrefixes(userId: string, prefixes: string[]) {
    this.ensureUser(userId);
    const limitedPrefixes = prefixes.slice(0, USER_PREFIX_LIMIT);
    this._updatePrefixes.run(JSON.stringify(limitedPrefixes), userId);
  }

  blacklistUser(userId: string, reason: string = 'No reason provided') {
    this.ensureUser(userId);
    this._updateBlacklist.run(1, reason, userId);
  }

  unblacklistUser(userId: string) {
    this.ensureUser(userId);
    this._updateBlacklist.run(0, null, userId);
  }

  isBlacklisted(userId: string) {
    const user = this.getUser(userId);
    if (!user || !user.blacklisted) return false;
    return { blacklisted: true, reason: user.blacklist_reason || 'No reason provided' };
  }

  addTrackToHistory(userId: string, trackInfo: any) {
    if (!trackInfo || !trackInfo.identifier) return;
    this.ensureUser(userId);

    let history = [];
    const user = this.getUser(userId);
    if (user && user.history) {
      try {
        history = JSON.parse(user.history);
      } catch {
        history = [];
      }
    }

    const historyEntry = {
      identifier: trackInfo.identifier,
      title: trackInfo.title || 'Unknown Track',
      author: trackInfo.author || 'Unknown',
      uri: trackInfo.uri || null,
      duration: trackInfo.duration || null,
      sourceName: trackInfo.sourceName || null,
      artworkUrl: trackInfo.artworkUrl || null,
      addedAt: Date.now()
    };

    history = history.filter((t: any) => t && t.identifier !== historyEntry.identifier);
    history.unshift(historyEntry);
    history = history.slice(0, HISTORY_LIMIT);

    this._updateHistory.run(JSON.stringify(history), userId);
  }

  getHistory(userId: string) {
    const user = this.getUser(userId);
    if (!user || !user.history) return [];
    try {
      return JSON.parse(user.history);
    } catch {
      return [];
    }
  }

  cleanupHistory(userId: string) {
    const user = this.getUser(userId);
    if (!user || !user.history) return;

    try {
      let history = JSON.parse(user.history);
      history = history
        .filter((track: any) => track && track.identifier)
        .map((track: any) => ({
          identifier: track.identifier,
          title: track.title || 'Unknown Track',
          author: track.author || 'Unknown',
          uri: track.uri || null,
          duration: track.duration || null,
          sourceName: track.sourceName || null,
          artworkUrl: track.artworkUrl || null,
          addedAt: track.addedAt || Date.now()
        }));
      this._updateHistory.run(JSON.stringify(history), userId);
    } catch (e) {
      logger.error('UserDB', `Failed to cleanup history for user ${userId}`, e);
    }
  }

  setUserHistory(userId: string, history: any[]) {
    this.ensureUser(userId);
    const limitedHistory = history.slice(0, HISTORY_LIMIT);
    this._updateHistory.run(JSON.stringify(limitedHistory), userId);
  }

  linkSpotifyProfile(userId: string, profileUrl: string, displayName: string | null = null) {
    this.ensureUser(userId);
    this._updateSpotify.run(profileUrl, displayName, userId);
  }

  getSpotifyProfile(userId: string) {
    const user = this.getUser(userId);
    if (!user || !user.spotify_profile_url) return null;
    return {
      profileUrl: user.spotify_profile_url,
      displayName: user.spotify_display_name,
      linkedAt: user.spotify_linked_at
    };
  }

  unlinkSpotifyProfile(userId: string) {
    this.ensureUser(userId);
    this._unlinkSpotify.run(userId);
  }
  getLocale(userId: string): string {
    const user = this.getUser(userId);
    return user?.locale || null;
  }

  setLocale(userId: string, locale: string) {
    this.ensureUser(userId);
    this._updateLocale.run(locale, userId);
  }
}

// Made by Nikhil Under CodeX Devs
