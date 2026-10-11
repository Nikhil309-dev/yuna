/**
 * Yuna Centralized Music Source Configuration
 *
 * Change default search provider, fallback priority, and autoplay recommendations in ONE single place!
 */

// SoundCloud needs no login/PO-token and streams without bot-protection, so it
// is the safe default. Override with DEFAULT_MUSIC_SOURCE (e.g. youtube, spotify).
const DEFAULT_SOURCE = process.env.DEFAULT_MUSIC_SOURCE || 'soundcloud';

const PREFIX_MAP: Record<string, string> = {
  spotify: 'spsearch:',
  youtube: 'ytsearch:',
  youtubemusic: 'ytmsearch:',
  soundcloud: 'scsearch:',
  applemusic: 'amsearch:',
  deezer: 'dzsearch:',
  gaana: 'gaanasearch:',
  jiosaavn: 'jssearch:'
};

const RECOMMENDATION_MAP: Record<string, string> = {
  spotify: 'sprec:',
  youtube: 'ytrec:',
  soundcloud: 'screc:',
  jiosaavn: 'jssearch:'
};

const primarySource = DEFAULT_SOURCE.toLowerCase();
const primaryPrefix = PREFIX_MAP[primarySource] || 'spsearch:';
const autoplayPrefix = RECOMMENDATION_MAP[primarySource] || 'sprec:';

export default {
  /**
   * Active primary music source name (e.g. 'spotify', 'youtube', 'soundcloud', 'jiosaavn')
   */
  PRIMARY_SOURCE: primarySource,

  /**
   * Active primary search prefix (e.g. 'spsearch:', 'ytsearch:', 'scsearch:', 'jssearch:')
   */
  PRIMARY_PREFIX: primaryPrefix,

  /**
   * Active autoplay recommendation prefix (e.g. 'sprec:', 'ytrec:', 'screc:', 'jssearch:')
   */
  AUTOPLAY_PREFIX: autoplayPrefix,

  /**
   * Priority list of fallback search prefixes if primary source yields no results
   */
  FALLBACK_SOURCES: [primaryPrefix, 'spsearch:', 'ytsearch:', 'jssearch:'].filter(
    (prefix, index, self) => self.indexOf(prefix) === index
  ),

  /**
   * Formats a raw search string into the active primary search prefix if no protocol/prefix is given.
   * @param {string} query - Raw search query or URL
   * @returns {string} Formatted search query
   */
  formatQuery(query: any) {
    if (!query) return '';
    const trimmed = query.trim();
    if (/^(https?:\/\/|[a-z0-9_-]+:)/i.test(trimmed)) {
      return trimmed;
    }
    return `${this.PRIMARY_PREFIX}${trimmed}`;
  },

  /**
   * Returns list of search prefixes to try in order of priority.
   * @returns {string[]} List of search prefixes
   */
  getPrefixList() {
    return this.FALLBACK_SOURCES;
  }
};

// Made by Nikhil Under CodeX Devs
