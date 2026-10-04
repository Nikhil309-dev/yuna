/**
 * Locale resolution + propagation helpers.
 *
 * Resolution order (highest priority first):
 *   1. the user's personal `/language` preference
 *   2. the server's `/server-language` default
 *   3. en-US
 *
 * The resolved locale is pushed into an AsyncLocalStorage scope for the whole
 * request so `i18n.tr()` / `phrases.get()` — including anything they call
 * further down the stack — automatically speak the right language.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "#database/Database";
import { i18n, DEFAULT_LOCALE } from "./i18n.js";
import { localeStore } from "./localeStore.js";

export { DEFAULT_LOCALE };

/** Resolves the effective locale for a user/guild pair. */
export function localeFor(userId?: string | null, guildId?: string | null): string {
	let userLocale: string | null = null;
	let guildLocale: string | null = null;

	try {
		if (userId) userLocale = db?.user?.getLocale?.(userId) ?? null;
	} catch {
		/* database not ready yet — fall through to the guild/default locale */
	}

	try {
		if (guildId) guildLocale = db?.guild?.getLocale?.(guildId) ?? null;
	} catch {
		/* ignore */
	}

	return i18n.normalize(userLocale || guildLocale || DEFAULT_LOCALE);
}

/** Locale of the current async context (falls back to en-US). */
export function currentLocale(): string {
	return localeStore.getStore()?.locale || DEFAULT_LOCALE;
}

/** Runs `fn` with the given locale bound to the async context. */
export function runWithLocale<T>(locale: string | null | undefined, fn: () => T): T {
	return localeStore.run({ locale: i18n.normalize(locale || DEFAULT_LOCALE) }, fn);
}

/** Runs `fn` inside the locale scope of an interaction's author + guild. */
export function runWithInteractionLocale<T>(
	interaction: any,
	fn: () => T,
): T {
	const userId = interaction?.user?.id ?? interaction?.member?.id ?? null;
	const guildId = interaction?.guildId ?? interaction?.guild?.id ?? null;
	return runWithLocale(localeFor(userId, guildId), fn);
}

/** UI string for the locale bound to the current async context. */
export function tr(key: string, replacements: Record<string, any> = {}): string {
	return i18n.tr(key, replacements);
}

/** UI string for an explicit locale. */
export function trFor(locale: string | null | undefined, key: string, replacements: Record<string, any> = {}): string {
	return i18n.ui(locale, key, replacements);
}

/** UI string for a guild's configured language — for out-of-context events. */
export function trGuild(guildId: string | null | undefined, key: string, replacements: Record<string, any> = {}): string {
	return i18n.ui(localeFor(null, guildId), key, replacements);
}

/** Creates a translator bound to one locale (handy inside collectors). */
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
