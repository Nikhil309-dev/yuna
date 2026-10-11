import { localeStore } from "./localeStore.js";
import { i18n } from "./i18n.js";
import { EN_POOLS } from "./phrasePools.js";

export const phrases = {

  ...EN_POOLS,

  get(category: string, replacements: Record<string, any> = {}): string {

    const locale = localeStore.getStore()?.locale || "en-US";

    const localized = i18n.getPhraseList(locale, category);
    if (localized) {
      return i18n.t(locale, category, replacements);
    }

    const embedded = (this as unknown as Record<string, string[]>)[category];
    if (Array.isArray(embedded) && embedded.length > 0) {
      const template = embedded[Math.floor(Math.random() * embedded.length)];
      let out = template;
      for (const [key, value] of Object.entries(replacements)) {
        out = out.split(`\${${key}}`).join(String(value));
      }
      return out;
    }

    return i18n.t(locale, "errorGeneric", replacements);
  },

  has(category: string): boolean {
    const locale = localeStore.getStore()?.locale || "en-US";
    if (i18n.getPhraseList(locale, category)) return true;
    const embedded = (this as unknown as Record<string, string[]>)[category];
    return Array.isArray(embedded) && embedded.length > 0;
  }
};

export default phrases;

// Made by Nikhil Under CodeX Devs
