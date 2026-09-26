# Yuna V2 🎵

A powerful and modern Discord Music Bot built for high-performance audio streaming.

## ✨ Features
- High-quality music playback
- Advanced audio filters (Bassboost, Nightcore, Vaporwave, etc.)
- User playlists & liked songs system
- Economy & Premium features
- Interactive modern UI

## 🏗️ Architecture
The V2 codebase has been completely restructured for better maintainability and performance:
- `src/commands/` - Command modules organized by category
- `src/events/` - Event listeners for client, player, and node events
- `src/database/` - Better-SQLite3 implementation with repository pattern (`repositories/`)
- `src/structures/` - Core class extensions (YunaClient, etc.)
- `src/ui/` - Reusable UI components and embed builders
- `src/config/` - Configuration files

## 🛠️ Tech Stack
- **Discord.js v14**
- **Lavalink v4** (via `lavalink-client`; YouTube through the **youtube-source** plugin)
- **better-sqlite3** for lightning-fast database operations
- **discord-hybrid-sharding** for efficient resource management

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd yuna
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   Rename `.env.example` to `.env` and fill in your details:
   ```env
   TOKEN=your_bot_token
   CLIENT_ID=your_client_id
   ```

4. **Start Lavalink** (required — the bot sends all audio to a Lavalink node)

   The bot connects to `127.0.0.1:9000` with password `youshallnotpass` by
   default, which is exactly what the bundled config provides.

   With Docker:
   ```bash
   docker compose up -d
   ```

   Or with the Lavalink jar (Java 17+):
   ```bash
   # download the latest Lavalink v4 jar, then:
   java -jar Lavalink.jar
   ```
   (Run it from the project root so it picks up `lavalink/application.yml`.)

   YouTube playback comes from the **youtube-source** plugin, which Lavalink
   downloads automatically on first start. Spotify/Apple/Deezer/JioSaavn need
   the [LavaSrc](https://github.com/topi314/LavaSrc) plugin plus credentials —
   add it under `lavalink.plugins` in `lavalink/application.yml` if you want them.

   > Tip: `DEFAULT_MUSIC_SOURCE` (see `src/config/sources.ts`) picks the primary
   > search source. It defaults to `jiosaavn`, which falls back to YouTube when
   > that source isn't configured, so playback works out of the box. Set it to
   > `youtube` to skip the fallback entirely.

5. **Start the bot**
   ```bash
   npm start
   ```

## 🎧 Playing a song

Once the bot is online and Lavalink is running:

1. Join a voice channel.
2. Run `/play <song name or URL>` (or `.play <song name>`).
3. The bot joins your channel and streams through Lavalink.

If nothing plays, check the bot console for a `Lavalink Node #… connected`
line — if it's missing, Lavalink isn't reachable at the configured host/port.

## 📚 Commands
| Category | Description |
|----------|-------------|
| 🎵 Music | Play, skip, pause, resume, queue management |
| 🎛️ Filters | Bassboost, 8D, Nightcore, Vaporwave, Karaoke |
| 📁 Playlists | Create, manage, and play custom playlists |
| 💰 Economy | Coins, daily rewards, premium purchase |
| ⚙️ Config | Setup channels, DJ roles, language |

## 👨‍💻 Credits
Coded with ❤️ by **Nikhil**

## 📄 License
This project is proprietary. All rights reserved.