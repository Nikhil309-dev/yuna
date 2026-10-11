import type BetterSqlite3Database from 'better-sqlite3';

export class CooldownRepo {
  public db: BetterSqlite3Database.Database;
  private _get: BetterSqlite3Database.Statement;
  private _upsert: BetterSqlite3Database.Statement;
  private _deleteExpired: BetterSqlite3Database.Statement;
  private _incrementViolation: BetterSqlite3Database.Statement;
  private _upsertViolation: BetterSqlite3Database.Statement;
  private _resetViolations: BetterSqlite3Database.Statement;

  constructor(db: BetterSqlite3Database.Database) {
    this.db = db;
    this._get = this.db.prepare(`
      SELECT key, user_id, command_name, last_used, violation_count, violation_timestamps, expires_at
      FROM command_cooldowns WHERE key = ?
    `);
    this._upsert = this.db.prepare(`
      INSERT INTO command_cooldowns (key, user_id, command_name, last_used, violation_count, violation_timestamps, expires_at)
      VALUES (?, ?, ?, ?, 0, '[]', ?)
      ON CONFLICT(key) DO UPDATE SET
        last_used = excluded.last_used,
        expires_at = excluded.expires_at,
        violation_count = 0,
        violation_timestamps = '[]'
    `);
    this._deleteExpired = this.db.prepare(`
      DELETE FROM command_cooldowns WHERE expires_at < ?
    `);
    this._incrementViolation = this.db.prepare(`
      UPDATE command_cooldowns
      SET violation_count = violation_count + 1,
          violation_timestamps = ?
      WHERE key = ?
    `);
    this._resetViolations = this.db.prepare(`
      UPDATE command_cooldowns
      SET violation_count = 0, violation_timestamps = '[]'
      WHERE key = ?
    `);
    this._upsertViolation = this.db.prepare(`
      INSERT INTO command_cooldowns (key, user_id, command_name, last_used, violation_count, violation_timestamps, expires_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        violation_count = violation_count + 1,
        violation_timestamps = excluded.violation_timestamps
    `);
  }

  private static key(userId: string, commandName: string, guildId: string): string {
    return `${userId}:${commandName}:${guildId}`;
  }

  get(userId: string, commandName: string, guildId: string) {
    this.purgeExpired();
    const row = this._get.get(CooldownRepo.key(userId, commandName, guildId));
    if (!row) return null;
    if (row.expires_at <= Date.now()) return null;
    return row;
  }

  set(userId: string, commandName: string, guildId: string, durationMs: number) {
    const now = Date.now();
    this._upsert.run(
      CooldownRepo.key(userId, commandName, guildId),
      userId,
      commandName,
      now,
      now + durationMs,
    );
  }

  recordViolation(userId: string, commandName: string, guildId: string, windowMs: number) {
    const key = CooldownRepo.key(userId, commandName, guildId);
    const now = Date.now();
    const row = this._get.get(key) as { violation_timestamps: string } | undefined;
    const cutoff = now - windowMs;
    const recent: number[] = row
      ? (JSON.parse(row.violation_timestamps) as number[]).filter((t) => t >= cutoff)
      : [];
    recent.push(now);
    if (!row) {

      this._upsertViolation.run(key, userId, commandName, now, JSON.stringify(recent), now + windowMs);
    } else {
      this._incrementViolation.run(JSON.stringify(recent), key);
    }
    const updated = this._get.get(key) as { violation_count: number };
    return updated.violation_count;
  }

  reset(userId: string, commandName: string, guildId: string) {
    this._resetViolations.run(CooldownRepo.key(userId, commandName, guildId));
  }

  purgeExpired() {
    this._deleteExpired.run(Date.now());
  }
}

// Made by Nikhil Under CodeX Devs
