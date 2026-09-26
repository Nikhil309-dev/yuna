import { PlayerManager } from '#audio/PlayerManager';
import { logger } from '#utils/logger';

const aloneTimeouts = new Map();
const muteStates = new Map();

/** Cleans up per-guild state when a player is destroyed by any code path. */
export function cleanupGuildVoiceState(guildId: string) {
	const timeout = aloneTimeouts.get(guildId);
	if (timeout) {
		clearTimeout(timeout);
		aloneTimeouts.delete(guildId);
	}
	muteStates.delete(guildId);
}

export default {
	name: "voiceStateUpdate",
	once: false,
	async execute(oldState: any, newState: any, client: any) {
		try {
			const guildId = newState.guild.id;
			const player = client.audio?.getPlayer(guildId) || client.music?.getPlayer(guildId);

			if (!player) return;

			const pm = new PlayerManager(player);
			const botMember = newState.guild.members.me;

			if (newState.id === client.user.id) {
				await handleBotVoiceStateChange(oldState, newState, pm, botMember, client);
				return;
			}

			await handleUserVoiceStateChange(oldState, newState, pm, botMember, client);

		} catch (error) {
			logger.error('VoiceStateUpdate', 'Error in voice state update handler:', error);
		}
	},
};

async function handleBotVoiceStateChange(oldState: any, newState: any, pm: any, botMember: any, client: any) {
	const guildId = newState.guild.id;

	if (oldState.channelId && !newState.channelId) {
		logger.info('VoiceStateUpdate', `Bot disconnected from voice channel in guild ${guildId}`);

		clearAloneTimeout(guildId);

		await destroyPlayer(pm, 'Bot disconnected from voice channel', client);
		return;
	}

	if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
		logger.info('VoiceStateUpdate', `Bot moved from ${oldState.channelId} to ${newState.channelId} in guild ${guildId}`);

		try {
			await pm.changeVoiceState({ voiceChannelId: newState.channelId });
		} catch (error) {
			logger.error('VoiceStateUpdate', 'Error updating voice state after channel move:', error);
		}

		await checkIfAlone(newState, pm, client);
	}

	await handleMuteStateChange(oldState, newState, pm, client);
}

async function handleUserVoiceStateChange(oldState: any, newState: any, pm: any, botMember: any, client: any) {
	const guildId = newState.guild.id;
	const botVoiceChannelId = botMember?.voice?.channelId;

	if (!botVoiceChannelId) return;

	if (oldState.channelId === botVoiceChannelId && newState.channelId !== botVoiceChannelId) {
		logger.debug('VoiceStateUpdate', `User ${newState.id} left bot's voice channel in guild ${guildId}`);
		await checkIfAlone(botMember.voice, pm, client);
	}

	if (oldState.channelId !== botVoiceChannelId && newState.channelId === botVoiceChannelId) {
		logger.debug('VoiceStateUpdate', `User ${newState.id} joined bot's voice channel in guild ${guildId}`);

		clearAloneTimeout(guildId);

		if (pm.isPaused && pm.getData('pausedDueToAlone')) {
			await pm.resume();
			pm.setData('pausedDueToAlone', false);
			logger.info('VoiceStateUpdate', `Resumed playback in guild ${guildId} - users rejoined`);
		}
	}
}

async function handleMuteStateChange(oldState: any, newState: any, pm: any, client: any) {
	const guildId = newState.guild.id;
	const wasServerMuted = oldState.serverMute;
	const isServerMuted = newState.serverMute;
	const wasSelfMuted = oldState.selfMute;
	const isSelfMuted = newState.selfMute;

	const previousMuteState = muteStates.get(guildId) || { serverMute: false, selfMute: false };
	const currentMuteState = { serverMute: isServerMuted, selfMute: isSelfMuted };
	muteStates.set(guildId, currentMuteState);

	const wasMuted = previousMuteState.serverMute || previousMuteState.selfMute;
	const isMuted = isServerMuted || isSelfMuted;

	if (!wasMuted && isMuted) {
		if (pm.isPlaying) {
			await pm.pause();
			pm.setData('pausedDueToMute', true);

			const muteType = isServerMuted ? 'server-muted' : 'self-muted';
			logger.info('VoiceStateUpdate', `Paused playback in guild ${guildId} - bot was ${muteType}`);
			await sendMuteNotification(pm, true, muteType, client);
		}
	} else if (wasMuted && !isMuted) {
		if (pm.isPaused && pm.getData('pausedDueToMute')) {
			await pm.resume();
			pm.setData('pausedDueToMute', false);
			logger.info('VoiceStateUpdate', `Resumed playback in guild ${guildId} - bot was unmuted`);

			await sendMuteNotification(pm, false, null, client);
		}
	}
}

async function checkIfAlone(voiceState: any, pm: any, client: any) {
	const guildId = voiceState.guild.id;
	const channel = voiceState.channel;

	if (!channel) return;

	const humanMembers = channel.members.filter((member: any) => !member.user.bot);
	const is247Mode = await pm.is247ModeEnabled();

	if (humanMembers.size === 0) {
		logger.info('VoiceStateUpdate', `Bot is alone in voice channel in guild ${guildId} (24/7 = ${is247Mode})`);

		clearAloneTimeout(guildId);

		if (pm.isPlaying) {
			await pm.pause();
			pm.setData('pausedDueToAlone', true);
			logger.info('VoiceStateUpdate', `Paused playback in guild ${guildId} - voice channel empty`);
		}

		if (is247Mode) {
			logger.info('VoiceStateUpdate', `24/7 mode enabled for guild ${guildId} - staying connected permanently (paused)`);
			return;
		}

		logger.info('VoiceStateUpdate', `Starting 120s disconnect timer for guild ${guildId}`);
		const timeout = setTimeout(async () => {
			try {
				const currentChannel = voiceState.guild.members.me?.voice?.channel;
				if (currentChannel) {
					const currentHumanMembers = currentChannel.members.filter((member: any) => !member.user.bot);
					if (currentHumanMembers.size === 0) {
						logger.info('VoiceStateUpdate', `Destroying player in guild ${guildId} - alone for 120 seconds`);
						await destroyPlayer(pm, 'Alone in voice channel for 120 seconds', client);
					}
				}
			} catch (error) {
				logger.error('VoiceStateUpdate', 'Error in alone timeout handler:', error);
			} finally {
				aloneTimeouts.delete(guildId);
			}
		}, 120000);

		aloneTimeouts.set(guildId, timeout);
	} else {
		clearAloneTimeout(guildId);

		if (pm.isPaused && pm.getData('pausedDueToAlone')) {
			await pm.resume();
			pm.setData('pausedDueToAlone', false);
			logger.info('VoiceStateUpdate', `Resumed playback in guild ${guildId} - users rejoined voice channel`);
		}
	}
}

function clearAloneTimeout(guildId: any) {
	const existingTimeout = aloneTimeouts.get(guildId);
	if (existingTimeout) {
		clearTimeout(existingTimeout);
		aloneTimeouts.delete(guildId);
		logger.debug('VoiceStateUpdate', `Cleared alone timeout for guild ${guildId}`);
	}
}

async function destroyPlayer(pm: any, reason: any, client: any) {
	try {
		const guildId = pm.guildId;

		const is247Enabled = await pm.is247ModeEnabled();

		if (is247Enabled) {
			logger.info('VoiceStateUpdate', `24/7 mode enabled in guild ${guildId} - stopping player instead of destroying: ${reason}`);

			await pm.stop();

			await send247StopNotification(pm, reason, client);

			clearAloneTimeout(guildId);
			muteStates.delete(guildId);

			return;
		}

		await sendDisconnectNotification(pm, reason, client);

		clearAloneTimeout(guildId);
		muteStates.delete(guildId);

		await pm.destroy(reason, true);

		logger.info('VoiceStateUpdate', `Player destroyed in guild ${guildId}: ${reason}`);
	} catch (error) {
		logger.error('VoiceStateUpdate', 'Error destroying player:', error);
	}
}

async function sendMuteNotification(pm: any, isMuted: boolean, muteType: string | null = null, client: any) {
	try {
		const textChannelId = pm.textChannelId;
		if (!textChannelId) return;

		const channel = client.channels.cache.get(textChannelId);
		if (!channel) return;

		let message;
		if (isMuted) {
			const type = muteType === 'server-muted' ? 'server-muted' : 'muted';
			message = `⏸️ **Music paused** - Bot was ${type}`;
		} else {
			message = `▶️ **Music resumed** - Bot was unmuted`;
		}

		await channel.send(message);
	} catch (error) {
		logger.error('VoiceStateUpdate', 'Error sending mute notification:', error);
	}
}

async function send247StopNotification(pm: any, reason: any, client: any) {
	try {
		const textChannelId = pm.textChannelId;
		if (!textChannelId) return;

		const channel = client.channels.cache.get(textChannelId);
		if (!channel) return;

		let message;
		switch (reason) {
			case 'Alone in voice channel for 10 seconds':
				message = '⏹️ **Music stopped** - I was alone in the voice channel (24/7 mode active)';
				break;
			case 'Bot disconnected from voice channel':
				message = '⏹️ **Music stopped** - I was removed from the voice channel (24/7 mode active)';
				break;
			default:
				message = `⏹️ **Music stopped** - ${reason} (24/7 mode active)`;
				break;
		}

		await channel.send(message);
	} catch (error) {
		logger.error('VoiceStateUpdate', 'Error sending 247 stop notification:', error);
	}
}

async function sendDisconnectNotification(pm: any, reason: any, client: any) {
	try {
		const textChannelId = pm.textChannelId;
		if (!textChannelId) return;

		const channel = client.channels.cache.get(textChannelId);
		if (!channel) return;

		let message;
		switch (reason) {
			case 'Alone in voice channel for 10 seconds':
				message = '👋 **Disconnected** - I was alone in the voice channel for too long';
				break;
			case 'Bot disconnected from voice channel':
				message = '🔌 **Disconnected** - I was removed from the voice channel';
				break;
			default:
				message = `🔌 **Disconnected** - ${reason}`;
				break;
		}

		await channel.send(message);
	} catch (error) {
		logger.error('VoiceStateUpdate', 'Error sending disconnect notification:', error);
	}
                               }

// Made by Nikhil Under CodeX Devs
