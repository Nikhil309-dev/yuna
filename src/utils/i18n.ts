import { localeStore } from "./localeStore.js";
import { EN_POOLS } from "./phrasePools.js";
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

export const DISCORD_LOCALE_MAP: Record<string, string> = {
        "de-DE": "de",
        "fr-FR": "fr",
        "hi-IN": "hi",
        "ja-JP": "ja",
        "ko-KR": "ko",
        "ru-RU": "ru",
};

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

		for (const catalog of [MW_STRINGS, MENTION_STRINGS, COMMON_STRINGS, BODY_STRINGS]) {
			for (const [code, strings] of Object.entries(catalog)) {
				this.uiCatalog.set(code, { ...(this.uiCatalog.get(code) || {}), ...strings });
			}
		}

		for (const [code, strings] of Object.entries(TITLE_STRINGS)) {
			const prefixed: Record<string, string> = {};
			for (const [title, value] of Object.entries(strings)) prefixed[`t.${title}`] = value;
			this.uiCatalog.set(code, { ...(this.uiCatalog.get(code) || {}), ...prefixed });
		}

		for (const [code, strings] of Object.entries(TITLE_EXTRA)) {
			this.uiCatalog.set(code, { ...(this.uiCatalog.get(code) || {}), ...strings });
		}

		for (const [code, strings] of Object.entries(CMD_STRINGS)) {
			const namespaced: Record<string, string> = {};
			for (const [text, value] of Object.entries(strings)) {
				namespaced[`cmd.${text}`] = value;
			}
			this.uiCatalog.set(code, { ...(this.uiCatalog.get(code) || {}), ...namespaced });
		}

		this.loaded = true;
	}

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

	public getPhraseList(locale: string | null | undefined, category: string): string[] | null {
		this.load();
		const target = this.normalize(locale);
		const list =
			this.locales.get(target)?.phrases?.[category] ??
			this.locales.get(this.defaultLocale)?.phrases?.[category];
		return list && list.length > 0 ? list : null;
	}

	public t(locale: string | null | undefined, category: string, replacements: Record<string, any> = {}): string {
		this.load();

		const list = this.getPhraseList(locale, category) || EN_POOLS[category] || null;
		if (!list || list.length === 0) return this.t(locale, "errorGeneric", replacements);

		const template = list[Math.floor(Math.random() * list.length)];
		return interpolate(template, replacements);
	}

	public ui(locale: string | null | undefined, key: string, replacements: Record<string, any> = {}): string {
		this.load();
		const target = this.normalize(locale);

		const value =
			this.uiCatalog.get(target)?.[key] ??
			this.uiCatalog.get(this.defaultLocale)?.[key];

		if (typeof value !== "string" || value.length === 0) return key;
		return interpolate(value, replacements);
	}

	public activeLocale(): string {
		return localeStore.getStore()?.locale || this.defaultLocale;
	}

	public translateTitle(title: string | null | undefined): string {
		if (!title) return title ?? "";

		if (title.includes(".")) return this.tr(title);
		const key = `t.${title}`;
		const translated = this.ui(this.activeLocale(), key);

		return translated === key ? title : translated;
	}

	public cmd(english: string, replacements: Record<string, any> = {}): string {
		this.load();
		const target = this.normalize(this.activeLocale());
		const key = `cmd.${english}`;
		const value =
			this.uiCatalog.get(target)?.[key] ??
			this.uiCatalog.get(this.defaultLocale)?.[key];
		if (typeof value !== "string" || value.length === 0) {

			return interpolate(english, replacements);
		}
		return interpolate(value, replacements);
	}

	public tr(key: string, replacements: Record<string, any> = {}): string {
		return this.ui(this.activeLocale(), key, replacements);
	}

	public tp(category: string, replacements: Record<string, any> = {}): string {
		return this.t(this.activeLocale(), category, replacements);
	}
}

export const i18n = new I18nManager();

// Made by Nikhil Under CodeX Devs
