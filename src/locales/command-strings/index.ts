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

const ALL_KEYS: string[] = Array.from(
	new Set(Object.values(CMD_LOCALES).flatMap((m) => Object.keys(m))),
).sort();

export const CMD_STRINGS: Record<string, Record<string, string>> = {
	'en-US': Object.fromEntries(ALL_KEYS.map((k) => [k, k])),
	...CMD_LOCALES,
};

export default CMD_STRINGS;

// Made by Nikhil Under CodeX Devs
