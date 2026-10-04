import type { Message, Interaction, CommandInteraction } from 'discord.js';
import type { YunaClient } from '#core/YunaClient';
import { Routes } from 'discord-api-types/v10';
import {
	ContainerBuilder,
	TextDisplayBuilder,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	ThumbnailBuilder,
	MessageFlags,
    REST
} from 'discord.js';

import { config } from '#config/config';
import { Command } from '#core/Command';
import { logger } from '#utils/logger';
import emoji from '#config/emoji';
import { buildContainer, buildError, buildSuccess } from '#ui/Theme';
import phrases from '#utils/phrases';
import { i18n } from '#utils/i18n';

class UpdateSlashCommand extends Command {
	constructor() {
		super({
			name: 'updateslash',
			description: 'Registers or updates all slash commands with Discord globally (Owner Only)',
			usage: 'updateslash',
			aliases: ['slash: update'],
			category: 'developer',
			examples: [
				'updateslash',
				'slash: update',
			],
			access: { ownerOnly: true },
			slash: { enabled: false },
		});
	}

	async execute({ client, message }: any) {
		const initialContainer = new ContainerBuilder();

		initialContainer.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(i18n.cmd("### {emoji} Scanning Commands", { emoji: emoji.get("info") }))
		);

		initialContainer.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
		);

		initialContainer.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(i18n.cmd("**Checking for slash-enabled commands...**")),
				)
				.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
		);

		const msg = await message.reply({ components: [initialContainer], flags: MessageFlags.IsComponentsV2 });

		try {
			const slashCommandsData = client.commandHandler.getSlashCommandsData();

			if (!slashCommandsData || slashCommandsData.length === 0) {
				const noCommandsContainer = new ContainerBuilder();

				noCommandsContainer.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(i18n.cmd("### {emoji} No Commands Found", { emoji: emoji.get("info") }))
				);

				noCommandsContainer.addSeparatorComponents(
					new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
				);

				noCommandsContainer.addSectionComponents(
					new SectionBuilder()
						.addTextDisplayComponents(
							new TextDisplayBuilder().setContent(i18n.cmd("**No slash-enabled commands found to register.**")),
						)
						.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
				);

				noCommandsContainer.addSeparatorComponents(
					new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
				);

				return msg.edit({ components: [noCommandsContainer] });
			}

			const rest = new REST({ version: '10' }).setToken(config.token!);

			const currentCommands = await rest.get(Routes.applicationCommands(client.user!.id));

			const needsUpdate = this._compareCommands(currentCommands, slashCommandsData);

			if (!needsUpdate) {
				const upToDateContainer = new ContainerBuilder();

				upToDateContainer.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(i18n.cmd("### {emoji} Commands Up to Date", { emoji: emoji.get("check") }))
				);

				upToDateContainer.addSeparatorComponents(
					new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
				);

				upToDateContainer.addSectionComponents(
					new SectionBuilder()
						.addTextDisplayComponents(
							new TextDisplayBuilder().setContent(i18n.cmd("**All {count} commands are already registered and up to date.**", { count: slashCommandsData.length })),
						)
						.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
				);

				upToDateContainer.addSeparatorComponents(
					new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
				);

				return msg.edit({ components: [upToDateContainer] });
			}

			const validationContainer = new ContainerBuilder();

			validationContainer.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(i18n.cmd("### {emoji} Validating Commands", { emoji: emoji.get("info") }))
			);

			validationContainer.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			validationContainer.addSectionComponents(
				new SectionBuilder()
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(i18n.cmd("**Found {count} commands - validating...**", { count: slashCommandsData.length })),
					)
					.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
			);

			await msg.edit({ components: [validationContainer] });

			const nameRegex = /^[\da-z-]{1,32}$/;
			for (const cmdData of slashCommandsData as any[]) {
				if (!nameRegex.test(cmdData.name)) {
					const validationErrorMsg = i18n.cmd('Validation failed for command name: "{name}". Names must be 1-32 characters, all lowercase, and contain no spaces or special characters other than hyphens.', { name: cmdData.name });
					logger.error('UpdateSlash', validationErrorMsg, null);

					const validationErrorContainer = new ContainerBuilder();

					validationErrorContainer.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(i18n.cmd("### {emoji} Validation Failed", { emoji: emoji.get("cross") }))
					);

					validationErrorContainer.addSeparatorComponents(
						new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
					);

					validationErrorContainer.addSectionComponents(
						new SectionBuilder()
							.addTextDisplayComponents(
								new TextDisplayBuilder().setContent(i18n.cmd("**Invalid Command Name: `{name}`**", { name: cmdData.name })),
								new TextDisplayBuilder().setContent(i18n.cmd("Names must be 1-32 characters, lowercase, and contain only letters, numbers, and hyphens.")),
							)
							.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
					);

					validationErrorContainer.addSeparatorComponents(
						new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
					);

					return msg.edit({ components: [validationErrorContainer] });
				}
			}

			const processingContainer = new ContainerBuilder();

			processingContainer.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(i18n.cmd("### {emoji} Registering Commands", { emoji: emoji.get("info") }))
			);

			processingContainer.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			processingContainer.addSectionComponents(
				new SectionBuilder()
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(i18n.cmd("**Registering {count} commands globally...**", { count: slashCommandsData.length })),
					)
					.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
			);

			await msg.edit({ components: [processingContainer] });

			await rest.put(
				Routes.applicationCommands(client.user!.id),
				{ body: slashCommandsData },
			);

			const successContainer = new ContainerBuilder();

			successContainer.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(i18n.cmd("### {emoji} Registration Complete", { emoji: emoji.get("check") }))
			);

			successContainer.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			successContainer.addSectionComponents(
				new SectionBuilder()
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(i18n.cmd("**Successfully registered {count} commands globally.**", { count: slashCommandsData.length })),
						new TextDisplayBuilder().setContent(i18n.cmd("Commands may take up to 1 hour to appear globally.")),
					)
					.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
			);

			successContainer.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			await msg.edit({ components: [successContainer] });

			logger.success('UpdateSlash', `Registered ${slashCommandsData.length} commands.`);
		} catch (error: any) {
			logger.error('UpdateSlash', 'Failed to register slash commands', error);

			const errorContainer = new ContainerBuilder();

			errorContainer.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(i18n.cmd("### {emoji} Registration Failed", { emoji: emoji.get("cross") }))
			);

			errorContainer.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			errorContainer.addSectionComponents(
				new SectionBuilder()
					.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(i18n.cmd("**An error occurred while registering commands.**")),
						new TextDisplayBuilder().setContent(i18n.cmd("Check console logs for more details.")),
					)
					.setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets.defaultThumbnail))
			);

			errorContainer.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
			);

			await msg.edit({ components: [errorContainer] });
		}
	}

	_compareCommands(currentCommands: any, newCommands: any) {
		if (currentCommands.length !== newCommands.length) {
			return true;
		}

		const currentMap = new Map(currentCommands.map((cmd: any) => [cmd.name, cmd]));

		for (const newCmd of newCommands) {
			const existing = currentMap.get(newCmd.name);
			if (!existing || JSON.stringify(existing) !== JSON.stringify(newCmd)) {
				return true;
			}
		}

		return false;
	}
}

export default new UpdateSlashCommand();

// Made by Nikhil Under CodeX Devs
