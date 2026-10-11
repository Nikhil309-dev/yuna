import type BetterSqlite3Database from 'better-sqlite3';
import BetterSqlite3 from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { logger } from '#utils/logger';

import { GuildRepo } from './repositories/GuildRepo';
import { UserRepo } from './repositories/UserRepo';
import { PremiumRepo } from './repositories/PremiumRepo';
import { PlaylistRepo } from './repositories/PlaylistRepo';
import { EconomyRepo } from './repositories/EconomyRepo';
import { LikedRepo } from './repositories/LikedRepo';
import { StatsRepo } from './repositories/StatsRepo';
import { CooldownRepo } from './repositories/CooldownRepo';

import { up as migration001 } from './migrations/001_initial';
import { up as migration002 } from './migrations/002_cooldowns';

export class Database {
  public dbPath!: string;
  public db!: BetterSqlite3Database.Database;
  public guilds!: import('./repositories/GuildRepo').GuildRepo;
  public users!: import('./repositories/UserRepo').UserRepo;
  public premium!: import('./repositories/PremiumRepo').PremiumRepo;
  public playlists!: import('./repositories/PlaylistRepo').PlaylistRepo;
  public economy!: import('./repositories/EconomyRepo').EconomyRepo;
  public liked!: import('./repositories/LikedRepo').LikedRepo;
  public stats!: import('./repositories/StatsRepo').StatsRepo;
  public cooldowns!: import('./repositories/CooldownRepo').CooldownRepo;

  constructor() {
    this.dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'database', 'yuna.yuna');
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });

    try {
      this.db = new BetterSqlite3(this.dbPath, {
        verbose: process.env.NODE_ENV === 'development' ? (msg) => logger.debug('Database', String(msg)) : null,
      });

      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('temp_store = MEMORY');
      this.db.pragma('busy_timeout = 5000');
      this.db.pragma('mmap_size = 268435456');
      this.db.pragma('cache_size = -64000');
      this.db.pragma('foreign_keys = ON');

      this._runMigrations();

      this.guilds = new GuildRepo(this.db);
      this.users = new UserRepo(this.db);
      this.premium = new PremiumRepo(this.db);
      this.playlists = new PlaylistRepo(this.db);
      this.economy = new EconomyRepo(this.db);
      this.liked = new LikedRepo(this.db);
      this.stats = new StatsRepo(this.db);
      this.cooldowns = new CooldownRepo(this.db);

      logger.success('Database', 'Unified database initialized successfully');
    } catch (error) {
      logger.error('Database', 'Failed to initialize unified database', error);
      throw error;
    }
  }

  _runMigrations() {
    let currentVersion = this.db.pragma('user_version', { simple: true });

    const migrations: Array<{ version: number; name: string; up: (db: any) => void }> = [
      { version: 1, name: '001_initial', up: migration001 },
      { version: 2, name: '002_cooldowns', up: migration002 },
    ];

    for (const migration of migrations) {
      if (currentVersion < migration.version) {
        logger.info('Database', `Running migration ${migration.name}...`);
        this.db.transaction(() => {
          migration.up(this.db);
          this.db.pragma(`user_version = ${migration.version}`);
        })();
        logger.success('Database', `Migration ${migration.name} applied successfully.`);
        currentVersion = migration.version;
      }
    }
  }

  private _closed = false;

  checkpoint() {
    try {
      if (this._closed) return;
      this.db.pragma('wal_checkpoint(TRUNCATE)');
      logger.debug('Database', 'WAL checkpoint (TRUNCATE) completed');
    } catch (error) {
      logger.error('Database', 'Failed to checkpoint WAL', error);
    }
  }

  close() {
    if (this._closed) {
      logger.debug('Database', 'close() called on an already-closed database — ignoring');
      return;
    }
    try {
      this.checkpoint();
      this.db.close();
      this._closed = true;
      logger.info('Database', 'Database connection closed');
    } catch (error) {
      logger.error('Database', 'Failed to close database connection', error);
    }
  }

  backup() {
    return new Promise<void>((resolve, reject) => {
      try {
        const backupDir = path.resolve(process.cwd(), 'backups');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `${timestamp}-yuna.yuna`);

        this.db.backup(backupPath);
        logger.info('Backup', `Database backup completed: ${backupPath}`);
        resolve();
      } catch (error) {
        logger.error('Backup', 'Failed to initialize database backup', error);
        reject(error);
      }
    });
  }

  get guild() { return this.guilds; }
  get user() { return this.users; }

  isUserBlacklisted(userId: string) { return this.users.isBlacklisted(userId); }
  isGuildBlacklisted(guildId: string) { return this.guilds.isBlacklisted(guildId); }
  getPrefixes(guildId: string) { return this.guilds.getPrefixes(guildId); }
  setPrefixes(guildId: string, prefixes: string[]) { return this.guilds.setPrefixes(guildId, prefixes); }
  getUserPrefixes(userId: string) { return this.users.getCustomPrefixes(userId); }
  isUserPremium(userId: string) { return this.premium.isUserPremium(userId); }
  isGuildPremium(guildId: string) { return this.premium.isGuildPremium(guildId); }
  hasAnyPremium(userId: string, guildId: string) { return this.premium.hasAnyPremium ? this.premium.hasAnyPremium(userId, guildId) : (this.isUserPremium(userId) || this.isGuildPremium(guildId)); }
  getNpStyle(userId: string) { return this.users.getNpStyle ? this.users.getNpStyle(userId) : 'card'; }
  setNpStyle(userId: string, style: string) { return this.users.setNpStyle(userId, style); }
  getDefaultVolume(guildId: string) { return this.guilds.getDefaultVolume ? this.guilds.getDefaultVolume(guildId) : 100; }
  getValid247Guilds() { return this.guilds.getValid247Guilds(); }
  set247Mode(guildId: string, enabled: boolean, voiceChannelId: string | null = null, textChannelId: string | null = null) { return this.guilds.set247Mode(guildId, enabled, voiceChannelId, textChannelId); }
  hasNoPrefix(userId: string) { return typeof this.users?.hasNoPrefix === 'function' ? this.users.hasNoPrefix(userId) : false; }

  backupDatabases() { return this.backup(); }
  checkpointWAL() { return this.checkpoint(); }

  closeAll() { return this.close(); }
}

export const db = new Database();
export default db;

// Made by Nikhil Under CodeX Devs
