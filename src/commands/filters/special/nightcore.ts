import { MessageFlags } from "discord.js";
import { buildFilterAppliedContainer, buildFilterError } from "#ui/filterCard";
import { Command, CommandContext } from '#core/Command';
import { PlayerManager } from "#audio/PlayerManager";

class NightcoreFilterCommand extends Command {
	constructor() {
		super({
			name: "nightcore",
			description: "Apply nightcore equalizer preset to the music",
			usage: "nightcore",
			aliases: [],
			category: "music",
			examples: ["nightcore"],
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
					name: "nightcore",
					description: "Apply nightcore equalizer preset to the music",
				},
			},
		});
	}

	async execute(ctx: CommandContext) {
		const { client, message, interaction, player, pm } = ctx;
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
      gain: 0.3
   },
   {
      band: 1,
      gain: 0.4
   },
   {
      band: 2,
      gain: 0.5
   },
   {
      band: 3,
      gain: 0.6
   },
   {
      band: 4,
      gain: 0.7
   },
   {
      band: 5,
      gain: 0.8
   },
   {
      band: 6,
      gain: 0.9
   },
   {
      band: 7,
      gain: 1
   },
   {
      band: 8,
      gain: 0.9
   },
   {
      band: 9,
      gain: 0.8
   },
   {
      band: 10,
      gain: 0.7
   },
   {
      band: 11,
      gain: 0.6
   },
   {
      band: 12,
      gain: 0.5
   },
   {
      band: 13,
      gain: 0.4
   }
]);

			return this._reply(context, buildFilterAppliedContainer("Nightcore"));
		} catch (error) {
			return this._reply(context, buildFilterError("nightcore"));
		}
	}
	async _reply(context: CommandContext, container: any) {
		const payload = {
			components: [container],
			flags: MessageFlags.IsComponentsV2,
		};
		if (context.editReply && (context.deferred || context.replied)) {
			return await context.editReply(payload);
		}
		if (context.reply) {
			return await context.reply(payload);
		}
		return context.channel.send(payload);
	}
}

export default new NightcoreFilterCommand();

// Made by Nikhil Under CodeX Devs
