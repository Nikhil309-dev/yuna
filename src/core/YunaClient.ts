import { ClusterClient, getInfo } from 'discord-hybrid-sharding';
import {
	Client,
	GatewayIntentBits,
	Collection,
	Partials,
	ClientOptions,
	REST
} from 'discord.js';

import { config } from '#config/config';
import db from '#database/Database';
import { AudioManager } from '#audio/AudioManager';
import { CommandLoader } from '#loaders/CommandLoader';
import { EventLoader } from '#loaders/EventLoader';
import { ComponentLoader } from '#loaders/ComponentLoader';
import { logger } from '#utils/logger';
import ErrorHandler from '#core/ErrorHandler';
import { Scheduler } from '#core/Scheduler';

let shardInfo: any = null;
try {
	shardInfo = getInfo();
} catch (error) {
	shardInfo = null;
}

export class YunaClient extends Client {
	public cluster: ClusterClient<YunaClient> | null;
	public commands: Collection<string, any>;
	public aliases: Map<string, string>;
	public categories: Map<string, any>;
	public logger: typeof logger;
	public config: typeof config;
	public db: typeof db;
	public audio: AudioManager;
	public components: ComponentLoader;
	public commandLoader: CommandLoader;
	public eventLoader: EventLoader;
	public scheduler: Scheduler;
	public startTime: number;
	public rest: REST;

	constructor() {
		const clientOptions: ClientOptions = {
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMembers,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.GuildVoiceStates,
				GatewayIntentBits.GuildMessageReactions,
				GatewayIntentBits.MessageContent,
			],
			partials: [
				Partials.Channel,
				Partials.GuildMember,
				Partials.Message,
				Partials.User,
			],
			failIfNotExists: false,
			allowedMentions: { parse: ['users', 'roles'], repliedUser: false },
		};

		if (shardInfo) {
			clientOptions.shards = shardInfo.SHARD_LIST;
			clientOptions.shardCount = shardInfo.TOTAL_SHARDS;
		}

		super(clientOptions);

		this.cluster = shardInfo ? new ClusterClient(this) : null;
		this.commands = new Collection();
		this.aliases = new Map();
		this.categories = new Map();

		this.logger = logger;
		this.config = config;
		this.db = db;

		this.audio = new AudioManager(this);
		this.components = new ComponentLoader(this);
		this.commandLoader = new CommandLoader(this);
		this.eventLoader = new EventLoader(this);
		this.scheduler = new Scheduler(this);

		this.startTime = Date.now();
		this.rest = new REST({ version: '10' }).setToken(config.token as string);
	}

	get music(): AudioManager {
		return this.audio;
	}

	get lavalink(): any {
		return (this.audio as any)?.lavalink;
	}

	get commandHandler(): CommandLoader {
		return this.commandLoader;
	}

	get eventHandler(): EventLoader {
		return this.eventLoader;
	}

	async init() {
		this.logger.info('YunaClient', `Initializing Yuna V2 Sakura engine...`);
		try {
			await this.withTimeout('eventLoader.load()', () => this.eventLoader.load(), 20_000);
			await this.withTimeout('commandLoader.load()', () => this.commandLoader.load(), 20_000);
			await this.withTimeout('components.load()', () => this.components.load(), 20_000);

			this.scheduler.every('db_checkpoint', { minutes: 15 }, () => this.db?.checkpoint?.());
			this.scheduler.every('db_backup', { hours: 6 }, () => this.db?.backup?.());
			await this.withTimeout('scheduler.init()', () => this.scheduler.init(), 10_000);

			if (config.token && config.token !== 'YOUR_BOT_TOKEN_HERE') {
				await this.withTimeout('discord.login()', () => this.login(config.token), 30_000);
			}

			ErrorHandler.register(() => this.cleanup());

			this.logger.success('YunaClient', `Bot has successfully initialized.`);
		} catch (error) {
			this.logger.error('YunaClient', 'Failed to initialize bot:', error);
			throw error;
		}
	}

	/**
	 * Races an async step against a hard timeout. If the step does not settle
	 * within `ms` milliseconds, an Error is thrown so the boot fails loudly
	 * instead of hanging silently on a misbehaving loader.
	 */
	private async withTimeout<T>(label: string, fn: () => Promise<T>, ms: number): Promise<T> {
		let timer: NodeJS.Timeout | undefined;
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
		});
		try {
			return await Promise.race([fn(), timeout]);
		} finally {
			if (timer) clearTimeout(timer);
		}
	}

	async cleanup() {
		this.logger.warn('YunaClient', `Saving active player sessions before shutdown...`);
		try {
			if (this.scheduler) {
				this.scheduler.stop();
			}
			if (this.audio && this.audio.players) {
				for (const [guildId, player] of this.audio.players) {
					if (player && player.voiceChannelId && (player.queue?.current || player.queue?.tracks?.length > 0)) {
						try {
							const current = player.queue?.current;
							const remaining = player.queue?.tracks ? Array.from(player.queue.tracks) : [];
							const pos = player.position || 0;

							await this.db.guild?.saveActiveSession?.(
								guildId,
								player.voiceChannelId,
								player.textChannelId ?? player.voiceChannelId,
								current,
								remaining,
								pos
							);
							this.logger.info('YunaClient', `Saved active session state for guild ${guildId}`);
						} catch (e: any) {
							this.logger.warn('YunaClient', `Could not save session state for guild ${guildId}: ${e?.message || e}`);
						}
					}
					if (typeof player.destroy === 'function') {
						await player.destroy();
					}
				}
			}
			if (typeof (this.db as any).closeAll === 'function') {
				await (this.db as any).closeAll();
			} else if (typeof this.db.close === 'function') {
				await this.db.close();
			}
			this.destroy();
			this.logger.success('YunaClient', 'Cleanup completed successfully.');
		} catch (error) {
			this.logger.error('YunaClient', 'An error occurred during cleanup:', error);
		}
	}

	get uptime() {
		return Date.now() - this.startTime;
	}
}

// Made by Nikhil Under CodeX Devs
