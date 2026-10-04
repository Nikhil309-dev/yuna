import { MessageFlags } from "discord.js";
import { buildFilterAppliedContainer, buildFilterError } from "#ui/filterCard";
import { Command, CommandContext } from '#core/Command';
import { PlayerManager } from "#audio/PlayerManager";

class BassboostFilterCommand extends Command {
	constructor() {
		super({
			name: "bassboost",
			description: "Apply bassboost equalizer preset to the music",
			usage: "bassboost",
			aliases: [],
			category: "music",
			examples: ["bassboost"],
			cooldown: 2,
			access: {
				voice: true,
				sameVoice: true,
				player: true,
				playing: true,
			},
			slash: {
				enabled: true,
				autoDefer: true,
				data: {
					name: "bassboost",
					description: "Apply bassboost equalizer preset to the music",
				},
			},
		});
	}

	async execute(ctx: CommandContext) {
		const { client, message, interaction, player, pm, args = [] } = ctx;
		const context = interaction || message;
		const activePm = pm || (player ? new PlayerManager(player) : (client?.music?.getPlayer(context.guildId || context.guild?.id) ? new PlayerManager(client.music.getPlayer(context.guildId || context.guild?.id)) : null));
		if (!activePm) return;
		return this._handleFilter(context, activePm);
	}

	async slashExecute(ctx: CommandContext) {
		return this.execute(ctx);
	}

	async _handleFilter(context: CommandContext, pm: PlayerManager) {
		try {
			await pm.player.filterManager.setEQ([
   {
      band: 0,
      gain: 0.6
   },
   {
      band: 1,
      gain: 0.67
   },
   {
      band: 2,
      gain: 0.67
   },
   {
      band: 3,
      gain: 0
   },
   {
      band: 4,
      gain: -0.5
   },
   {
      band: 5,
      gain: 0.15
   },
   {
      band: 6,
      gain: -0.45
   },
   {
      band: 7,
      gain: 0.23
   },
   {
      band: 8,
      gain: 0.35
   },
   {
      band: 9,
      gain: 0.45
   },
   {
      band: 10,
      gain: 0.55
   },
   {
      band: 11,
      gain: 0.6
   },
   {
      band: 12,
      gain: 0.55
   },
   {
      band: 13,
      gain: 0
   }
]);

			return this._reply(context, buildFilterAppliedContainer("Bassboost"));
		} catch (error) {
			return this._reply(context, buildFilterError("bassboost"));
		}
	}
	async _reply(context: CommandContext, container: any) {
		const payload = {
			components: [container],
			flags: MessageFlags.IsComponentsV2,
		};
		if (context.editReply && (context.deferred || context.replied)) {
			return await context.editReply!(payload);
		}
		return await context.reply!(payload);
	}
}

export default new BassboostFilterCommand();

// Made by Nikhil Under CodeX Devs
