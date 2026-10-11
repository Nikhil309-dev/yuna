import type BetterSqlite3Database from 'better-sqlite3';
import { config } from '#config/config';

export class GuildRepo {
  public db: BetterSqlite3Database.Database;
  public _getGuild: BetterSqlite3Database.Statement;
  public _insertGuild: BetterSqlite3Database.Statement;
  public _updateGuild: BetterSqlite3Database.Statement;
  public _setBlacklist: BetterSqlite3Database.Statement;
  public _getAllGuilds: BetterSqlite3Database.Statement;
  public _getAllBlacklisted: BetterSqlite3Database.Statement;
  public _get247Guilds: BetterSqlite3Database.Statement;
  public _getValid247Guilds: BetterSqlite3Database.Statement;
  public _saveSession: BetterSqlite3Database.Statement;
  public _getSession: BetterSqlite3Database.Statement;
  public _getAllSessions: BetterSqlite3Database.Statement;
  public _deleteSession: BetterSqlite3Database.Statement;
  public _updatePrefixes: any;
  public _updateLocale: any;

  constructor(db: BetterSqlite3Database.Database) {
    this.db = db;
    this._getGuild = this.db.prepare('SELECT * FROM guilds WHERE id = ?');
    this._insertGuild = this.db.prepare(`
      INSERT INTO guilds (id, prefixes, default_volume, auto_disconnect, stay_247)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
    `);
    this._updateGuild = this.db.prepare('UPDATE guilds SET prefixes = ?, default_volume = ?, auto_disconnect = ?, stay_247 = ?, stay_247_voice_channel = ?, stay_247_text_channel = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    this._setBlacklist = this.db.prepare('UPDATE guilds SET blacklisted = ?, blacklist_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    this._getAllGuilds = this.db.prepare('SELECT * FROM guilds');
    this._getAllBlacklisted = this.db.prepare('SELECT * FROM guilds WHERE blacklisted = 1');
    this._get247Guilds = this.db.prepare('SELECT * FROM guilds WHERE stay_247 = 1 AND stay_247_voice_channel IS NOT NULL');
    this._getValid247Guilds = this.db.prepare("SELECT * FROM guilds WHERE stay_247 = 1 AND stay_247_voice_channel IS NOT NULL AND stay_247_voice_channel != ''");

    this._saveSession = this.db.prepare(`
      INSERT INTO active_sessions (guild_id, voice_channel_id, text_channel_id, current_track, queue_tracks, position)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        voice_channel_id = excluded.voice_channel_id,
        text_channel_id = excluded.text_channel_id,
        current_track = excluded.current_track,
        queue_tracks = excluded.queue_tracks,
        position = excluded.position,
        updated_at = CURRENT_TIMESTAMP
    `);
    this._getSession = this.db.prepare('SELECT * FROM active_sessions WHERE guild_id = ?');
    this._getAllSessions = this.db.prepare('SELECT * FROM active_sessions');
    this._deleteSession = this.db.prepare('DELETE FROM active_sessions WHERE guild_id = ?');
    this._updateLocale = this.db.prepare('UPDATE guilds SET locale = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  }

  getGuild(guildId: string) {
    if (!guildId) return null;
    return this._getGuild.get(guildId);
  }

  ensureGuild(guildId: string) {
    if (!guildId) throw new Error('A valid guildId must be provided');
    let guild = this.getGuild(guildId);
    if (!guild) {
      const defaultPrefix = JSON.stringify([config.prefix]);
      this._insertGuild.run(guildId, defaultPrefix, 100, 1, 0);
      guild = this.getGuild(guildId);
    }
    return guild;
  }

  getPrefixes(guildId: string) {
    const guild = this.ensureGuild(guildId);
    try {
      const prefixes = JSON.parse(guild.prefixes);
      return Array.isArray(prefixes) && prefixes.length > 0 ? prefixes : [config.prefix];
    } catch {
      return [config.prefix];
    }
  }

  setPrefixes(guildId: string, prefixes: string[]) {
    this.ensureGuild(guildId);
    const guild = this.getGuild(guildId);
    this._updateGuild.run(JSON.stringify(prefixes), guild.default_volume, guild.auto_disconnect, guild.stay_247, guild.stay_247_voice_channel, guild.stay_247_text_channel, guildId);
  }

  getDefaultVolume(guildId: string) {
    const guild = this.ensureGuild(guildId);
    return guild.default_volume ?? 100;
  }

  setDefaultVolume(guildId: string, volume: number) {
    if (volume < 1 || volume > 100) throw new Error('Volume must be between 1 and 100');
    this.ensureGuild(guildId);
    const guild = this.getGuild(guildId);
    this._updateGuild.run(guild.prefixes, volume, guild.auto_disconnect, guild.stay_247, guild.stay_247_voice_channel, guild.stay_247_text_channel, guildId);
  }

  getAllGuilds() {
    return this._getAllGuilds.all();
  }

  blacklistGuild(guildId: string, reason: string = 'No reason provided') {
    this.ensureGuild(guildId);
    this._setBlacklist.run(1, reason, guildId);
  }

  unblacklistGuild(guildId: string) {
    this.ensureGuild(guildId);
    this._setBlacklist.run(0, null, guildId);
  }

  isBlacklisted(guildId: string) {
    const guild = this.getGuild(guildId);
    if (!guild || !guild.blacklisted) return false;
    return { blacklisted: true, reason: guild.blacklist_reason || 'No reason provided' };
  }

  getAllBlacklistedGuilds() {
    return this._getAllBlacklisted.all();
  }

  get247Settings(guildId: string) {
    const guild = this.ensureGuild(guildId);
    return {
      enabled: guild.stay_247 === 1,
      voiceChannel: guild.stay_247_voice_channel,
      textChannel: guild.stay_247_text_channel,
      autoDisconnect: guild.auto_disconnect === 1
    };
  }

  set247Mode(guildId: string, enabled: boolean, voiceChannelId: string | null = null, textChannelId: string | null = null) {
    this.ensureGuild(guildId);
    const guild = this.getGuild(guildId);
    this._updateGuild.run(guild.prefixes, guild.default_volume, guild.auto_disconnect, enabled ? 1 : 0, enabled ? voiceChannelId : null, enabled ? textChannelId : null, guildId);
  }

  getAll247Guilds() {
    return this._get247Guilds.all();
  }

  getValid247Guilds() {
    return this._getValid247Guilds.all();
  }

  setAutoDisconnect(guildId: string, enabled: boolean) {
    this.ensureGuild(guildId);
    const guild = this.getGuild(guildId);
    this._updateGuild.run(guild.prefixes, guild.default_volume, enabled ? 1 : 0, guild.stay_247, guild.stay_247_voice_channel, guild.stay_247_text_channel, guildId);
  }

  saveActiveSession(guildId: string, voiceChannelId: string, textChannelId: string, currentTrack: any = null, queueTracks: any[] = [], position: number = 0) {
    this._saveSession.run(guildId, voiceChannelId, textChannelId, currentTrack ? JSON.stringify(currentTrack) : null, JSON.stringify(queueTracks), position);
  }

  getActiveSession(guildId: string) {
    return this._getSession.get(guildId);
  }

  getAllActiveSessions() {
    return this._getAllSessions.all();
  }

  deleteActiveSession(guildId: string) {
    this._deleteSession.run(guildId);
  }
  getLocale(guildId: string): string | null {
    const guild = this.getGuild(guildId);
    return guild?.locale || null;
  }

  setLocale(guildId: string, locale: string | null) {
    this.ensureGuild(guildId);
    this._updateLocale.run(locale, guildId);
  }
}

// Made by Nikhil Under CodeX Devs
