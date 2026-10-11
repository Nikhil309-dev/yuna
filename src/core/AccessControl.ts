import { config } from '#config/config';
import { db } from '#database/Database';
import { TTLCache } from '#utils/cache';
import { GuildMember, Guild, GuildChannel } from 'discord.js';

const premiumCache = new TTLCache(60000, 1000);

export function invalidatePremiumCache(userId: string): void {
    if (!userId) return;
    for (const [key] of premiumCache.entries()) {
        if (key.startsWith(`${userId}-`)) premiumCache.delete(key);
    }
}

export function checkPermissions(member: GuildMember | null, requiredPerms: bigint[]): boolean {
    if (!requiredPerms || requiredPerms.length === 0) return true;
    if (!member) return false;
    return requiredPerms.every(perm => member.permissions.has(perm));
}

export function checkBotPermissions(guild: Guild | null, requiredPerms: bigint[], channel: GuildChannel | null = null): string[] {
    if (!guild || !requiredPerms || requiredPerms.length === 0) return [];

    const botMember = guild.members.me;
    if (!botMember) return [];

    const perms = channel ? botMember.permissionsIn(channel.id) : botMember.permissions;
    return requiredPerms
        .filter(perm => !perms.has(perm))
        .map(perm => perm.toString());
}

export function isPremium(userId: string, guildId?: string | null, type: 'user' | 'guild' | 'any' = 'any'): boolean {
    const cacheKey = `${userId}-${guildId}-${type}`;
    if (premiumCache.has(cacheKey)) {
        return premiumCache.get(cacheKey) as boolean;
    }

    let result = false;

    switch (type) {
        case 'user':
            result = !!db.isUserPremium?.(userId);
            break;
        case 'guild':
            result = guildId ? !!db.isGuildPremium?.(guildId) : false;
            break;
        case 'any':
        default:
            result = !!db.hasAnyPremium?.(userId, guildId ?? '');
            break;
    }

    premiumCache.set(cacheKey, result);
    return result;
}

export function isOwner(userId: string): boolean {
    return Array.isArray(config.ownerIds) && config.ownerIds.includes(userId);
}

export function isBlacklisted(userId: string, guildId?: string | null): boolean {
    const userBl = db.isUserBlacklisted?.(userId);
    const guildBl = guildId ? db.isGuildBlacklisted?.(guildId) : false;
    return !!(userBl || guildBl);
}

// Made by Nikhil Under CodeX Devs
