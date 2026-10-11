import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "#database/Database";
import { i18n, DEFAULT_LOCALE } from "./i18n.js";
import { localeStore } from "./localeStore.js";

export { DEFAULT_LOCALE };

export function localeFor(userId?: string | null, guildId?: string | null): string {
	let userLocale: string | null = null;
	let guildLocale: string | null = null;

	try {
		if (userId) userLocale = db?.user?.getLocale?.(userId) ?? null;
	} catch {
	}

	try {
		if (guildId) guildLocale = db?.guild?.getLocale?.(guildId) ?? null;
	} catch {
	}

	return i18n.normalize(userLocale || guildLocale || DEFAULT_LOCALE);
}

export function currentLocale(): string {
	return localeStore.getStore()?.locale || DEFAULT_LOCALE;
}

export function runWithLocale<T>(locale: string | null | undefined, fn: () => T): T {
	return localeStore.run({ locale: i18n.normalize(locale || DEFAULT_LOCALE) }, fn);
}

export function runWithInteractionLocale<T>(
	interaction: any,
	fn: () => T,
): T {
	const userId = interaction?.user?.id ?? interaction?.member?.id ?? null;
	const guildId = interaction?.guildId ?? interaction?.guild?.id ?? null;
	return runWithLocale(localeFor(userId, guildId), fn);
}

export function tr(key: string, replacements: Record<string, any> = {}): string {
	return i18n.tr(key, replacements);
}

export function trFor(locale: string | null | undefined, key: string, replacements: Record<string, any> = {}): string {
	return i18n.ui(locale, key, replacements);
}

export function trGuild(guildId: string | null | undefined, key: string, replacements: Record<string, any> = {}): string {
	return i18n.ui(localeFor(null, guildId), key, replacements);
}

export function translator(locale: string | null | undefined) {
	const target = i18n.normalize(locale || DEFAULT_LOCALE);
	return {
		locale: target,
		ui: (key: string, replacements: Record<string, any> = {}) => i18n.ui(target, key, replacements),
		phrase: (category: string, replacements: Record<string, any> = {}) => i18n.t(target, category, replacements),
	};
}

export { localeStore, AsyncLocalStorage };

// Made by Nikhil Under CodeX Devs
