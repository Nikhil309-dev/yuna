
import { localeStore } from "./localeStore.js";
import { i18n } from "./i18n.js";
import { EN_POOLS } from "./phrasePools.js";
import { config } from "#config/config";
import emoji from "#config/emoji";

/**
 * Centralized dynamic phrase & response manager for Yuna Bot.
 * Provides randomized response variations so user-facing messages never feel repetitive.
 */
export const phrases = {

  ...EN_POOLS,


  /**
   * Returns a random phrase from the specified pool category.
   * Resolution order: locale-defined phrases (via i18n) → embedded pools in
   * this module → i18n's generic error fallback.
   * @param {string} category
   * @param {Object} [replacements]
   * @returns {string}
   */
  get(category: string, replacements: Record<string, any> = {}): string {
    // The locale bound to the current request (user → guild → en-US). Locales
    // are bundled statically, so no async warm-up is required here.
    const locale = localeStore.getStore()?.locale || "en-US";

    // Locale file defines this category? Use the translated pool.
    const localized = i18n.getPhraseList(locale, category);
    if (localized) {
      return i18n.t(locale, category, replacements);
    }

    // Fall back to the embedded English pool for this category.
    const embedded = (this as unknown as Record<string, string[]>)[category];
    if (Array.isArray(embedded) && embedded.length > 0) {
      const template = embedded[Math.floor(Math.random() * embedded.length)];
      let out = template;
      for (const [key, value] of Object.entries(replacements)) {
        out = out.split(`\${${key}}`).join(String(value));
      }
      return out;
    }

    // Category missing everywhere — generic localized error.
    return i18n.t(locale, "errorGeneric", replacements);
  },

  /**
   * True when the category resolves in the active locale or the embedded pool.
   * Lets callers distinguish a real phrase from the generic error fallback of
   * `get()`, which would otherwise mask a mistyped category.
   * @param {string} category
   * @returns {boolean}
   */
  has(category: string): boolean {
    const locale = localeStore.getStore()?.locale || "en-US";
    if (i18n.getPhraseList(locale, category)) return true;
    const embedded = (this as unknown as Record<string, string[]>)[category];
    return Array.isArray(embedded) && embedded.length > 0;
  }
};

export default phrases;

// Made by Nikhil Under CodeX Devs
