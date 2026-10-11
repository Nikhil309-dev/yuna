import {
    Client,
    CommandInteraction,
    Message,
    Guild,
    User,
    GuildMember,
    TextBasedChannel,
    PermissionResolvable,
    ApplicationCommandData
} from 'discord.js';
import { Player } from 'lavalink-client';

export interface CommandContext {
    client: Client | any;
    interaction?: CommandInteraction | any;
    message?: Message | any;
    author?: User | any;
    options?: any;
    args?: string[];
    player?: Player | any;
    pm?: any;
    guild?: Guild | null;
    user?: User | null;
    member?: GuildMember | any;
    channel?: TextBasedChannel | any;
    t: (category: string, replacements?: Record<string, any>) => string;
    locale: string;
    reply?: (options: any) => Promise<any>;
    editReply?: (options: any) => Promise<any>;
    followUp?: (options: any) => Promise<any>;
    deferred?: boolean;
    replied?: boolean;
}

export interface CommandAccessOptions {
    ownerOnly?: boolean;
    permissions?: PermissionResolvable[];
    botPermissions?: PermissionResolvable[];
    premium?: 'user' | 'guild' | 'any' | false;
    voice?: boolean;
    sameVoice?: boolean;
    player?: boolean;
    playing?: boolean;
}

export interface CommandSlashOptions {
    enabled?: boolean;
    data?: ApplicationCommandData | any;
    autoDefer?: boolean;
}

export interface CommandOptions {
    name: string;
    description?: string;
    usage?: string;
    aliases?: string[];
    category?: string;
    cooldown?: number;
    examples?: string[];
    maintenance?: boolean;

    access?: CommandAccessOptions;
    ownerOnly?: boolean;
    userPermissions?: PermissionResolvable[];
    permissions?: PermissionResolvable[];
    botPermissions?: PermissionResolvable[];
    userPrem?: boolean;
    guildPrem?: boolean;
    anyPrem?: boolean;
    voiceRequired?: boolean;
    sameVoiceRequired?: boolean;
    playerRequired?: boolean;
    playingRequired?: boolean;

    slash?: CommandSlashOptions;
    enabledSlash?: boolean;
    slashData?: ApplicationCommandData | any;
}

export class Command {
    public name: string;
    public description: string;
    public usage: string;
    public aliases: string[];
    public category: string;
    public cooldown: number;
    public examples: string[];
    public maintenance: boolean;

    public access: Required<CommandAccessOptions>;
    public slash: Required<CommandSlashOptions>;

    public enabledSlash: boolean;
    public slashData: ApplicationCommandData | any;
    public ownerOnly: boolean;
    public voiceRequired: boolean;
    public sameVoiceRequired: boolean;
    public playerRequired: boolean;
    public playingRequired: boolean;

    constructor(options: CommandOptions = {} as CommandOptions) {
        this.name = options.name;
        this.description = options.description || 'No description provided';
        this.usage = options.usage || this.name;
        this.aliases = options.aliases || [];
        this.category = options.category || 'Miscellaneous';
        this.cooldown = options.cooldown || 3;
        this.examples = options.examples || [];
        this.maintenance = options.maintenance || false;

        this.access = {
            ownerOnly: options.access?.ownerOnly ?? options.ownerOnly ?? false,
            permissions: options.access?.permissions || options.userPermissions || options.permissions || [],
            botPermissions: options.access?.botPermissions || options.botPermissions || [],
            premium: options.access?.premium ?? (options.userPrem ? 'user' : options.guildPrem ? 'guild' : options.anyPrem ? 'any' : false),
            voice: options.access?.voice ?? options.voiceRequired ?? false,
            sameVoice: options.access?.sameVoice ?? options.sameVoiceRequired ?? false,
            player: options.access?.player ?? options.playerRequired ?? false,
            playing: options.access?.playing ?? options.playingRequired ?? false
        };

        this.slash = {
            enabled: options.slash?.enabled ?? options.enabledSlash ?? false,
            data: options.slash?.data || options.slashData || null,
            autoDefer: options.slash?.autoDefer ?? true
        };
        this.enabledSlash = this.slash.enabled;
        this.slashData = this.slash.data;
        this.ownerOnly = this.access.ownerOnly;
        this.voiceRequired = this.access.voice;
        this.sameVoiceRequired = this.access.sameVoice;
        this.playerRequired = this.access.player;
        this.playingRequired = this.access.playing;
    }

    async beforeExecute(): Promise<boolean> {
        return true;
    }

    async execute(ctx: CommandContext): Promise<any> {
        throw new Error(`Command ${this.name} doesn't provide an execute method!`);
    }

    async afterExecute(): Promise<void> {}

    async onError(error: Error): Promise<void> {
        console.error(`[Command Error - ${this.name}]`, error);
    }
}

// Made by Nikhil Under CodeX Devs
