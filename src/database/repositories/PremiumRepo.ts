import type BetterSqlite3Database from 'better-sqlite3';
export class PremiumRepo {
  public db: BetterSqlite3Database.Database;
  public _grantUserPremium: BetterSqlite3Database.Statement;
  public _grantGuildPremium: BetterSqlite3Database.Statement;
  public _revokeUserPremium: BetterSqlite3Database.Statement;
  public _revokeGuildPremium: BetterSqlite3Database.Statement;
  public _getUserPremium: BetterSqlite3Database.Statement;
  public _getGuildPremium: BetterSqlite3Database.Statement;
  public _getAllUserPremiums: BetterSqlite3Database.Statement;
  public _getAllGuildPremiums: BetterSqlite3Database.Statement;
  public _getExpiredUsers: BetterSqlite3Database.Statement;
  public _getExpiredGuilds: BetterSqlite3Database.Statement;
  public _revokeExpiredUsers: BetterSqlite3Database.Statement;
  public _revokeExpiredGuilds: BetterSqlite3Database.Statement;
  public _updateUserExpiresAt: BetterSqlite3Database.Statement;
  public _updateGuildExpiresAt: BetterSqlite3Database.Statement;
  public _deleteUserPremium: BetterSqlite3Database.Statement;
  public _deleteGuildPremium: BetterSqlite3Database.Statement;
  public _countActiveUser: BetterSqlite3Database.Statement;
  public _countActiveGuild: BetterSqlite3Database.Statement;
  public _countTotalUser: BetterSqlite3Database.Statement;
  public _countTotalGuild: BetterSqlite3Database.Statement;
  public _countExpiredUser: BetterSqlite3Database.Statement;
  public _countExpiredGuild: BetterSqlite3Database.Statement;

  constructor(db: BetterSqlite3Database.Database) {
    this.db = db;
    this._grantUserPremium = this.db.prepare(`
      INSERT INTO user_premium (user_id, granted_by, granted_at, expires_at, reason, active, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        granted_by = excluded.granted_by,
        granted_at = excluded.granted_at,
        expires_at = excluded.expires_at,
        reason = excluded.reason,
        active = 1,
        updated_at = excluded.updated_at
    `);

    this._grantGuildPremium = this.db.prepare(`
      INSERT INTO guild_premium (guild_id, granted_by, granted_at, expires_at, reason, active, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        granted_by = excluded.granted_by,
        granted_at = excluded.granted_at,
        expires_at = excluded.expires_at,
        reason = excluded.reason,
        active = 1,
        updated_at = excluded.updated_at
    `);

    this._revokeUserPremium = this.db.prepare('UPDATE user_premium SET active = 0, updated_at = ? WHERE user_id = ? AND active = 1');
    this._revokeGuildPremium = this.db.prepare('UPDATE guild_premium SET active = 0, updated_at = ? WHERE guild_id = ? AND active = 1');

    this._getUserPremium = this.db.prepare('SELECT * FROM user_premium WHERE user_id = ? AND active = 1 AND (expires_at IS NULL OR expires_at > ?)');
    this._getGuildPremium = this.db.prepare('SELECT * FROM guild_premium WHERE guild_id = ? AND active = 1 AND (expires_at IS NULL OR expires_at > ?)');

    this._getAllUserPremiums = this.db.prepare('SELECT * FROM user_premium WHERE active = 1 AND (expires_at IS NULL OR expires_at > ?) ORDER BY granted_at DESC');
    this._getAllGuildPremiums = this.db.prepare('SELECT * FROM guild_premium WHERE active = 1 AND (expires_at IS NULL OR expires_at > ?) ORDER BY granted_at DESC');

    this._getExpiredUsers = this.db.prepare('SELECT * FROM user_premium WHERE active = 1 AND expires_at IS NOT NULL AND expires_at <= ?');
    this._getExpiredGuilds = this.db.prepare('SELECT * FROM guild_premium WHERE active = 1 AND expires_at IS NOT NULL AND expires_at <= ?');

    this._revokeExpiredUsers = this.db.prepare('UPDATE user_premium SET active = 0, updated_at = ? WHERE active = 1 AND expires_at IS NOT NULL AND expires_at <= ?');
    this._revokeExpiredGuilds = this.db.prepare('UPDATE guild_premium SET active = 0, updated_at = ? WHERE active = 1 AND expires_at IS NOT NULL AND expires_at <= ?');

    this._updateUserExpiresAt = this.db.prepare('UPDATE user_premium SET expires_at = ?, updated_at = ? WHERE user_id = ?');
    this._updateGuildExpiresAt = this.db.prepare('UPDATE guild_premium SET expires_at = ?, updated_at = ? WHERE guild_id = ?');

    this._deleteUserPremium = this.db.prepare('DELETE FROM user_premium WHERE user_id = ?');
    this._deleteGuildPremium = this.db.prepare('DELETE FROM guild_premium WHERE guild_id = ?');

    this._countActiveUser = this.db.prepare('SELECT COUNT(*) as count FROM user_premium WHERE active = 1 AND (expires_at IS NULL OR expires_at > ?)');
    this._countActiveGuild = this.db.prepare('SELECT COUNT(*) as count FROM guild_premium WHERE active = 1 AND (expires_at IS NULL OR expires_at > ?)');
    this._countTotalUser = this.db.prepare('SELECT COUNT(*) as count FROM user_premium');
    this._countTotalGuild = this.db.prepare('SELECT COUNT(*) as count FROM guild_premium');
    this._countExpiredUser = this.db.prepare('SELECT COUNT(*) as count FROM user_premium WHERE active = 0 OR (expires_at IS NOT NULL AND expires_at <= ?)');
    this._countExpiredGuild = this.db.prepare('SELECT COUNT(*) as count FROM guild_premium WHERE active = 0 OR (expires_at IS NOT NULL AND expires_at <= ?)');
  }

  grantUserPremium(userId: string, grantedBy: string, expiresAt: number | null = null, reason: string = 'Premium granted') {
    const now = Date.now();
    this._grantUserPremium.run(userId, grantedBy, now, expiresAt, reason, now);
  }

  grantGuildPremium(guildId: string, grantedBy: string, expiresAt: number | null = null, reason: string = 'Premium granted') {
    const now = Date.now();
    this._grantGuildPremium.run(guildId, grantedBy, now, expiresAt, reason, now);
  }

  revokeUserPremium(userId: string) {
    this._revokeUserPremium.run(Date.now(), userId);
  }

  revokeGuildPremium(guildId: string) {
    this._revokeGuildPremium.run(Date.now(), guildId);
  }

  isUserPremium(userId: string) {
    const premium = this._getUserPremium.get(userId, Date.now());
    if (!premium) return false;
    return {
      type: 'user',
      grantedBy: premium.granted_by,
      grantedAt: premium.granted_at,
      expiresAt: premium.expires_at,
      reason: premium.reason,
      isPermanent: premium.expires_at === null,
    };
  }

  isGuildPremium(guildId: string) {
    const premium = this._getGuildPremium.get(guildId, Date.now());
    if (!premium) return false;
    return {
      type: 'guild',
      grantedBy: premium.granted_by,
      grantedAt: premium.granted_at,
      expiresAt: premium.expires_at,
      reason: premium.reason,
      isPermanent: premium.expires_at === null,
    };
  }

  hasAnyPremium(userId: string, guildId: string) {
    const userPrem = this.isUserPremium(userId);
    if (userPrem) return userPrem;
    const guildPrem = this.isGuildPremium(guildId);
    if (guildPrem) return guildPrem;
    return false;
  }

  getAllUserPremiums() {
    return this._getAllUserPremiums.all(Date.now());
  }

  getAllGuildPremiums() {
    return this._getAllGuildPremiums.all(Date.now());
  }

  getExpiredPremiums() {
    const now = Date.now();
    return {
      users: this._getExpiredUsers.all(now),
      guilds: this._getExpiredGuilds.all(now),
    };
  }

  cleanupExpired() {
    let result = { usersRevoked: 0, guildsRevoked: 0, total: 0 };
    this.db.transaction(() => {
      const now = Date.now();
      const userRes = this._revokeExpiredUsers.run(now, now);
      const guildRes = this._revokeExpiredGuilds.run(now, now);
      result.usersRevoked = userRes.changes;
      result.guildsRevoked = guildRes.changes;
      result.total = userRes.changes + guildRes.changes;
    })();
    return result;
  }

  getStats() {
    const now = Date.now();
    const activeUsers = this._countActiveUser.get(now).count;
    const activeGuilds = this._countActiveGuild.get(now).count;
    const totalUsers = this._countTotalUser.get().count;
    const totalGuilds = this._countTotalGuild.get().count;
    const expiredUsers = this._countExpiredUser.get(now).count;
    const expiredGuilds = this._countExpiredGuild.get(now).count;

    return {
      active: { users: activeUsers, guilds: activeGuilds, total: activeUsers + activeGuilds },
      total: { users: totalUsers, guilds: totalGuilds, total: totalUsers + totalGuilds },
      expired: { users: expiredUsers, guilds: expiredGuilds, total: expiredUsers + expiredGuilds },
    };
  }

  extendPremium(type: string, id: string, additionalTime: number) {
    let current, newExpiresAt;
    if (type === 'user') {
      current = this._getUserPremium.get(id, -1);
      if (!current) return false;
      if (current.expires_at === null) return this.isUserPremium(id);
      newExpiresAt = Math.max(current.expires_at, Date.now()) + additionalTime;
      this._updateUserExpiresAt.run(newExpiresAt, Date.now(), id);
      return this.isUserPremium(id);
    } else {
      current = this._getGuildPremium.get(id, -1);
      if (!current) return false;
      if (current.expires_at === null) return this.isGuildPremium(id);
      newExpiresAt = Math.max(current.expires_at, Date.now()) + additionalTime;
      this._updateGuildExpiresAt.run(newExpiresAt, Date.now(), id);
      return this.isGuildPremium(id);
    }
  }

  deleteUserPremium(userId: string) {
    this._deleteUserPremium.run(userId);
  }

  deleteGuildPremium(guildId: string) {
    this._deleteGuildPremium.run(guildId);
  }
}

// Made by Nikhil Under CodeX Devs
