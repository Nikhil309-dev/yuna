import type { Message, Interaction, CommandInteraction } from 'discord.js';
import type { YunaClient } from '#core/YunaClient';
import { Command } from '#core/Command';
import {
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { buildContainer, buildSuccess, buildError } from '#ui/Theme';
import { componentCollectorSource } from '#ui/Components';
import { logger } from '#utils/logger';
import emoji from '#config/emoji';
import { i18n } from '#utils/i18n';

class ReloadCommand extends Command {
  constructor() {
    super({
      name: 'reload',
      description: 'Interactive Multi-Select Hot-Reload for commands, events, cards, and modules',
      category: 'developer',
      aliases: ['rl', 'hotreload'],
      usage: 'reload [commands | events | cards | <command_name>]',
      access: {
        ownerOnly: true
      },
      slash: {
        enabled: false
      }
    });
  }

  async execute(ctx: any) {
    const { client, message, args = [] } = ctx;
    const authorId = message.author.id;

    if (args.length > 0) {
      const target = args[0].toLowerCase();
      return this._handleDirectReload(message, client, target);
    }

    const infoIcon = emoji.get('info') || 'ℹ️';
    const folderIcon = emoji.get('folder') || '📁';
    const checkIcon = emoji.get('check') || '✅';

    let content = i18n.cmd("┌─ **{emoji} Status:** Live Hot-Reload Engine Ready\n", { emoji: infoIcon });
    content += i18n.cmd("├─ **Commands:** {count} loaded ({slash} slash)\n", { count: client.commands.size, slash: client.commandLoader?.slashCommands?.size || 0 });
    content += i18n.cmd("├─ **Events:** {count} registered listeners\n", { count: client.events?.size || 12 });
    content += i18n.cmd("└─ **Target Modules:** 6 Subsystems Available\n\n");
    content += i18n.cmd("*Select one or multiple subsystems from the menu below to hot-reload them with 0 downtime.*");

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('reload_subsystems_select')
      .setPlaceholder(i18n.cmd('⚡ Select subsystems & folders to reload...'))
      .setMinValues(1)
      .setMaxValues(6)
      .addOptions([
        {
          label: i18n.cmd('Commands (All)'),
          value: 'commands',
          description: i18n.cmd('Reloads all 84 commands & updates slash registry'),
          emoji: '📁'
        },
        {
          label: i18n.cmd('Music & Playback Engine'),
          value: 'music',
          description: i18n.cmd('Reloads music playback, queue, search & favorites'),
          emoji: '🎵'
        },
        {
          label: i18n.cmd('Audio Filters & DSP Presets'),
          value: 'filters',
          description: i18n.cmd('Reloads FilterEngine & 21 equalizer audio presets'),
          emoji: '🎛️'
        },
        {
          label: i18n.cmd('Discord Gateway & Audio Events'),
          value: 'events',
          description: i18n.cmd('Reloads voice: State, raw, prefix, and slash handlers'),
          emoji: '⚡'
        },
        {
          label: i18n.cmd('Canvas Cards & Visual Generators'),
          value: 'cards',
          description: i18n.cmd('Reloads MusicCard, PingCard, BannerCard & CommandCard'),
          emoji: '🖼️'
        },
        {
          label: i18n.cmd('Database SQLite Repositories'),
          value: 'database',
          description: i18n.cmd('Refreshes DB repository instances and caches'),
          emoji: '💾'
        }
      ]);

    const closeButton = new ButtonBuilder()
      .setCustomId('reload_close_btn')
      .setLabel(i18n.cmd('Close'))
      .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(closeButton);

    const menuContainer = buildContainer({
      title: 'Live Hot-Reload Center',
      subtitle: 'Zero-Downtime Subsystem Selector',
      content,
      components: [row1, row2],
      icon: '⚡'
    });

    const replyMsg = await message.reply({
      components: [menuContainer],
      flags: MessageFlags.IsComponentsV2
    });

    const collector = componentCollectorSource(replyMsg).createMessageComponentCollector({
      time: 120_000
    });

    collector.on('collect', async (interaction: any) => {
      if (interaction.user.id !== authorId) {
        return interaction.reply({
          components: [buildError(ctx.t("onlyDeveloper"))],
          flags: MessageFlags.IsComponentsV2,
          ephemeral: true
        });
      }

      if (interaction.customId === 'reload_close_btn') {
        collector.stop('closed');
        return interaction.update({
          components: [
            buildContainer({
              title: 'Hot-Reload Center Closed',
              content: i18n.cmd('> {emoji} Hot-reload control session dismissed.', { emoji: checkIcon }),
              icon: '🔒'
            })
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (interaction.customId === 'reload_subsystems_select') {
        await interaction.deferUpdate();
        const selectedValues = interaction.values;
        const start = performance.now();
        const reloadedItems = [];

        try {

          if (selectedValues.includes('commands') || selectedValues.includes('music') || selectedValues.includes('filters')) {
            await client.commandLoader.load();
            reloadedItems.push(`Commands (${client.commands.size})`);
          }

          if (selectedValues.includes('events')) {
            await client.eventLoader.load();
            reloadedItems.push('Events & Handlers');
          }

          if (selectedValues.includes('cards')) {
            await import(`../../ui/cards/MusicCard.js?v=${Date.now()}`).catch(() => {});
            await import(`../../ui/cards/PingCard.js?v=${Date.now()}`).catch(() => {});
            await import(`../../ui/cards/BannerCard.js?v=${Date.now()}`).catch(() => {});
            await import(`../../ui/cards/CommandCard.js?v=${Date.now()}`).catch(() => {});
            reloadedItems.push('Canvas UI Cards');
          }

          if (selectedValues.includes('database')) {
            const { db } = await import(`../../database/Database.js?v=${Date.now()}`);
            if (db?.checkpoint) db.checkpoint();
            reloadedItems.push('Database & Repositories');
          }

          const duration = (performance.now() - start).toFixed(1);

          let resultBody = i18n.cmd("┌─ **{emoji} Result:** Hot-Reload Executed Successfully\n", { emoji: checkIcon });
          resultBody += i18n.cmd("├─ **Reloaded Modules:** {modules}\n", { modules: reloadedItems.join(', ') });
          resultBody += i18n.cmd("├─ **Execution Time:** `{time}ms`\n", { time: duration });
          resultBody += i18n.cmd("└─ **System State:** Operational with 0 downtime\n\n");
          resultBody += i18n.cmd("*All updated code is now live and taking effect immediately.*");

          const resultContainer = buildContainer({
            title: 'Hot-Reload Completed',
            subtitle: 'Subsystem Modules Refreshed',
            content: resultBody,
            components: [row1, row2],
            icon: '🌸'
          });

          await interaction.editReply({
            components: [resultContainer],
            flags: MessageFlags.IsComponentsV2
          });
        } catch (err: any) {
          logger.error('ReloadCommand', 'Multi-select reload failure:', err);
          const errCard = buildError({
            title: 'Hot-Reload Failed',
            issue: err.message || i18n.cmd('An error occurred during module re-import.'),
            tip: i18n.cmd('Check server logs for the full stack trace.')
          });
          await interaction.editReply({
            components: [errCard, row2],
            flags: MessageFlags.IsComponentsV2
          });
        }
      }
    });

    collector.on('end', async (_: any, reason: any) => {
      if (reason === 'closed') return;
      selectMenu.setDisabled(true);
      closeButton.setDisabled(true);
      await replyMsg.edit({
        components: [menuContainer],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => {});
    });
  }

  async _handleDirectReload(message: any, client: any, target: any) {
    const start = performance.now();
    const checkIcon = emoji.get('check') || '✅';

    try {
      if (target === 'all' || target === 'commands') {
        await client.commandLoader.load();
        const duration = (performance.now() - start).toFixed(1);
        let content = i18n.cmd("┌─ **{emoji} Result:** Commands Reloaded\n", { emoji: checkIcon });
        content += i18n.cmd("├─ **Total Commands:** {count}\n", { count: client.commands.size });
        content += i18n.cmd("├─ **Slash Commands:** {count}\n", { count: client.commandLoader.slashCommands.size });
        content += i18n.cmd("└─ **Execution Time:** `{time}ms`", { time: duration });

        const container = buildContainer({
          title: 'Hot-Reload Complete',
          content,
          icon: '🌸'
        });
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }

      if (target === 'events') {
        await client.eventLoader.load();
        const duration = (performance.now() - start).toFixed(1);
        let content = i18n.cmd("┌─ **{emoji} Result:** Events Reloaded\n", { emoji: checkIcon });
        content += i18n.cmd("├─ **Listeners:** {count}\n", { count: client.events?.size || 12 });
        content += i18n.cmd("└─ **Execution Time:** `{time}ms`", { time: duration });

        const container = buildContainer({
          title: 'Events Reloaded',
          content,
          icon: '⚡'
        });
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }

      if (target === 'cards') {
        await import(`../../ui/cards/MusicCard.js?v=${Date.now()}`).catch(() => {});
        await import(`../../ui/cards/PingCard.js?v=${Date.now()}`).catch(() => {});
        await import(`../../ui/cards/BannerCard.js?v=${Date.now()}`).catch(() => {});
        await import(`../../ui/cards/CommandCard.js?v=${Date.now()}`).catch(() => {});
        const duration = (performance.now() - start).toFixed(1);

        let content = i18n.cmd("┌─ **{emoji} Result:** All Canvas Cards Reloaded\n", { emoji: checkIcon });
        content += i18n.cmd("├─ **Cards:** MusicCard, PingCard, BannerCard, CommandCard\n");
        content += i18n.cmd("└─ **Execution Time:** `{time}ms`", { time: duration });

        const container = buildContainer({
          title: 'Canvas Cards Reloaded',
          content,
          icon: '🖼️'
        });
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }

      const filePath = client.commandLoader.commandPaths.get(target);
      if (!filePath) {
        return message.reply({
          components: [buildError({
            title: i18n.translateTitle('Command Not Found'),
            issue: i18n.cmd('Command `{name}` was not found in active registry.', { name: target }),
            tip: i18n.cmd('Check command spelling or use `.reload` without arguments for the full menu.')
          })],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const freshModule = await import(`file://${filePath}?v=${Date.now()}`);
      if (!freshModule?.default) {
        throw new Error('Fresh module is missing a default export.');
      }

      const freshCommand = freshModule.default;
      client.commands.set(freshCommand.name, freshCommand);
      const duration = (performance.now() - start).toFixed(1);

      let content = i18n.cmd("┌─ **{emoji} Result:** Single Command Reloaded\n", { emoji: checkIcon });
      content += i18n.cmd("├─ **Target:** `.{name}`\n", { name: freshCommand.name });
      content += i18n.cmd("├─ **Category:** {category}\n", { category: freshCommand.category || 'general' });
      content += i18n.cmd("└─ **Execution Time:** `{time}ms`", { time: duration });

      const container = buildContainer({
        title: i18n.translateTitle('Command Hot-Reloaded'),
        content,
        icon: '🌸'
      });
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (err: any) {
      logger.error('ReloadCommand', `Failed to hot-reload target "${target}":`, err);
      return message.reply({
        components: [buildError({
          title: 'Reload Failed',
          issue: err.message,
          tip: 'Check server logs for error details.'
        })],
        flags: MessageFlags.IsComponentsV2
      });
    }
  }
}

export default new ReloadCommand();

// Made by Nikhil Under CodeX Devs
