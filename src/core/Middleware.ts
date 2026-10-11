import { db } from '#database/Database';
import { buildError, buildBlocked } from '#ui/Theme';
import { checkPermissions, checkBotPermissions, isPremium, isOwner, isBlacklisted } from '../core/AccessControl';
import { AntiAbuse } from '../utils/AntiAbuse';
import { GuildMember, Guild, GuildChannel, User } from 'discord.js';
import { i18n } from '#utils/i18n.js';

export interface MiddlewareContext {
  client: any;
  user: User;
  member: GuildMember | null;
  guild: Guild | null;
  channel: GuildChannel | null;
}

export class Middleware {

  static anti = new AntiAbuse(db.cooldowns);

  static async run(ctx: MiddlewareContext, command: any): Promise<{pass: boolean, response?: any}> {
    const { client, user, member, guild, channel } = ctx;
    const userId = user.id;
    const guildId = guild?.id;

    const tr = (key: string, replacements?: Record<string, any>) => i18n.tr(key, replacements);

    const avatar = user?.displayAvatarURL?.({ size: 128 });
    const errorCard = (opts: any) => buildError(opts, undefined, avatar);
    const pool = (category: string, replacements?: Record<string, any>) =>
      i18n.t(i18n.activeLocale(), category, replacements);

    if (isBlacklisted(userId, guildId)) {
      return {
        pass: false,
        response: buildBlocked(
          { issue: tr('mw.blacklisted.issue'), tip: tr('mw.blacklisted.tip') },
          tr('mw.blacklisted.title'),
          avatar
        )
      };
    }

    if (command.maintenance && !isOwner(userId)) {
      return {
        pass: false,
        response: errorCard({
          title: tr('mw.maintenance.title'),
          issue: tr('mw.maintenance.issue', { command: command.name }),
          tip: tr('ui.error.contact')
        })
      };
    }

    if (this.anti.isBlacklisted(userId, command.name, guildId ?? 'dm')) {
      return {
        pass: false,
        response: buildBlocked(
          { issue: tr('mw.rateLimited.issue', { command: command.name }), tip: tr('mw.cooldown.title') },
          tr('mw.rateLimited.title'),
          avatar
        )
      };
    }

    const cooldownTime = this.checkCooldown(userId, command, guildId);
    if (cooldownTime > 0) {
      const violations = this.anti.recordViolation(userId, command.name, guildId ?? 'dm');
      const escalated = violations >= 5;
      return {
        pass: false,
        response: errorCard({
          title: escalated ? tr('mw.rateLimited.title') : tr('mw.cooldown.title'),
          issue: escalated
            ? tr('mw.rateLimited.issue', { command: command.name })
            : tr('mw.cooldown.issue', { time: cooldownTime }),
          tip: escalated
            ? tr('ui.warning.action')
            : undefined
        })
      };
    }

    if (command.access?.ownerOnly && !isOwner(userId)) {
      return {
        pass: false,
        response: errorCard({
          title: tr('mw.devOnly.title'),
          issue: pool('devOnly'),
          tip: tr('ui.error.contact')
        })
      };
    }

    if (command.access?.permissions?.length > 0) {
      if (!checkPermissions(member, command.access.permissions)) {
        return {
          pass: false,
          response: errorCard({
            title: tr('mw.permissions.title'),
            issue: tr('mw.permissions.issue'),
            tip: `Required: \`${command.access.permissions.join(', ')}\``
          })
        };
      }
    }

    if (command.access?.botPermissions?.length > 0) {
      const missing = checkBotPermissions(guild, command.access.botPermissions, channel);
      if (missing.length > 0) {
        return {
          pass: false,
          response: errorCard({
            title: tr('mw.botPermissions.title'),
            issue: tr('mw.botPermissions.issue'),
            tip: `Missing: \`${missing.join(', ')}\``
          })
        };
      }
    }

    if (command.access?.premium) {
      if (!isPremium(userId, guildId, command.access.premium)) {
        return {
          pass: false,
          response: errorCard({
            title: tr('mw.premium.title'),
            issue: tr('mw.premium.issue', { tier: command.access.premium }),
            tip: tr('mw.premium.tip')
          })
        };
      }
    }

    if (command.access?.voice && !member?.voice?.channel) {
      return {
        pass: false,
        response: errorCard({
          title: tr('mw.voice.title'),
          issue: pool('voiceRequired'),
          tip: tr('ui.error.contact')
        })
      };
    }

    if (command.access?.sameVoice && guild?.members?.me?.voice?.channel) {
      if (member?.voice?.channelId !== guild.members.me.voice.channelId) {
        return {
          pass: false,
          response: errorCard({
            title: tr('mw.sameVoice.title'),
            issue: pool('sameVoiceRequired'),
            tip: `Join <#${guild.members.me.voice.channelId}>`
          })
        };
      }
    }

    if (command.access?.player || command.access?.playing) {
      const player = client.music?.getPlayer(guildId as string);

      if (command.access?.player && !player) {
        return {
          pass: false,
          response: errorCard({
            title: tr('mw.noPlayer.title'),
            issue: pool('playerRequired'),
            tip: tr('ui.error.contact')
          })
        };
      }

      if (command.access?.playing && (!player || !player.queue?.current)) {
        return {
          pass: false,
          response: errorCard({
            title: tr('mw.playing.title'),
            issue: pool('noTrackPlaying'),
            tip: tr('ui.error.contact')
          })
        };
      }
    }

    this.setCooldown(userId, command, guildId);

    return { pass: true };
  }

  static checkCooldown(userId: string, command: any, guildId?: string | null): number {
    if (!command.cooldown) return 0;

    const keyGuild = guildId ?? 'dm';
    if (this.anti.isBlacklisted(userId, command.name, keyGuild)) return command.cooldown;

    const remainingMs = this.anti.getCooldown(userId, command.name, keyGuild);
    if (remainingMs <= 0) return 0;

    return Math.ceil(remainingMs / 1000);
  }

  static setCooldown(userId: string, command: any, guildId?: string | null): void {
    if (!command.cooldown) return;

    const keyGuild = guildId ?? 'dm';
    const hasPremium = isPremium(userId, null, 'user');
    const durationMs = command.cooldown * (hasPremium ? 0.5 : 1) * 1000;

    this.anti.setCooldown(userId, command.name, keyGuild, durationMs);
  }
}

export default Middleware;

// Made by Nikhil Under CodeX Devs
