import { ActivityType } from "discord.js";
import { logger } from "#utils/logger";
import { config } from "#config/config";
import { db } from "#database/Database";
import { showBanner } from "#utils/banner";
import { PlayerManager } from "#audio/PlayerManager";

export default {
  name: "clientReady",
  once: true,
  async execute(client: any) {
    showBanner(client);

    const intervals: NodeJS.Timeout[] = [];
    intervals.push(setInterval(() => db.backup(), 30 * 60 * 1000));
    intervals.push(setInterval(() => db.checkpoint(), 15 * 60 * 1000));

    client._intervals = intervals;

    const { user, guilds } = client;
    logger.success("Bot", `Logged in as ${user.tag}`);
    logger.info("Bot", `Serving ${guilds.cache.size} guilds`);

    logger.info(
      "Bot",
      "Waiting 10 seconds for Lavalink to be ready before restoring sessions...",
    );
    setTimeout(async () => {
      if (config.features.stay247) {
        await initialize247Mode(client);
        intervals.push(
          setInterval(
            () => check247Connections(client),
            config.player.stay247.checkInterval,
          ),
        );
      }
      await restoreActiveSessions(client);
    }, 10000);

    const updateStatus = () => {
      user.setActivity({
        name: config.status?.text || "Yuna Music",
        type: getStatusType(config.status.type),
      });
    };

    updateStatus();
    intervals.push(setInterval(updateStatus, 10 * 60 * 1000));
    user.setStatus(config.status.status || "dnd");

    try {
      logger.info("Bot", "Checking and registering slash commands...");
      const { REST, Routes } = await import('discord.js');
      const slashCommandsData = client.commandHandler.getSlashCommandsData();
      if (slashCommandsData && slashCommandsData.length > 0) {

        (async () => {
          try {
            const rest = new REST({ version: '10', timeout: 15000 }).setToken(config.token!);
            const currentCommands = (await rest.get(Routes.applicationCommands(client.user!.id))) as any[];

            let needsUpdate = currentCommands.length !== slashCommandsData.length;
            if (!needsUpdate) {
              const currentMap = new Map(currentCommands.map(cmd => [cmd.name, cmd]));
              for (const newCmd of slashCommandsData) {
                const existing = currentMap.get(newCmd.name);
                if (!existing || JSON.stringify(existing) !== JSON.stringify(newCmd)) {
                  needsUpdate = true;
                  break;
                }
              }
            }

            if (needsUpdate) {
              logger.info("Bot", `Updating ${slashCommandsData.length} slash commands globally...`);
              await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: slashCommandsData },
              );
              logger.success("Bot", `Successfully registered ${slashCommandsData.length} slash commands.`);
            } else {
              logger.success("Bot", "Slash commands are already up to date.");
            }
          } catch (syncErr: any) {
            logger.warn("Bot", `Slash command sync skipped or timed out: ${syncErr?.message}`);
          }
        })();
      }
    } catch (error) {
      logger.error("Bot", "Failed to auto-register slash commands:", error);
    }
  },
};

function getStatusType(type: any) {
  const types: Record<string, ActivityType> = {
    PLAYING: ActivityType.Playing,
    STREAMING: ActivityType.Streaming,
    LISTENING: ActivityType.Listening,
    WATCHING: ActivityType.Watching,
    COMPETING: ActivityType.Competing,
    CUSTOM: ActivityType.Custom,
  };
  return types[type] || ActivityType.Custom;
}

async function initialize247Mode(client: any) {
  try {
    logger.success("247Mode", "24/7 mode active — connecting persistent Lavalink players");
    const guilds247: any[] = db.guild.getValid247Guilds();
    logger.info(
      "247Mode",
      `Found ${guilds247.length} guilds with valid 24/7 configuration`,
    );

    if (guilds247.length === 0) {
      logger.info("247Mode", "No guilds with 24/7 mode enabled");
      return;
    }

    const connectionPromises = guilds247.map((guildData, index) => {
      return new Promise<void>((resolve) => {
        setTimeout(async () => {
          try {
            await connect247Guild(client, guildData);
            resolve();
          } catch (error) {
            logger.error(
              "247Mode",
              `Failed to connect guild ${guildData.id}:`,
              error,
            );
            resolve();
          }
        }, index * 2000);
      });
    });

    await Promise.all(connectionPromises);
    logger.success("247Mode", "24/7 mode initialization completed");
  } catch (error) {
    logger.error("247Mode", "Failed to initialize 247 mode:", error);
  }
}

async function restoreActiveSessions(client: any) {
  try {
    const activeSessions = db.guild.getAllActiveSessions();
    if (!activeSessions || activeSessions.length === 0) return;

    logger.info("SessionRestorer", `Restoring ${activeSessions.length} active player sessions...`);
    for (const session of activeSessions) {
      try {
        await restoreActiveSession(client, session);
      } catch (sessionErr) {
        logger.error("SessionRestorer", `Failed to restore session for guild ${session.guild_id}:`, sessionErr);
      }
    }
  } catch (error) {
    logger.error("SessionRestorer", "Failed to restore active sessions:", error);
  }
}

async function restoreActiveSession(client: any, session: any) {
  const guild = client.guilds.cache.get(session.guild_id);
  if (!guild) return;
  const voiceChannel = guild.channels.cache.get(session.voice_channel_id);
  if (!voiceChannel) return;

  const player = await client.music.createPlayer({
    guildId: guild.id,
    textChannelId: session.text_channel_id,
    voiceChannelId: voiceChannel.id,
    volume: db.guild.getDefaultVolume(guild.id),
  });

  const pm = new PlayerManager(player);
  if (!pm.isConnected) await pm.connect();

  let currentTrack = null;
  let queueTracks = [];

  try {
    if (session.current_track) currentTrack = JSON.parse(session.current_track);
    if (session.queue_tracks) queueTracks = JSON.parse(session.queue_tracks);
  } catch (e) {}

  if (currentTrack) {
    await pm.addTracks(currentTrack);
  }
  if (queueTracks.length > 0) {
    await pm.addTracks(queueTracks);
  }

  if (currentTrack || queueTracks.length > 0) {
    await pm.play();
    if (session.position > 0) {
      await player.seek(session.position);
    }
  }

  logger.success("SessionRestorer", `Successfully restored active session for guild ${guild.name}`);
}

async function connect247Guild(client: any, guildData: any) {
  try {
    const guild = client.guilds.cache.get(guildData.id);
    if (!guild) {
      logger.warn(
        "247Mode",
        `Guild ${guildData.id} not found, removing from 24/7 list`,
      );
      db.guild.set247Mode(guildData.id, false);
      return;
    }

    const voiceChannel = guild.channels.cache.get(
      guildData.stay_247_voice_channel,
    );
    if (!voiceChannel || voiceChannel.type !== 2) {
      logger.warn(
        "247Mode",
        `Invalid voice channel for guild ${guild.name}, disabling 24/7 mode`,
      );
      db.guild.set247Mode(guildData.id, false);
      return;
    }

    let textChannel = null;
    if (guildData.stay_247_text_channel) {
      textChannel = guild.channels.cache.get(guildData.stay_247_text_channel);
      if (!textChannel || (textChannel.type !== 0 && textChannel.type !== 5)) {
        logger.warn(
          "247Mode",
          `Invalid text channel for guild ${guild.name}, using voice channel as fallback`,
        );
        textChannel = voiceChannel;
      }
    } else {
      textChannel = voiceChannel;
    }

    const existingPlayer = client.music?.getPlayer(guild.id);
    if (existingPlayer && existingPlayer.voiceChannelId) {
      logger.debug(
        "247Mode",
        `Player already exists for guild ${guild.name}, updating 24/7 flags`,
      );
      existingPlayer.set("247Mode", true);
      existingPlayer.set("247VoiceChannel", voiceChannel.id);
      existingPlayer.set("247TextChannel", textChannel.id);
      return;
    }

    const botMemberId = client.user.id;
    const perms = voiceChannel.permissionsFor(botMemberId);
    if (!perms || !perms.has("Connect") || !perms.has("Speak")) {
      logger.warn(
        "247Mode",
        `Missing permissions for voice channel ${voiceChannel.name} in guild ${guild.name}`,
      );
      return;
    }

    logger.info(
      "247Mode",
      `Connecting to 24/7 channel ${voiceChannel.name} in guild ${guild.name}`,
    );

    const player = await client.music.createPlayer({
      guildId: guild.id,
      textChannelId: textChannel.id,
      voiceChannelId: voiceChannel.id,
      selfMute: false,
      selfDeaf: true,
      volume: db.guild.getDefaultVolume(guild.id),
    });

    player.set("247Mode", true);
    player.set("247VoiceChannel", voiceChannel.id);
    player.set("247TextChannel", textChannel.id);
    player.set("247LastConnected", Date.now());

    logger.success(
      "247Mode",
      `Connected to 24/7 channel ${voiceChannel.name} in guild ${guild.name}`,
    );
  } catch (error) {
    logger.error(
      "247Mode",
      `Error connecting 24/7 for guild ${guildData.id}:`,
      error,
    );
  }
}

async function check247Connections(client: any) {
  try {
    const guilds247 = db.guild.getValid247Guilds();

    for (const guildData of guilds247) {
      try {
        await checkSingle247Connection(client, guildData);
      } catch (error) {
        logger.error("247Mode", `Error checking guild ${guildData.id}:`, error);
      }
    }
  } catch (error) {
    logger.error("247Mode", "Error in 247 connection check:", error);
  }
}

async function checkSingle247Connection(client: any, guildData: any) {
  const guild = client.guilds.cache.get(guildData.id);
  if (!guild) {
    logger.warn(
      "247Mode",
      `Guild ${guildData.id} not found, disabling 24/7 mode`,
    );
    db.guild.set247Mode(guildData.id, false);
    return;
  }

  const voiceChannel = guild.channels.cache.get(
    guildData.stay_247_voice_channel,
  );
  if (!voiceChannel || voiceChannel.type !== 2) {
    logger.warn(
      "247Mode",
      `Voice channel ${guildData.stay_247_voice_channel} no longer exists in guild ${guild.name}`,
    );
    db.guild.set247Mode(guildData.id, false);
    return;
  }

  const player = client.music?.getPlayer(guild.id);

  if (
    !player ||
    !player.voiceChannelId ||
    player.voiceChannelId !== voiceChannel.id
  ) {
    logger.info(
      "247Mode",
      `Reconnecting to 24/7 channel ${voiceChannel.name} in guild ${guild.name}`,
    );

    try {
      if (
        player &&
        player.voiceChannelId &&
        player.voiceChannelId !== voiceChannel.id
      ) {
        await player.destroy();
      }

      let textChannel = guild.channels.cache.get(
        guildData.stay_247_text_channel,
      );
      if (!textChannel || (textChannel.type !== 0 && textChannel.type !== 5)) {
        textChannel = voiceChannel;
      }

      const newPlayer = await client.music.createPlayer({
        guildId: guild.id,
        textChannelId: textChannel.id,
        voiceChannelId: voiceChannel.id,
        selfMute: false,
        selfDeaf: true,
        volume: db.guild.getDefaultVolume(guild.id),
      });
      if (!newPlayer.connected) {
        await newPlayer.connect();
      }
      newPlayer.set("247Mode", true);
      newPlayer.set("247VoiceChannel", voiceChannel.id);
      newPlayer.set("247TextChannel", textChannel.id);
      newPlayer.set("247LastReconnected", Date.now());

      logger.success(
        "247Mode",
        `Reconnected to 24/7 channel ${voiceChannel.name} in guild ${guild.name}`,
      );
    } catch (error) {
      logger.error(
        "247Mode",
        `Failed to reconnect 24/7 in guild ${guild.name}:`,
        error,
      );
    }
  } else {
    player.set("247Mode", true);
    player.set("247VoiceChannel", voiceChannel.id);
    if (guildData.stay_247_text_channel) {
      player.set("247TextChannel", guildData.stay_247_text_channel);
    }
  }
}

// Made by Nikhil Under CodeX Devs
