import { MessageFlags } from "discord.js";
import { buildFilterAppliedContainer, buildFilterError } from "#ui/filterCard";
import { Command, CommandContext } from '#core/Command';
import { PlayerManager } from "#audio/PlayerManager";

class OldschoolFilterCommand extends Command {
	constructor() {
		super({
			name: "oldschool",
			description: "Apply oldschool equalizer preset to the music",
			usage: "oldschool",
			aliases: [],
			category: "music",
			examples: ["oldschool"],
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
					name: "oldschool",
					description: "Apply oldschool equalizer preset to the music",
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
      gain: 0.1
   },
   {
      band: 1,
      gain: 0.05
   },
   {
      band: 2,
      gain: 0
   },
   {
      band: 3,
      gain: -0.05
   },
   {
      band: 4,
      gain: -0.1
   },
   {
      band: 5,
      gain: -0.15
   },
   {
      band: 6,
      gain: -0.2
   },
   {
      band: 7,
      gain: -0.25
   },
   {
      band: 8,
      gain: -0.3
   },
   {
      band: 9,
      gain: -0.35
   },
   {
      band: 10,
      gain: -0.4
   },
   {
      band: 11,
      gain: -0.45
   },
   {
      band: 12,
      gain: -0.5
   },
   {
      band: 13,
      gain: -0.55
   }
]);

			return this._reply(context, buildFilterAppliedContainer("Oldschool"));
		} catch (error) {
			return this._reply(context, buildFilterError("oldschool"));
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

export default new OldschoolFilterCommand();

// Made by Nikhil Under CodeX Devs
