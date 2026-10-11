import type BetterSqlite3Database from 'better-sqlite3';
import { logger } from '#utils/logger';

const PLAYLIST_LIMIT = 20;
const TRACKS_PER_PLAYLIST_LIMIT = 50;
const PLAYLIST_NAME_MAX_LENGTH = 100;
const PLAYLIST_DESCRIPTION_MAX_LENGTH = 500;

export class PlaylistRepo {
  public db: BetterSqlite3Database.Database;
  public _getPlaylist: BetterSqlite3Database.Statement;
  public _getUserPlaylists: BetterSqlite3Database.Statement;
  public _insertPlaylist: BetterSqlite3Database.Statement;
  public _deletePlaylist: BetterSqlite3Database.Statement;
  public _updatePlaylistMetadata: BetterSqlite3Database.Statement;
  public _updatePlaylistTracks: BetterSqlite3Database.Statement;
  public _updatePlaylistTracksAdmin: BetterSqlite3Database.Statement;
  public _searchPlaylists: BetterSqlite3Database.Statement;
  public _getStats: BetterSqlite3Database.Statement;

  constructor(db: BetterSqlite3Database.Database) {
    this.db = db;
    this._getPlaylist = this.db.prepare('SELECT * FROM playlists WHERE id = ?');
    this._getUserPlaylists = this.db.prepare('SELECT * FROM playlists WHERE user_id = ? ORDER BY created_at DESC');
    this._insertPlaylist = this.db.prepare(`
      INSERT INTO playlists (id, user_id, name, description, tracks, total_duration, track_count)
      VALUES (?, ?, ?, ?, '[]', 0, 0)
    `);
    this._deletePlaylist = this.db.prepare('DELETE FROM playlists WHERE id = ? AND user_id = ?');
    this._updatePlaylistMetadata = this.db.prepare('UPDATE playlists SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?');
    this._updatePlaylistTracks = this.db.prepare('UPDATE playlists SET tracks = ?, total_duration = ?, track_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?');
    this._updatePlaylistTracksAdmin = this.db.prepare('UPDATE playlists SET tracks = ?, total_duration = ?, track_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    this._searchPlaylists = this.db.prepare('SELECT * FROM playlists WHERE user_id = ? AND (name LIKE ? OR description LIKE ?) ORDER BY created_at DESC');
    this._getStats = this.db.prepare(`
      SELECT
        COUNT(*) as total_playlists,
        COALESCE(SUM(track_count), 0) as total_tracks,
        COALESCE(SUM(total_duration), 0) as total_duration
      FROM playlists
      WHERE user_id = ?
    `);
  }

  generatePlaylistId() {
    return 'pl_' + Math.random().toString(36).substr(2, 16) + Date.now().toString(36);
  }

  createPlaylist(userId: string, name: string, description: string | null = null) {
    if (!name || name.length > PLAYLIST_NAME_MAX_LENGTH) throw new Error('Invalid playlist name');
    if (description && description.length > PLAYLIST_DESCRIPTION_MAX_LENGTH) throw new Error('Description too long');

    const userPlaylists = this.getUserPlaylists(userId);
    if (userPlaylists.length >= PLAYLIST_LIMIT) throw new Error('Maximum playlist limit reached');

    const existingPlaylist = userPlaylists.find(pl => pl.name.toLowerCase() === name.toLowerCase());
    if (existingPlaylist) throw new Error('Playlist with this name already exists');

    const playlistId = this.generatePlaylistId();
    this._insertPlaylist.run(playlistId, userId, name, description);
    return this.getPlaylist(playlistId);
  }

  deletePlaylist(playlistId: any, userId: any) {
    const playlist = this.getPlaylist(playlistId);
    if (!playlist) throw new Error('Playlist not found');
    if (playlist.user_id !== userId) throw new Error('Access denied');

    const result = this._deletePlaylist.run(playlistId, userId);
    return result.changes > 0;
  }

  getPlaylist(playlistId: string) {
    const playlist = this._getPlaylist.get(playlistId);
    if (!playlist) return null;
    try {
      playlist.tracks = JSON.parse(playlist.tracks || '[]');
    } catch {
      playlist.tracks = [];
    }
    return playlist;
  }

  getUserPlaylists(userId: string) {
    const playlists = this._getUserPlaylists.all(userId);
    return playlists.map(playlist => {
      try {
        playlist.tracks = JSON.parse(playlist.tracks || '[]');
      } catch {
        playlist.tracks = [];
      }
      return playlist;
    });
  }

  updatePlaylist(playlistId: any, userId: any, updates: any) {
    const playlist = this.getPlaylist(playlistId);
    if (!playlist || playlist.user_id !== userId) throw new Error('Playlist not found or access denied');

    let newName = playlist.name;
    let newDesc = playlist.description;

    if (updates.name !== undefined) {
      if (!updates.name || updates.name.length > PLAYLIST_NAME_MAX_LENGTH) throw new Error('Invalid playlist name');
      const existingPlaylist = this.getUserPlaylists(userId).find(pl => pl.name.toLowerCase() === updates.name.toLowerCase() && pl.id !== playlistId);
      if (existingPlaylist) throw new Error('Playlist with this name already exists');
      newName = updates.name;
    }
    if (updates.description !== undefined) {
      if (updates.description && updates.description.length > PLAYLIST_DESCRIPTION_MAX_LENGTH) throw new Error('Description too long');
      newDesc = updates.description;
    }

    this._updatePlaylistMetadata.run(newName, newDesc, playlistId, userId);
    return this.getPlaylist(playlistId);
  }

  addTrackToPlaylist(playlistId: any, userId: any, trackInfo: any) {
    const playlist = this.getPlaylist(playlistId);
    if (!playlist || playlist.user_id !== userId) throw new Error('Playlist not found or access denied');
    if (!trackInfo) throw new Error('Invalid track information');

    const info = trackInfo.info || trackInfo;
    const identifier = info.identifier || trackInfo.encoded;
    if (!identifier) throw new Error('Invalid track information');

    let tracks = playlist.tracks || [];
    if (tracks.length >= TRACKS_PER_PLAYLIST_LIMIT) throw new Error('Playlist track limit reached');
    if (tracks.some((t: any) => t.identifier === identifier)) throw new Error('Track already exists in playlist');

    const trackEntry = {
      identifier,
      title: info.title || 'Unknown Track',
      author: info.author || 'Unknown',
      uri: info.uri || null,
      duration: info.duration || info.length || null,
      sourceName: info.sourceName || null,
      artworkUrl: info.artworkUrl || null,
      addedAt: Date.now()
    };

    tracks.push(trackEntry);
    const totalDuration = tracks.reduce((sum: any, track: any) => sum + (track.duration || 0), 0);

    this._updatePlaylistTracks.run(JSON.stringify(tracks), totalDuration, tracks.length, playlistId, userId);
    return this.getPlaylist(playlistId);
  }

  removeTrackFromPlaylist(playlistId: any, userId: any, trackIdentifier: any) {
    const playlist = this.getPlaylist(playlistId);
    if (!playlist || playlist.user_id !== userId) throw new Error('Playlist not found or access denied');

    let tracks = playlist.tracks || [];
    const originalLength = tracks.length;
    tracks = tracks.filter((t: any) => t.identifier !== trackIdentifier);

    if (tracks.length === originalLength) throw new Error('Track not found in playlist');

    const totalDuration = tracks.reduce((sum: any, track: any) => sum + (track.duration || 0), 0);
    this._updatePlaylistTracks.run(JSON.stringify(tracks), totalDuration, tracks.length, playlistId, userId);
    return this.getPlaylist(playlistId);
  }

  clearPlaylist(playlistId: any, userId: any) {
    const playlist = this.getPlaylist(playlistId);
    if (!playlist || playlist.user_id !== userId) throw new Error('Playlist not found or access denied');

    this._updatePlaylistTracks.run('[]', 0, 0, playlistId, userId);
    return this.getPlaylist(playlistId);
  }

  searchUserPlaylists(userId: any, query: any) {
    const searchTerm = `%${query}%`;
    const playlists = this._searchPlaylists.all(userId, searchTerm, searchTerm);
    return playlists.map(playlist => {
      try {
        playlist.tracks = JSON.parse(playlist.tracks || '[]');
      } catch {
        playlist.tracks = [];
      }
      return playlist;
    });
  }

  getPlaylistStats(userId: string) {
    const result = this._getStats.get(userId);
    return result || { total_playlists: 0, total_tracks: 0, total_duration: 0 };
  }

  cleanupPlaylists(userId: string) {
    const playlists = this.getUserPlaylists(userId);
    this.db.transaction(() => {
      for (const playlist of playlists) {
        try {
          const tracks = playlist.tracks.filter((track: any) => track && track.identifier && track.title);
          const totalDuration = tracks.reduce((sum: any, track: any) => sum + (track.duration || 0), 0);
          this._updatePlaylistTracksAdmin.run(JSON.stringify(tracks), totalDuration, tracks.length, playlist.id);
        } catch (e) {
          logger.error('PlaylistsDB', `Failed to cleanup playlist ${playlist.id}`, e);
        }
      }
    })();
    logger.info('PlaylistsDB', `Cleaned up playlists for user ${userId}`);
  }
}

// Made by Nikhil Under CodeX Devs
