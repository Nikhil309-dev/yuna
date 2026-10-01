import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { logger } from "#utils/logger";

export interface LocaleMeta {
	name: string;
	nativeName: string;
	emoji: string;
}

export interface LocaleData {
	meta: LocaleMeta;
	phrases: Record<string, string[]>;
}

class I18nManager {
	private locales: Map<string, LocaleData> = new Map();
	private readonly defaultLocale = "en-US";

	constructor() {}

	public async init() {
		try {
			// ESM-safe equivalent of __dirname (this project is "type": "module").
			const currentDir = path.dirname(fileURLToPath(import.meta.url));
			const localesPath = path.join(currentDir, "..", "locales");
			const files = fs.readdirSync(localesPath).filter(f => f.endsWith(".ts") || f.endsWith(".js"));
			this.locales.clear();

			for (const file of files) {
				const localeCode = file.replace(/\.(ts|js)$/, "");
				const filePath = path.join(localesPath, file);

				// Dynamic import
				const localeModule = await import(filePath);
				this.locales.set(localeCode, localeModule.default);
			}
			if (this.locales.size === 0 || !this.locales.has(this.defaultLocale)) {
				throw new Error(`No usable locale files found in ${localesPath}`);
			}
			logger.info("i18n", `Loaded ${this.locales.size} languages: ${Array.from(this.locales.keys()).join(", ")}`);
		} catch (error) {
			logger.error("i18n", "Failed to load locales", error);
			throw error;
		}
	}

	public getLocales(): Map<string, LocaleData> {
		return this.locales;
	}

	/**
	 * Returns the phrase list for a category if the locale (or the default)
	 * actually defines one — null when the category is missing so callers can
	 * fall back to their own embedded phrase pools.
	 */
	public getPhraseList(locale: string | null | undefined, category: string): string[] | null {
		const target = locale || this.defaultLocale;
		const data = this.locales.get(target) || this.locales.get(this.defaultLocale);
		const list = data?.phrases?.[category];
		return list && list.length > 0 ? list : null;
	}

	public getLocaleMeta(locale: string): LocaleMeta | null {
		return this.locales.get(locale)?.meta || null;
	}

	public t(locale: string | null | undefined, category: string, replacements: Record<string, any> = {}): string {
		const targetLocale = locale || this.defaultLocale;
		let localeData = this.locales.get(targetLocale);

		if (!localeData) {
			localeData = this.locales.get(this.defaultLocale);
		}

		let list = localeData?.phrases?.[category];

		if (!list || list.length === 0) {
			list = this.locales.get(this.defaultLocale)?.phrases?.[category];
		}

		if (!list || list.length === 0) {
			list = this.locales.get(this.defaultLocale)?.phrases?.["errorGeneric"];
		}

		if (!list || list.length === 0) return "An error occurred.";

		let template = list[Math.floor(Math.random() * list.length)];

		for (const [key, value] of Object.entries(replacements)) {

			const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			template = template.replace(new RegExp(`\\$\\{${escapedKey}\\}`, "g"), String(value));
		}

		return template;
	}
}

export const i18n = new I18nManager();

// Made by Nikhil Under CodeX Devs
