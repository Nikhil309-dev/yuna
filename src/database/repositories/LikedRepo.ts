import type BetterSqlite3Database from 'better-sqlite3';
export class LikedRepo {
  public db: BetterSqlite3Database.Database;
  public _getLiked: BetterSqlite3Database.Statement;
  public _updateLiked: BetterSqlite3Database.Statement;

  constructor(db: BetterSqlite3Database.Database) {
    this.db = db;
    this._getLiked = this.db.prepare('SELECT * FROM liked_tracks WHERE user_id = ?');
    this._updateLiked = this.db.prepare(`
      INSERT INTO liked_tracks (user_id, tracks, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET tracks = excluded.tracks, updated_at = CURRENT_TIMESTAMP
    `);
  }

  getUserLiked(userId: string) {
    const data = this._getLiked.get(userId);
    if (!data) return [];
    try {
      return JSON.parse(data.tracks || '[]');
    } catch {
      return [];
    }
  }

  addLikedTrack(userId: string, trackInfo: any) {
    let result = false;
    this.db.transaction(() => {
      const tracks = this.getUserLiked(userId);
      if (tracks.find((t: any) => t.identifier === trackInfo.identifier)) return;

      const trackEntry = {
        identifier: trackInfo.identifier,
        title: trackInfo.title || 'Unknown Track',
        author: trackInfo.author || 'Unknown',
        uri: trackInfo.uri || null,
        duration: trackInfo.duration || null,
        sourceName: trackInfo.sourceName || null,
        artworkUrl: trackInfo.artworkUrl || null,
        addedAt: Date.now()
      };

      tracks.push(trackEntry);
      this._updateLiked.run(userId, JSON.stringify(tracks));
      result = true;
    })();
    return result;
  }

  removeLikedTrack(userId: any, trackIdentifier: any) {
    let result = false;
    this.db.transaction(() => {
      let tracks = this.getUserLiked(userId);
      const originalLength = tracks.length;
      tracks = tracks.filter((t: any) => t.identifier !== trackIdentifier);

      if (tracks.length === originalLength) return;

      this._updateLiked.run(userId, JSON.stringify(tracks));
      result = true;
    })();
    return result;
  }
}

// Made by Nikhil Under CodeX Devs
