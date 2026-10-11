export const EN_POOLS: Record<string, string[]> = {
  cooldown: [
    "Hold on a moment! Please wait **${time}** more second(s) before using this command again.",
    "Woah, slow down a bit! You can use this command again in **${time}** second(s).",
    "Take a breath! This command is on cooldown for another **${time}** second(s).",
    "Easy there! Please allow **${time}** more second(s) before sending another request.",
    "Yuna needs a quick moment! Please wait **${time}** second(s) before trying again.",
    "Command on cooldown! You can run this command again in **${time}** second(s).",
    "Please give it a pause! Cooldown expires in **${time}** second(s).",
    "Pacing is key! Re-use available in **${time}** second(s).",
    "Just a quick breather! Wait **${time}** second(s) before triggering this again.",
    "Speed demon! Let Yuna catch up for **${time}** second(s)."
  ],

  voiceRequired: [
    "You need to join a voice channel first before using music commands!",
    "Please hop into a voice channel so Yuna knows where to stream!",
    "Join a voice channel to start listening to your favorite music!",
    "You must be connected to a voice channel to run this command.",
    "No voice channel detected! Connect to a voice channel and try again.",
    "Yuna needs to hear you! Jump into a voice channel first.",
    "Please step into a voice channel before playing audio streams.",
    "Connect to a voice channel so Yuna can play your favorite tunes!"
  ],

  notYourInteraction: [
    "This menu isn't for you! Please run your own command to use the controls.",
    "Hey! That button belongs to another user. Run your own command to interact!",
    "Only the user who ran this command can use these controls!",
    "Hands off! This interactive menu is reserved for the command requester.",
    "This interactive control panel belongs to someone else!",
    "You don't have permission to interact with this menu. Type your own command!",
    "Control access denied! Run your own command to get an interactive menu.",
    "Nice try! This component is controlled exclusively by the command requester."
  ],

  sameVoiceRequired: [
    "You must be in the same voice channel as Yuna to control playback!",
    "Please join Yuna's voice channel to use this command!",
    "You need to be in the same voice channel as the bot to run this.",
    "Connect to the same voice channel as Yuna to manage audio controls!",
    "Join Yuna in her current voice channel to interact with music controls.",
    "You must share the same voice channel with the bot to execute this command."
  ],

  noTrackPlaying: [
    "No music is currently playing in this server!",
    "The queue is quiet right now! Use `/play <song>` to start listening.",
    "There are no active tracks playing at the moment.",
    "Playback is idle right now! Queue up some music to get started.",
    "Nothing streaming currently! Pass a song name or link to begin.",
    "The soundstage is clear! Add a song to start the music player."
  ],

  trackQueued: [
    "Track added to your queue successfully!",
    "Queued up! Added your song to the queue.",
    "Added to queue! Your song is lined up to play next.",
    "Successfully queued your requested track!",
    "Got it! Track appended to the active music queue.",
    "Lined up! Your song has been placed into the queue.",
    "Added to the sound list! Sit back and enjoy the vibe."
  ],

  nowPlaying: [
    "Now streaming high-fidelity audio in your voice channel!",
    "Started playback for your requested track!",
    "Now playing your music stream!",
    "Spinning your track live in high audio quality!",
    "Broadcasting your selection right now!",
    "Audio stream initialized! Enjoy the high quality tunes."
  ],

  playbackPaused: [
    "Paused music playback! Type `/resume` to continue playing.",
    "Player paused. Take your time, then type `/resume`!",
    "Playback has been paused successfully.",
    "Track paused! Press play or type `/resume` when ready.",
    "Audio hold enabled! Resume whenever you are ready."
  ],

  playbackResumed: [
    "Resumed music playback! Back to the tunes!",
    "Unpaused! Resuming your music queue now.",
    "Playback resumed successfully!",
    "Music is rolling again! Enjoy the stream.",
    "Unpaused audio stream! Back in action."
  ],

  trackSkipped: [
    "Skipped to the next track in queue!",
    "Skipping current song! On to the next track.",
    "Successfully skipped track!",
    "Next track up! Current song skipped.",
    "Jumped to the next song in the queue list."
  ],

  queueCleared: [
    "Cleared all songs from the queue!",
    "The queue has been emptied successfully!",
    "All queued tracks have been removed.",
    "Wiped the entire queue clean!",
    "Queue reset! Ready for brand new tracks."
  ],

  playerRequired: [
    "No active music player found for this server!",
    "There is no music player active right now!",
    "Yuna isn't currently connected or playing audio in this server.",
    "No active player session exists! Start one with `/play`."
  ],

  noResults: [
    "No tracks found matching your query!",
    "Could not find any songs with that search term.",
    "No music results found! Please check your search query.",
    "Search yields zero tracks! Try different keywords or direct links."
  ],

  volumeChanged: [
    "Playback volume has been updated successfully!",
    "Volume level adjusted!",
    "Player volume updated to your requested setting.",
    "Sound level updated for this playback session!"
  ],
  volumeInvalid: [
    "Volume level must be a number between 0 and 150.",
    "Invalid volume specified! Please enter a value between 0 and 150.",
    "Please enter a valid volume percentage (0 to 150)."
  ],

  seekSuccess: [
    "Seeked to the specified timestamp successfully!",
    "Player playback position updated!",
    "Jumped to the target audio position!"
  ],
  seekInvalid: [
    "Invalid position or timestamp specified.",
    "Please provide a valid timestamp or duration in seconds."
  ],
  rewindSuccess: [
    "Rewound the current track!",
    "Skipped backward in playback!",
    "Stepped back in time on the current song!"
  ],
  forwardSuccess: [
    "Skipped forward in the current track!",
    "Advanced track playback position!",
    "Stepped forward in playback!"
  ],
  replaySuccess: [
    "Replaying the current track from the start!",
    "Track restarted from the beginning.",
    "Spinning the current track again from 0:00!"
  ],
  previousSuccess: [
    "Skipped back to the previous track!",
    "Playing previous song in history.",
    "Rewound to the previous song in queue history."
  ],
  stopSuccess: [
    "Stopped playback and left the voice channel.",
    "Music player stopped and disconnected.",
    "Cleared queue, stopped audio engine, and left the voice channel."
  ],

  loopMode: [
    "Updated loop settings!",
    "Queue loop mode has been updated.",
    "Repeat mode set to your new selection!"
  ],
  shuffleSuccess: [
    "Shuffled all tracks in the queue!",
    "Queue order randomized successfully.",
    "Mixed up the queue sequence!"
  ],
  trackRemoved: [
    "Removed the specified track from the queue!",
    "Track successfully removed from queue.",
    "Selected track removed from playback queue!"
  ],
  trackMoved: [
    "Moved track to the requested queue position!",
    "Queue position updated successfully.",
    "Track position reordered in queue!"
  ],
  bumpSuccess: [
    "Track bumped to the top of the queue!",
    "Song moved to play next!",
    "Prioritized track to position #1 in queue!"
  ],

  likeAdded: [
    "Added current track to your favorites list!",
    "Saved song to your favorites!",
    "Added to your liked tracks collection!"
  ],
  likeRemoved: [
    "Removed track from your favorites list!",
    "Song removed from favorites.",
    "Deleted track from your liked songs collection."
  ],
  likedAll: [
    "Added all tracks in queue to your favorites!",
    "All current queue tracks saved to favorites!",
    "Entire queue added to your personal liked songs!"
  ],
  noLikedTracks: [
    "You haven't saved any favorite tracks yet!",
    "Your favorites list is currently empty.",
    "No liked songs found in your library."
  ],
  alreadyLiked: [
    "That track is already in your favorites!",
    "You've already liked this one — no change needed.",
    "This song is already saved to your liked songs!"
  ],
  notLiked: [
    "That track wasn't in your favorites to begin with!",
    "Nothing to remove — this song isn't in your liked songs.",
    "That one wasn't saved to your favorites."
  ],
  alreadyLikedAll: [
    "Every track in the queue is already in your favorites!",
    "Nothing new to add — the whole queue is already liked.",
    "All of these were saved to your liked songs already!"
  ],
  likedList: [
    "Tip: click a track row to manage it, or play everything at once!",
    "Use the buttons below to page through or play your favorites.",
    "Your liked songs are always saved for instant replay!"
  ],
  likedQueued: [
    "Your favorites are lined up and ready to play!",
    "Loading your liked songs into the queue now!",
    "Your whole favorites list is queued up!"
  ],
  likedResolveFailed: [
    "None of your liked songs could be resolved right now.",
    "Couldn't load those favorites — the source may be unavailable.",
    "No playable favorites found this time. Try re-adding them!"
  ],
  likedTrack: [
    "Pick an action below to play this song right away!",
    "One tap to play, queue, or remove this favorite.",
    "Manage this track without leaving the menu!"
  ],
  trackResolveFailed: [
    "That track couldn't be resolved from the source.",
    "The source didn't return that song — it may be region-locked.",
    "Couldn't find a playable version of that track right now."
  ],

  playlistCreated: [
    "Playlist created successfully!",
    "New custom playlist initialized!",
    "Your custom playlist is ready to receive tracks."
  ],
  playlistDeleted: [
    "Playlist deleted successfully!",
    "Removed custom playlist from your collection.",
    "Custom playlist deleted."
  ],
  playlistUpdated: [
    "Playlist updated successfully!",
    "Saved new tracks into your playlist collection.",
    "Playlist library updated!"
  ],
  playlistLoaded: [
    "Loaded playlist tracks into the player queue!",
    "Playlist tracks loaded and queued up!",
    "Successfully imported playlist songs into queue."
  ],

  filterApplied: [
    "Audio filter applied to playback!",
    "DJ audio filter activated!",
    "Audio DSP preset applied successfully!"
  ],
  filterCleared: [
    "Cleared all active audio filters!",
    "Reset audio DSP filters to default state.",
    "Equalizer and audio filters returned to flat baseline."
  ],

  modeToggled: [
    "Settings updated successfully!",
    "Configuration toggled for this server.",
    "Server setting updated!"
  ],
  presetUpdated: [
    "Player UI preset updated successfully!",
    "Card display preset saved!",
    "Now Playing presentation style updated!"
  ],
  prefixUpdated: [
    "Prefix settings updated successfully!",
    "Server custom prefix configured!",
    "Updated bot trigger prefix!"
  ],

  apToggled: [
    "Autoplay status updated successfully!",
    "Autoplay setting toggled.",
    "Dynamic recommendation autoplay updated!"
  ],
  radioStarted: [
    "Radio station playback started!",
    "Streaming radio station now.",
    "Live radio stream initialized!"
  ],
  lyricNotFound: [
    "No lyrics found for this track.",
    "Lyrics could not be retrieved for the requested song.",
    "Synchronized lyrics unavailable for this track."
  ],
  historyEmpty: [
    "No song history recorded yet.",
    "Playback history is currently empty.",
    "No recent tracks recorded in history."
  ],

  pingSuccess: [
    "Pong! Latency details retrieved.",
    "Connection stats fetched successfully!",
    "Ping latency calculated."
  ],

  premiumSuccess: [
  "Thanks for supporting Yuna! Your perks are live.",
  "Premium activated — enjoy the extras!"
],

  devOnly: [
    "This command is restricted to bot developers only.",
    "Access denied. Developer authorization required.",
    "Developer privileges required to execute this command."
  ],
  blacklisted: [
    "User or guild blacklist updated.",
    "Blacklist status updated successfully."
  ],
  reloaded: [
    "Bot modules reloaded successfully.",
    "Reload completed!"
  ],
  rebooting: [
    "Restarting Yuna bot processes...",
    "Reboot sequence initiated."
  ],
  slashSynced: [
    "Slash commands synchronized successfully.",
    "Application commands updated."
  ],
  serversListed: [
    "Server overview generated.",
    "Fetched server stats successfully."
  ],
  lavalinkStats: [
    "Lavalink node status retrieved.",
    "Node statistics fetched."
  ],

  errorGeneric: [
    "Something went wrong while processing your request. Please try again!",
    "An unexpected error occurred. Feel free to try again in a moment.",
    "Unable to complete request right now. Please try again later.",
    "An issue occurred while processing this command.",
    "Request failed to process cleanly. Please retry shortly."
  ],
};

export default EN_POOLS;

// Made by Nikhil Under CodeX Devs
