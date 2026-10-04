import { MessageFlags } from "discord.js";
import { buildError } from "#ui/Theme";
import { buildFilterResetContainer } from "#ui/filterCard";

import { Command, CommandContext } from '#core/Command';
import { PlayerManager } from "#audio/PlayerManager";
import { i18n } from "#utils/i18n";

class ResetFilterCommand extends Command {
	constructor() {
		super({
			name: "reset",
			description: "Reset all audio filters to default",
			usage: "reset",
			aliases: ["clear-filter", "resetfilter"],
			category: "music",
			examples: ["reset", "clear"],
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
					name: "reset",
					description: "Reset all audio filters to default",
				},
			},
		});
	}

	async execute(ctx: CommandContext) {
		const { client, message, interaction, player, pm, args = [] } = ctx;
		const context = interaction || message;
		const activePm = pm || (player ? new PlayerManager(player) : (client?.music?.getPlayer(context.guildId || context.guild?.id) ? new PlayerManager(client.music.getPlayer(context.guildId || context.guild?.id)) : null));
		if (!activePm) return;
		return this._handleResetFilter(context, activePm);
	}

	async slashExecute(ctx: CommandContext) {
		return this.execute(ctx);
	}

	async _handleResetFilter(context: CommandContext, pm: PlayerManager) {
		try {
			await pm.player.filterManager.clearEQ();

			return this._reply(context, buildFilterResetContainer());
		} catch (error) {
			return this._reply(
				context,
				buildError(i18n.cmd("Could not reset the audio filters."), "Error"),
			);
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
export default new ResetFilterCommand();

// Made by Nikhil Under CodeX Devs
