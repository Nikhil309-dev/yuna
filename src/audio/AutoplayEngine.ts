import { logger } from "#utils/logger";
import { db } from "#database/Database";
import sources from "#config/sources";

import { Client } from "discord.js";
import { Player, Track } from "lavalink-client";

export class AutoplayEngine {
  public client: Client & { music?: any };

  public sessionHistory: Map<string, Set<string>>;
  private static _sessionHistory = new Map<string, Set<string>>();
  constructor(client: Client & { music?: any }) {
    this.client = client;
    this.sessionHistory = AutoplayEngine._sessionHistory;
  }

  clearSessionHistory(guildId: string) {
    AutoplayEngine._sessionHistory.delete(guildId);
  }

  _normalizeString(str: string): string {
    if (!str) return "";
    return str
      .toLowerCase()
      .replace(/[\(\[][^\)\]]*(?:official|video|audio|lyrics|lyric|hd|hq|mv|visualizer|remix|edit|full song|new song|202[0-9])[\)\]]/gi, "")
      .replace(/[\(\[](?:feat|ft)\.?\s*[^\)\]]*[\)\]]/gi, "")
      .replace(/\|.*$/gi, "")
      .replace(/ - Topic$/i, "")
      .replace(/VEVO$/i, "")
      .replace(/[^\w\s]/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  _cleanTrackMetadata(rawTitle: string = "", rawAuthor: string = "") {
    let title = rawTitle
      .replace(/[\(\[][^\)\]]*(?:official|video|audio|lyrics|lyric|hd|hq|mv|visualizer|remix|edit|full song|new song|202[0-9])[\)\]]/gi, "")
      .replace(/\|.*$/gi, "")
      .replace(/ - Topic$/i, "")
      .replace(/VEVO$/i, "")
      .replace(/[\(\[](?:feat|ft)\.?\s*[^\)\]]*[\)\]]/gi, "")
      .trim();

    let author = rawAuthor
      .replace(/ - Topic$/i, "")
      .replace(/VEVO$/i, "")
      .trim();

    if (title.includes(" - ")) {
      const parts = title.split(" - ");
      if (parts.length >= 2) {
        if (!author || author.toLowerCase().includes("various") || author.toLowerCase().includes("topic")) {
          author = parts[0].trim();
        }
        title = parts[1].trim();
      }
    }

    const cleanArtist = this._normalizeString(author);
    const primaryArtist = cleanArtist.split(/,|\bfeat\b|\bft\b|&|\bx\b/i)[0].trim() || cleanArtist;

    return {
      cleanTitle: this._normalizeString(title),
      cleanArtist,
      primaryArtist,
      rawTitle,
      rawAuthor
    };
  }

  _getTrackSignature(track: Track): string {
    if (!track?.info) return "";
    const { cleanTitle, cleanArtist } = this._cleanTrackMetadata(track.info.title, track.info.author);
    return `${cleanArtist}:${cleanTitle}`;
  }

  async _raceQueries(queries: string[], limit: number): Promise<Track[]> {
    if (!queries.length) return [];

    const attempts = queries.map((q) =>
      this.client.music.search(q).then((res: any) => {
        if (res?.tracks?.length > 0) return { query: q, tracks: res.tracks };
        throw new Error("empty result");
      })
    );

    try {
      const winner = await Promise.any(attempts);
      logger.info("AutoplayEngine", `Found ${winner.tracks.length} tracks using query: "${winner.query}"`);
      return winner.tracks.slice(0, limit);
    } catch {
      return [];
    }
  }

  async getRecommendations(player: Player, lastTrack: Track, limit: number = 10) {
    const guildId = player.guildId;
    const previousTracks = player.queue?.previous || [];
    const contextTracks = [...previousTracks.slice(-5), lastTrack].filter(Boolean) as Track[];

    let rawRecommendations = await this._getNativeRecommendation(contextTracks, limit);

    if (rawRecommendations.length === 0) {
      rawRecommendations = await this._getMultiSourceRecommendations(contextTracks, limit);
    }

    if (rawRecommendations.length === 0) {
      rawRecommendations = await this._getSafetyNetTracks(contextTracks, limit);
    }

    try {
      const requesterId = player.get("autoplaySetBy") || lastTrack?.requester?.id;
      if (requesterId) {
        const personalized = await this._getPersonalizedTrack(requesterId as string);
        if (personalized) {
          const injectIndex = Math.min(2, rawRecommendations.length);
          rawRecommendations.splice(injectIndex, 0, personalized);
        }
      }
    } catch (err) {
      logger.debug("AutoplayEngine", "Failed to inject personalized track:", err);
    }

    let filteredRecommendations = this._filterDuplicates(guildId, contextTracks, rawRecommendations, true);

    if (filteredRecommendations.length === 0 && rawRecommendations.length > 0) {
      logger.info("AutoplayEngine", "Relaxing artist diversity filter to maintain playback flow");
      filteredRecommendations = this._filterDuplicates(guildId, contextTracks, rawRecommendations, false);
    }

    if (filteredRecommendations.length === 0) {
      logger.warn("AutoplayEngine", "All recommendations filtered. Triggering safety net guarantee...");
      const safetyTracks = await this._getSafetyNetTracks(contextTracks, limit, true);
      filteredRecommendations = this._filterDuplicates(guildId, contextTracks, safetyTracks, false);
    }

    return filteredRecommendations.slice(0, limit).map((track, i) => ({
      name: track.info.title,
      artist: track.info.author,
      url: track.info.uri,
      match: 0.95 - i * 0.05,
      trackInfo: track,
      index: i
    }));
  }

  async _getNativeRecommendation(contextTracks: Track[], limit: number): Promise<Track[]> {
    try {
      const lastTrack = contextTracks[contextTracks.length - 1];
      if (!lastTrack?.info) return [];

      const identifier = lastTrack.info.identifier || lastTrack.info.uri;
      const res = await this.client.music.search(`ytrec:${identifier}`);

      if (res?.tracks?.length > 0) {
        logger.info("AutoplayEngine", `Native ytrec found ${res.tracks.length} tracks`);
        return res.tracks.slice(0, limit);
      }
    } catch (error: any) {
      logger.debug("AutoplayEngine", `Native recommendation failed: ${error.message}`);
    }
    return [];
  }

  async _getMultiSourceRecommendations(contextTracks: Track[], limit: number): Promise<Track[]> {
    const lastTrack = contextTracks[contextTracks.length - 1];
    if (!lastTrack?.info) return [];

    const { cleanArtist, cleanTitle } = this._cleanTrackMetadata(lastTrack.info.title, lastTrack.info.author);
    if (!cleanArtist) return [];

    const prefixes = sources.getPrefixList();
    const queries = prefixes.flatMap((prefix: string) => [
      `${prefix}${cleanArtist} ${cleanTitle} mix`,
      `${prefix}${cleanArtist}`
    ]);

    return this._raceQueries(queries, limit);
  }

  async _getSafetyNetTracks(contextTracks: Track[], limit: number, forceTrending: boolean = false): Promise<Track[]> {
    const lastTrack = contextTracks[contextTracks.length - 1];
    const { cleanArtist, primaryArtist } = this._cleanTrackMetadata(lastTrack?.info?.title, lastTrack?.info?.author);
    const targetArtist = primaryArtist || cleanArtist;
    const p = sources.PRIMARY_PREFIX;

    const queries = [];
    if (targetArtist && !forceTrending) {
      queries.push(`${p}${targetArtist} top songs`, `${p}${targetArtist}`);
    }
    queries.push(`${p}trending top hits`, `${p}top songs`);

    return this._raceQueries(queries, limit);
  }

  async _getPersonalizedTrack(userId: string): Promise<Track | null> {
    try {
      const report = (db as any).stats.getFullReport(userId, "month");
      if (report?.topTracks?.length > 0) {
        const randomTop = report.topTracks[Math.floor(Math.random() * report.topTracks.length)];
        const query = sources.formatQuery(`${randomTop.artist} ${randomTop.title}`);
        const res = await this.client.music.search(query);
        if (res?.tracks?.length > 0) return res.tracks[0];
      }
    } catch (error) {
      logger.debug("AutoplayEngine", "Personalization fetch failed", error);
    }
    return null;
  }

  _filterDuplicates(guildId: string, contextTracks: Track[], recommendations: Track[], enforceArtistDiversity: boolean = true): Track[] {
    if (!this.sessionHistory.has(guildId)) {
      this.sessionHistory.set(guildId, new Set());
    }
    const history = this.sessionHistory.get(guildId)!;

    const recentArtists = new Set<string>();
    contextTracks.forEach((t) => {
      if (t?.info) {
        history.add(t.info.identifier || t.info.uri!);
        const sig = this._getTrackSignature(t);
        if (sig) history.add(sig);

        const { cleanArtist } = this._cleanTrackMetadata(t.info.title, t.info.author);
        if (cleanArtist) recentArtists.add(cleanArtist);
      }
    });

    const validRecs: Track[] = [];
    for (const track of recommendations) {
      if (!track?.info) continue;

      const id = track.info.identifier || track.info.uri!;
      const sig = this._getTrackSignature(track);
      const titleLower = track.info.title.toLowerCase();

      const isDuplicate = history.has(id) || (sig && history.has(sig));

      if (!isDuplicate && !titleLower.includes("karaoke") && !titleLower.includes("instrumental")) {
        validRecs.push(track);
      }
    }

    if (!enforceArtistDiversity) {
      validRecs.forEach((track) => {
        const id = track.info.identifier || track.info.uri!;
        const sig = this._getTrackSignature(track);
        history.add(id);
        if (sig) history.add(sig);
      });
      return validRecs;
    }

    const differentArtistRecs = validRecs.filter((track) => {
      const { cleanArtist } = this._cleanTrackMetadata(track.info.title, track.info.author);
      return cleanArtist && !recentArtists.has(cleanArtist);
    });

    const finalRecs = differentArtistRecs.length > 0 ? differentArtistRecs : validRecs;

    finalRecs.forEach((track) => {
      const id = track.info.identifier || track.info.uri!;
      const sig = this._getTrackSignature(track);
      history.add(id);
      if (sig) history.add(sig);
    });

    if (history.size > 200) {
      const arr = Array.from(history).slice(-100);
      this.sessionHistory.set(guildId, new Set(arr));
    }

    return finalRecs;
  }

}

export default AutoplayEngine;

// Made by Nikhil Under CodeX Devs
