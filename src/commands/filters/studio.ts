import type { Message } from 'discord.js';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	TextDisplayBuilder,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	ThumbnailBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	MessageFlags
} from 'discord.js';

import { Command, CommandContext } from '#core/Command';
import type { YunaClient } from '#core/YunaClient';
import { FilterEngine } from '#audio/FilterEngine';
import { config } from '#config/config';
import emoji from '#config/emoji';
import phrases from '#utils/phrases';
import { logger } from '#utils/logger';
import { formatDuration } from '#ui/Formatters';

const BRAND_FOOTER = 'Built with ♥ under CodeX Development';

/** Human-friendly display names for the raw preset keys. */
const NICE: Record<string, string> = {
	bassboost: 'Bass Boost', deepbass: 'Deep Bass', superbass: 'Super Bass', boost: 'Audio Boost',
	warm: 'Warm', soft: 'Soft', treble: 'Treble', bright: 'Bright', flat: 'Flat',
	pop: 'Pop', rock: 'Rock', electronic: 'Electronic', jazz: 'Jazz', classical: 'Classical',
	hiphop: 'Hip-Hop', reggae: 'Reggae', metal: 'Metal', oldschool: 'Old School',
	nightcore: 'Nightcore', vaporwave: 'Vaporwave', vocals: 'Vocals',
};
const nice = (n: string) => NICE[n] || n.charAt(0).toUpperCase() + n.slice(1);

const DESC: Record<string, string> = {
	bassboost: 'Boost the low-end punch', deepbass: 'Deep, heavy sub-bass', superbass: 'Maximum bass impact',
	boost: 'Full-spectrum lift', warm: 'Soft analogue warmth', soft: 'Gentle, relaxed tone',
	treble: 'Sharper highs', bright: 'Airy sparkle', flat: 'Neutral reference',
	pop: 'Pop tuning curve', rock: 'Rock tuning curve', electronic: 'EDM tuning curve', jazz: 'Jazz tuning curve',
	classical: 'Classical tuning curve', hiphop: 'Hip-Hop tuning curve', reggae: 'Reggae tuning curve',
	metal: 'Metal tuning curve', oldschool: 'Vintage tuning curve',
	nightcore: 'Faster + higher pitch', vaporwave: 'Slower + dreamy', vocals: 'Push the vocal mids',
};

/** Category → emoji + member presets, used for the names block and menu grouping. */
const CATEGORIES: Array<{ emoji: string; name: string; items: string[] }> = [
	{ emoji: '🔊', name: 'Bass', items: ['bassboost', 'deepbass', 'superbass', 'boost', 'warm', 'soft'] },
	{ emoji: '✨', name: 'Treble', items: ['treble', 'bright', 'flat'] },
	{ emoji: '🎸', name: 'Genre', items: ['pop', 'rock', 'electronic', 'jazz', 'classical', 'hiphop', 'reggae', 'metal', 'oldschool'] },
	{ emoji: '⚡', name: 'Vibe', items: ['nightcore', 'vaporwave'] },
	{ emoji: '🗣️', name: 'Vocal', items: ['vocals'] },
];
const ALL = CATEGORIES.flatMap((c) => c.items);
const CAT_OF: Record<string, string> = Object.fromEntries(CATEGORIES.flatMap((c) => c.items.map((i) => [i, c.emoji])));

class FilterStudioCommand extends Command {
	constructor() {
		super({
			name: 'filter',
			description: 'Open the interactive Filter Studio for this player',
			usage: 'filter [preset]',
			aliases: ['filters', 'filterstudio', 'fs'],
			category: 'music',
			examples: ['filter', 'filter bassboost', 'filters'],
			cooldown: 3,
			access: { voice: true, sameVoice: true, player: true },
			slash: {
				enabled: true,
				autoDefer: true,
				data: {
					name: 'filter',
					description: 'Open the interactive Filter Studio',
					options: [
						{
							name: 'preset',
							description: 'Apply a preset immediately (or leave empty to open the studio)',
							type: 3,
							required: false,
							autocomplete: true
						}
					]
				}
			}
		});
	}

	async autocomplete({ interaction }: any) {
		const focused = interaction.options.getFocused().toLowerCase();
		const matches = ALL.filter((p) => p.includes(focused) || nice(p).toLowerCase().includes(focused)).slice(0, 25);
		await interaction.respond(matches.map((p) => ({ name: nice(p), value: p })));
	}

	async execute(ctx: CommandContext) {
		const { client, message, interaction, args = [] } = ctx;
		const context: any = interaction || message;
		const guildId = context.guildId || context.guild?.id;
		const player = client?.music?.getPlayer(guildId);
		if (!player) {
			return this._reply(context, this._panel({ player: null, active: [] }, ctx.locale));
		}

		// Direct apply from message arg or slash option, then open the studio.
		const direct = interaction
			? interaction.options?.getString?.('preset')
			: (args[0] ? args[0].toLowerCase() : undefined);
		if (direct && FilterEngine.getPresetInfo(direct)) {
			await this._apply(player, direct);
		}

		const container = this._panel(player, ctx.locale);
		const msg: Message = await this._reply(context, container, true);
		this._setupCollector(msg, context, player, ctx.locale);
		return msg;
	}

	async slashExecute(ctx: CommandContext) {
		return this.execute(ctx);
	}

	// ────────────────────────────────────────────────────────────────────────────
	// Backend: filter state
	// ────────────────────────────────────────────────────────────────────────────

	_getActive(player: any): string[] {
		return (player?.get?.('activeFilters') as string[]) || [];
	}

	_setActive(player: any, list: string[]) {
		try { player?.set?.('activeFilters', list); } catch { /* non-fatal */ }
	}

	async _apply(player: any, preset: string) {
		await FilterEngine.apply(player, preset);
		const active = this._getActive(player);
		if (!active.includes(preset)) active.push(preset);
		this._setActive(player, active);
	}

	/** Removes one preset while keeping the rest of the stack intact. */
	async _remove(player: any, preset: string) {
		const remaining = this._getActive(player).filter((p) => p !== preset);
		await FilterEngine.reset(player);
		for (const p of remaining) await FilterEngine.apply(player, p);
		this._setActive(player, remaining);
	}

	async _clear(player: any) {
		await FilterEngine.reset(player);
		this._setActive(player, []);
	}

	_getLoop(player: any) {
		const m = player?.repeatMode;
		return m === 1 ? 'Track' : m === 2 ? 'Queue' : 'Off';
	}

	// ────────────────────────────────────────────────────────────────────────────
	// Card builders
	// ────────────────────────────────────────────────────────────────────────────

	_footer(container: ContainerBuilder) {
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${BRAND_FOOTER}`));
		return container;
	}

	/** Guards against malformed artwork URLs that would throw in the builder. */
	_artUrl(url?: string): string {
		const fallback = config.assets.defaultThumbnail;
		if (!url) return fallback;
		return /^https?:\/\//i.test(url) ? url : fallback;
	}

	_namesBlock(): string {
		const total = ALL.length;
		const rows = CATEGORIES.map((c) => `${c.emoji} **${c.name}** — **${c.items.length}** presets`).join('\n');
		return `**Available Filters** *(${total} presets)*\n${rows}\n\n-# All ${total} presets are in the menu below.`;
	}

	/** The full studio panel: stats → names → apply select → Clear/Random. */
	_panel(player: any, locale: string) {
		const active = this._getActive(player);
		const track = player?.queue?.current;

		const c = new ContainerBuilder();
		c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emoji.get('music') || '🎛️'} ### Filter Studio`));
		c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

		// Playing stats + filter status + thumbnail, in one section.
		let info: string;
		if (track) {
			const state = player?.paused ? '⏸ Paused' : '▶ Playing';
			const pos = formatDuration(player?.position || 0);
			const dur = formatDuration(track?.info?.duration || 0);
			info =
				`**${track?.info?.title || 'Unknown'}**\n` +
				`> 👤 ${track?.info?.author || 'Unknown'}  ·  ⏱ ${pos} / ${dur}\n` +
				`> ${state}  ·  🔊 ${player?.volume ?? 100}%  ·  🔁 ${this._getLoop(player)}\n\n`;
		} else {
			info = '*No track is playing right now.*\n\n';
		}
		info += `**Filter:** ${active.length ? active.map((p) => `\`${nice(p)}\``).join(' · ') : '*None — clean audio*'}`;

		c.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(info))
				.setThumbnailAccessory(new ThumbnailBuilder().setURL(this._artUrl(track?.info?.artworkUrl)))
		);
		c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

		c.addTextDisplayComponents(new TextDisplayBuilder().setContent(this._namesBlock()));
		c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

		// Apply / remove select — the menu holds every preset.
		c.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId('fl_apply')
				.setPlaceholder('Apply or remove a filter…')
				.addOptions(ALL.map((p) =>
					new StringSelectMenuOptionBuilder()
						.setLabel(nice(p))
						.setValue(p)
						.setEmoji(CAT_OF[p] || '🎵')
						.setDescription(DESC[p] || 'Filter preset')
				))
		));
		c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

		c.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId('fl_clear').setLabel('Clear').setEmoji('🧹').setStyle(ButtonStyle.Danger),
			new ButtonBuilder().setCustomId('fl_random').setLabel('Random').setEmoji('🎲').setStyle(ButtonStyle.Primary),
		));

		return this._footer(c);
	}

	// ────────────────────────────────────────────────────────────────────────────
	// Collector wiring
	// ────────────────────────────────────────────────────────────────────────────

	_setupCollector(msg: Message, context: any, player: any, locale: string) {
		const authorId = context.author?.id || context.user?.id;
		const collector = (msg as any).createMessageComponentCollector({
			time: 300_000,
			filter: (i: any) => typeof i.customId === 'string' && i.customId.startsWith('fl_')
		});

		collector.on('collect', async (i: any) => {
			if (i.user.id !== authorId) {
				return i.reply({ content: phrases.get('notYourInteraction') || 'These controls are not for you.', flags: MessageFlags.Ephemeral }).catch(() => {});
			}
			try {
				if (i.customId === 'fl_apply') {
					const preset = i.values?.[0];
					if (!FilterEngine.getPresetInfo(preset)) return this._edit(i, this._panel(player, locale));
					const active = this._getActive(player);
					if (active.includes(preset)) await this._remove(player, preset);
					else await this._apply(player, preset);
					return this._edit(i, this._panel(player, locale));
				}
				if (i.customId === 'fl_clear') {
					await this._clear(player);
					return this._edit(i, this._panel(player, locale));
				}
				if (i.customId === 'fl_random') {
					const active = this._getActive(player);
					const pool = ALL.filter((p) => !active.includes(p));
					const pick = (pool.length ? pool : ALL)[Math.floor(Math.random() * (pool.length ? pool.length : ALL.length))];
					await this._apply(player, pick);
					return this._edit(i, this._panel(player, locale));
				}
			} catch (error: any) {
				logger.error('FilterStudio', `Collector error (${i.customId}):`, error);
				if (!i.replied && !i.deferred) {
					i.reply({ content: phrases.get('errorGeneric') || 'Something went wrong handling that action.', flags: MessageFlags.Ephemeral }).catch(() => {});
				}
			}
		});
	}

	async _edit(interaction: any, container: ContainerBuilder) {
		return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(async () => {
			return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
		});
	}

	async _reply(context: any, container: ContainerBuilder, returnMessage = false): Promise<any> {
		const payload = { components: [container], flags: MessageFlags.IsComponentsV2 };
		if (context.editReply && (context.deferred || context.replied)) {
			await context.editReply(payload);
			return returnMessage ? await context.fetchReply?.().catch(() => null) : undefined;
		}
		return context.reply(payload);
	}
}

export default new FilterStudioCommand();

// Made by Nikhil Under CodeX Devs
