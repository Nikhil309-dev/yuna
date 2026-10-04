import { MessageFlags } from "discord.js";
import { buildFilterAppliedContainer, buildFilterError } from "#ui/filterCard";
import { Command, CommandContext } from '#core/Command';
import { PlayerManager } from "#audio/PlayerManager";

class VaporwaveFilterCommand extends Command {
	constructor() {
		super({
			name: "vaporwave",
			description: "Apply vaporwave equalizer preset to the music",
			usage: "vaporwave",
			aliases: [],
			category: "music",
			examples: ["vaporwave"],
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
					name: "vaporwave",
					description: "Apply vaporwave equalizer preset to the music",
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
      gain: 0.6
   },
   {
      band: 1,
      gain: 0.4
   },
   {
      band: 2,
      gain: 0.2
   },
   {
      band: 3,
      gain: -0.1
   },
   {
      band: 4,
      gain: -0.3
   },
   {
      band: 5,
      gain: -0.2
   },
   {
      band: 6,
      gain: 0
   },
   {
      band: 7,
      gain: 0.2
   },
   {
      band: 8,
      gain: 0.1
   },
   {
      band: 9,
      gain: -0.1
   },
   {
      band: 10,
      gain: -0.2
   },
   {
      band: 11,
      gain: -0.1
   },
   {
      band: 12,
      gain: 0
   },
   {
      band: 13,
      gain: 0.1
   }
]);

			return this._reply(context, buildFilterAppliedContainer("Vaporwave"));
		} catch (error) {
			return this._reply(context, buildFilterError("vaporwave"));
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

export default new VaporwaveFilterCommand();

// Made by Nikhil Under CodeX Devs
