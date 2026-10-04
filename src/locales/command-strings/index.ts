/**
 * Command-level UI strings (Phase 5 localization completion).
 *
 * Keys are the exact English literals used at call sites. For English the
 * value IS the key, so en-US is derived from the union of every locale's keys
 * rather than restated — that makes locale parity structural instead of a
 * hand-maintained duplicate that can silently drift.
 *
 * `i18n.cmd(english, replacements)` looks up `cmd.<english>` first and falls
 * back to the interpolated English literal, so a missing key degrades to
 * English instead of crashing. `scripts/audit.ts` section C hard-fails when
 * any locale is missing a key, so the fallback should never actually be hit.
 */
import DE from './de';
import ES from './es';
import FR from './fr';
import HI from './hi';
import JA from './ja';
import KO from './ko';
import PT from './pt';
import RU from './ru';
import ZH from './zh';

export const CMD_LOCALES: Record<string, Record<string, string>> = {
	'de-DE': DE,
	'es-ES': ES,
	'fr-FR': FR,
	'hi-IN': HI,
	'ja-JP': JA,
	'ko-KR': KO,
	'pt-BR': PT,
	'ru-RU': RU,
	'zh-CN': ZH,
};

// Every key any locale declares, in a stable order.
const ALL_KEYS: string[] = Array.from(
	new Set(Object.values(CMD_LOCALES).flatMap((m) => Object.keys(m))),
).sort();

/** English values are identity: the key is already the English sentence. */
export const CMD_STRINGS: Record<string, Record<string, string>> = {
	'en-US': Object.fromEntries(ALL_KEYS.map((k) => [k, k])),
	...CMD_LOCALES,
};

export default CMD_STRINGS;

// Made by Nikhil Under CodeX Devs