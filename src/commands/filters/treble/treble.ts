import { MessageFlags } from "discord.js";
import { buildFilterAppliedContainer, buildFilterError } from "#ui/filterCard";
import { Command, CommandContext } from '#core/Command';
import { PlayerManager } from "#audio/PlayerManager";

class TrebleFilterCommand extends Command {
	constructor() {
		super({
			name: "treble",
			description: "Apply treble equalizer preset to the music",
			usage: "treble",
			aliases: [],
			category: "music",
			examples: ["treble"],
			cooldown: 2,
			voiceRequired: true,
			sameVoiceRequired: true,
			playerRequired: true,
			playingRequired: true,
			enabledSlash: true,
			slashData: {
				name: ["filter", "treble"],
				description: "Apply treble equalizer preset to the music",
			},
		});
	}

	async execute({ message, pm }: any) {
		return this._handleFilter(message, pm);
	}

	async slashExecute({ interaction, pm }: any) {
		return this._handleFilter(interaction, pm);
	}

	async _handleFilter(context: CommandContext, pm: PlayerManager) {
		try {
			await pm.player.filterManager.setEQ([
   {
      band: 0,
      gain: -0.8
   },
   {
      band: 1,
      gain: -0.8
   },
   {
      band: 2,
      gain: -0.8
   },
   {
      band: 3,
      gain: -0.4
   },
   {
      band: 4,
      gain: 0.3
   },
   {
      band: 5,
      gain: 1
   },
   {
      band: 6,
      gain: 0.8
   },
   {
      band: 7,
      gain: 0.8
   },
   {
      band: 8,
      gain: 0.8
   },
   {
      band: 9,
      gain: 0.8
   },
   {
      band: 10,
      gain: 0.8
   },
   {
      band: 11,
      gain: 0.8
   },
   {
      band: 12,
      gain: 0.8
   },
   {
      band: 13,
      gain: 0.8
   }
]);

			return this._reply(context, buildFilterAppliedContainer("Treble"));
		} catch (error) {
			return this._reply(context, buildFilterError("treble"));
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

export default new TrebleFilterCommand();

// Made by Nikhil Under CodeX Devs
