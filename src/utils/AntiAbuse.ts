import { logger } from '#utils/logger';
import { BloomFilter } from './BloomFilter';
import type { CooldownRepo } from '#database/repositories/CooldownRepo';

const VIOLATION_WINDOW_MS = 60_000;
const MAX_VIOLATIONS = 5;

const BLACKLIST_TTL_MS = 5 * 60 * 1000;

export class AntiAbuse {
  public cooldowns = new Map<string, number>();
  public violations = new Map<string, number[]>();

  public blacklist = new Map<string, number>();
  public dupFilter: BloomFilter;

  constructor(private cooldownRepo?: CooldownRepo) {
    this.dupFilter = new BloomFilter(2048, 0.01);
  }

  getCooldown(userId: string, commandName: string, guildId: string): number {
    if (this.cooldownRepo) {
      const row = this.cooldownRepo.get(userId, commandName, guildId);
      if (!row) return 0;
      const remaining = row.expires_at - Date.now();
      return remaining > 0 ? remaining : 0;
    }
    const key = `${userId}:${commandName}:${guildId}`;
    const expires = this.cooldowns.get(key);
    if (!expires) return 0;
    const remaining = expires - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  setCooldown(userId: string, commandName: string, guildId: string, ms: number) {
    if (this.cooldownRepo) {
      this.cooldownRepo.set(userId, commandName, guildId, ms);
      this.cooldownRepo.reset(userId, commandName, guildId);
      return;
    }
    const key = `${userId}:${commandName}:${guildId}`;
    this.cooldowns.set(key, Date.now() + ms);
    this.violations.delete(key);
  }

  recordViolation(userId: string, commandName: string, guildId: string): number {
    const key = `${userId}:${commandName}:${guildId}`;
    const now = Date.now();
    const windowStart = now - VIOLATION_WINDOW_MS;
    const prior = (this.violations.get(key) ?? []).filter((t) => t >= windowStart);
    prior.push(now);
    this.violations.set(key, prior);

    let effectiveCount = prior.length;
    if (this.cooldownRepo) {
      const persisted = this.cooldownRepo.recordViolation(userId, commandName, guildId, VIOLATION_WINDOW_MS);
      effectiveCount = Math.max(effectiveCount, persisted);
    }

    if (effectiveCount >= MAX_VIOLATIONS) {
      this.blacklist.set(key, Date.now() + BLACKLIST_TTL_MS);
      logger.warn(
        'AntiAbuse',
        `Auto-blacklisted ${key} for ${BLACKLIST_TTL_MS / 1000}s after ${effectiveCount} violations in ${VIOLATION_WINDOW_MS}ms`,
      );
    }
    return effectiveCount;
  }

  isBlacklisted(userId: string, commandName: string, guildId: string): boolean {
    const key = `${userId}:${commandName}:${guildId}`;
    const expiresAt = this.blacklist.get(key);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      this.blacklist.delete(key);
      return false;
    }
    return true;
  }

  clearBlacklist(userId: string, commandName: string, guildId: string) {
    this.blacklist.delete(`${userId}:${commandName}:${guildId}`);
  }

  seenRecently(token: string): boolean {
    if (this.dupFilter.has(token)) return true;
    this.dupFilter.add(token);
    return false;
  }
}

// Made by Nikhil Under CodeX Devs
