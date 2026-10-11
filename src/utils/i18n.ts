/**
 * Yuna i18n core.
 *
 * Locales are imported statically (no fs/async race) so translations are
 * available the moment the module is loaded — commands, buttons and player
 * notifications can all resolve text synchronously.
 *
 * Two lookup styles are supported:
 *   • `t(locale, category, replacements)`  → randomized phrase pool (`phrases`)
 *   • `ui(locale, key, replacements)`      → deterministic UI string (`strings`)
 *
 * Both fall back to en-US and finally to the raw key, so a missing translation
 * degrades to English instead of showing `undefined`.
 */
import { localeStore } from "./localeStore.js";
import { logger } from "#utils/logger";

import enUS from "../locales/en-US.js";
import deDE from "../locales/de-DE.js";
import esES from "../locales/es-ES.js";
import frFR from "../locales/fr-FR.js";
import hiIN from "../locales/hi-IN.js";
import jaJP from "../locales/ja-JP.js";
import koKR from "../locales/ko-KR.js";
import ptBR from "../locales/pt-BR.js";
import ruRU from "../locales/ru-RU.js";
import zhCN from "../locales/zh-CN.js";
import { UI_STRINGS, MW_STRINGS, MENTION_STRINGS, COMMON_STRINGS, TITLE_STRINGS, BODY_STRINGS } from "../locales/ui-strings.js";
import { TITLE_EXTRA } from "../locales/title-strings-extra.js";
import { CMD_STRINGS } from "../locales/command-strings/index.js";

export interface LocaleMeta {
	name: string;
	nativeName: string;
	emoji: string;
}

export interface LocaleData {
	meta: LocaleMeta;
	phrases: Record<string, string[]>;
}

export const DEFAULT_LOCALE = "en-US";

/**
 * Maps bundled locale codes to Discord's application-command locale enum.
 * Discord only accepts a fixed set of codes for `name_localizations` /
 * `description_localizations`; several bundled codes are region-qualified
 * (`de-DE`, `fr-FR`, …) and are rejected unless trimmed to the bare language.
 * Codes not listed here (`en-US`, `es-ES`, `zh-CN`, …) are already valid.
 */
export const DISCORD_LOCALE_MAP: Record<string, string> = {
        "de-DE": "de",
        "fr-FR": "fr",
        "hi-IN": "hi",
        "ja-JP": "ja",
        "ko-KR": "ko",
        "ru-RU": "ru",
};

/** Converts a bundled locale code to the code Discord accepts for localizations. */
export function toDiscordLocale(code: string): string {
        return DISCORD_LOCALE_MAP[code] ?? code;
}

const BUNDLED: Record<string, LocaleData> = {
	"en-US": enUS as LocaleData,
	"de-DE": deDE as LocaleData,
	"es-ES": esES as LocaleData,
	"fr-FR": frFR as LocaleData,
	"hi-IN": hiIN as LocaleData,
	"ja-JP": jaJP as LocaleData,
	"ko-KR": koKR as LocaleData,
	"pt-BR": ptBR as LocaleData,
	"ru-RU": ruRU as LocaleData,
	"zh-CN": zhCN as LocaleData,
};

/** Interpolates both `${key}` and `{key}` placeholders. */
function interpolate(template: string, replacements: Record<string, any> = {}): string {
	if (!replacements || Object.keys(replacements).length === 0) return template;

	let out = template;
	for (const [key, value] of Object.entries(replacements)) {
		if (out.includes(`\${${key}}`)) {
			out = out.split(`\${${key}}`).join(String(value));
		}
		if (out.includes(`{${key}}`)) {
			out = out.split(`{${key}}`).join(String(value));
		}
	}
	return out;
}

class I18nManager {
	private locales: Map<string, LocaleData> = new Map();
	private uiCatalog: Map<string, Record<string, string>> = new Map();
	public readonly defaultLocale = DEFAULT_LOCALE;
	private loaded = false;

	constructor() {
		this.load();
	}

	private load(): void {
		if (this.loaded) return;

		this.locales.clear();
		for (const [code, data] of Object.entries(BUNDLED)) {
			if (data?.phrases) this.locales.set(code, data);
		}

		this.uiCatalog.clear();
		for (const [code, strings] of Object.entries(UI_STRINGS)) {
			this.uiCatalog.set(code, strings);
		}
		// Middleware, mention-card and shared dispatch strings share the same
		// catalog namespace, so a single `ui(locale, key)` lookup covers them.
		for (const catalog of [MW_STRINGS, MENTION_STRINGS, COMMON_STRINGS, BODY_STRINGS]) {
			for (const [code, strings] of Object.entries(catalog)) {
				this.uiCatalog.set(code, { ...(this.uiCatalog.get(code) || {}), ...strings });
			}
		}

		// Card titles are keyed by their English text — namespace them under `t.`
		// so `translateTitle()` can look them up without colliding with other keys.
		for (const [code, strings] of Object.entries(TITLE_STRINGS)) {
			const prefixed: Record<string, string> = {};
			for (const [title, value] of Object.entries(strings)) prefixed[`t.${title}`] = value;
			this.uiCatalog.set(code, { ...(this.uiCatalog.get(code) || {}), ...prefixed });
		}

		// Phase 5 completion titles — keys already carry the `t.` prefix, so
		// they merge directly into the catalog without re-prefixing.
		for (const [code, strings] of Object.entries(TITLE_EXTRA)) {
			this.uiCatalog.set(code, { ...(this.uiCatalog.get(code) || {}), ...strings });
		}

		// Command-level strings merge under the `cmd.` namespace so the English
		// literal keys never collide with other catalog keys.
		for (const [code, strings] of Object.entries(CMD_STRINGS)) {
			const namespaced: Record<string, string> = {};
			for (const [text, value] of Object.entries(strings)) {
				namespaced[`cmd.${text}`] = value;
			}
			this.uiCatalog.set(code, { ...(this.uiCatalog.get(code) || {}), ...namespaced });
		}

		this.loaded = true;
	}

	/**
	 * Kept for backwards compatibility — locales are now bundled statically, so
	 * this is synchronous and can never leave the locale table half-populated.
	 */
	public async init(): Promise<void> {
		this.load();
		logger.info(
			"i18n",
			`Loaded ${this.locales.size} languages: ${Array.from(this.locales.keys()).join(", ")}`,
		);
	}

	public getLocales(): Map<string, LocaleData> {
		this.load();
		return this.locales;
	}

	public hasLocale(locale: string | null | undefined): boolean {
		this.load();
		return !!locale && this.locales.has(this.normalize(locale));
	}

	/**
	 * Best-effort normalization: `de`, `DE`, `de_DE`, `de-DE` and `de-AT` all
	 * map onto the closest bundled locale so stale DB values keep working.
	 */
	public normalize(locale: string | null | undefined): string {
		this.load();
		if (!locale) return this.defaultLocale;

		const cleaned = String(locale).trim().replace(/_/g, "-");
		if (this.locales.has(cleaned)) return cleaned;

		const [lang] = cleaned.split("-");
		if (!lang) return this.defaultLocale;

		const lower = lang.toLowerCase();
		for (const code of this.locales.keys()) {
			if (code.split("-")[0].toLowerCase() === lower) return code;
		}
		return this.defaultLocale;
	}

	public getLocaleMeta(locale: string | null | undefined): LocaleMeta | null {
		this.load();
		return this.locales.get(this.normalize(locale))?.meta || null;
	}

	/**
	 * Returns the phrase list for a category if the locale (or the default)
	 * actually defines one — null when the category is missing so callers can
	 * fall back to their own embedded phrase pools.
	 */
	public getPhraseList(locale: string | null | undefined, category: string): string[] | null {
		this.load();
		const target = this.normalize(locale);
		const list =
			this.locales.get(target)?.phrases?.[category] ??
			this.locales.get(this.defaultLocale)?.phrases?.[category];
		return list && list.length > 0 ? list : null;
	}

	/** Randomized phrase lookup (used by `phrases.get`). */
	public t(locale: string | null | undefined, category: string, replacements: Record<string, any> = {}): string {
		this.load();
		const list = this.getPhraseList(locale, category);
		if (!list || list.length === 0) return this.ui(locale, "ui.error.title", replacements);

		const template = list[Math.floor(Math.random() * list.length)];
		return interpolate(template, replacements);
	}

	/** Deterministic UI-string lookup (card chrome, buttons, labels). */
	public ui(locale: string | null | undefined, key: string, replacements: Record<string, any> = {}): string {
		this.load();
		const target = this.normalize(locale);

		const value =
			this.uiCatalog.get(target)?.[key] ??
			this.uiCatalog.get(this.defaultLocale)?.[key];

		if (typeof value !== "string" || value.length === 0) return key;
		return interpolate(value, replacements);
	}

	/** Resolves the locale currently bound to the async context. */
	public activeLocale(): string {
		return localeStore.getStore()?.locale || this.defaultLocale;
	}

	/**
	 * Translates a card title that was authored as an English literal.
	 * Titles are looked up by their English text (`t.<English>`); unknown titles
	 * pass through unchanged so dynamic titles (song/playlist names) stay intact.
	 */
	public translateTitle(title: string | null | undefined): string {
		if (!title) return title ?? "";
		// Titles may be a literal ("Queue Cleared") or an explicit UI key
		// ("title.queueDashboard") — support both.
		if (title.includes(".")) return this.tr(title);
		const key = `t.${title}`;
		const translated = this.ui(this.activeLocale(), key);
		// `ui` echoes the key back when unknown — keep the original title then.
		return translated === key ? title : translated;
	}

	/**
	 * Localizes an authored English command string for the locale bound to the
	 * current async context. Keyed by the exact English literal so call sites
	 * stay readable — `i18n.cmd("Volume must be a number between 1 and 100.")`.
	 */
	public cmd(english: string, replacements: Record<string, any> = {}): string {
		this.load();
		const target = this.normalize(this.activeLocale());
		const key = `cmd.${english}`;
		const value =
			this.uiCatalog.get(target)?.[key] ??
			this.uiCatalog.get(this.defaultLocale)?.[key];
		if (typeof value !== "string" || value.length === 0) {
			// Unknown template — degrade to the interpolated English input.
			return interpolate(english, replacements);
		}
		return interpolate(value, replacements);
	}
	/** UI string for the locale bound to the current async context. */
	public tr(key: string, replacements: Record<string, any> = {}): string {
		return this.ui(this.activeLocale(), key, replacements);
	}

	/** Phrase pool lookup for the locale bound to the current async context. */
	public tp(category: string, replacements: Record<string, any> = {}): string {
		return this.t(this.activeLocale(), category, replacements);
	}
}

export const i18n = new I18nManager();

// Made by Nikhil Under CodeX Devs
