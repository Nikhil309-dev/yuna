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

  PRIMARY_SOURCE: primarySource,

  PRIMARY_PREFIX: primaryPrefix,

  AUTOPLAY_PREFIX: autoplayPrefix,

  FALLBACK_SOURCES: [primaryPrefix, 'spsearch:', 'ytsearch:', 'jssearch:'].filter(
    (prefix, index, self) => self.indexOf(prefix) === index
  ),

  formatQuery(query: any) {
    if (!query) return '';
    const trimmed = query.trim();
    if (/^(https?:\/\/|[a-z0-9_-]+:)/i.test(trimmed)) {
      return trimmed;
    }
    return `${this.PRIMARY_PREFIX}${trimmed}`;
  },

  getPrefixList() {
    return this.FALLBACK_SOURCES;
  }
};

// Made by Nikhil Under CodeX Devs
