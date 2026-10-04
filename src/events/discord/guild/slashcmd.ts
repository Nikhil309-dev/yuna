import { InteractionType, MessageFlags } from "discord.js";
import { Middleware } from "#core/Middleware";
import { logger } from "#utils/logger";
import { DiscordLogger } from "#utils/DiscordLogger";
import { db } from "#database/Database";
import { i18n } from "#utils/i18n.js";
import { localeFor, runWithLocale } from "#utils/locale.js";
import { PlayerManager } from "#audio/PlayerManager";

function getCommandFile(interaction: any, client: any) {
  const { commandName } = interaction;
  let subCommandName = null;
  try {
    subCommandName = interaction.options.getSubcommand(false);
  } catch (e) {}

  const key = subCommandName ? [commandName, subCommandName].toString() : commandName;
  return client.commands.get(key) || client.commands.get(commandName);
}

export default {
  name: "interactionCreate",
  async execute(interaction: any, client: any) {
    if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
      const commandToExecute = getCommandFile(interaction, client);
      if (!commandToExecute || !commandToExecute.autocomplete) return;
      try {
        await commandToExecute.autocomplete({ interaction, client });
      } catch (error) {
        logger.error("InteractionCreate", `Error handling autocomplete for '${interaction.commandName}'`, error);
      }
      return;
    }

    if (interaction.type !== InteractionType.ApplicationCommand) return;

    // Resolve the requester's language (user → server → en-US) and bind it to
    // the whole request so every reply below is translated for them.
    const locale = localeFor(interaction.user?.id, interaction.guild?.id);
    const tr = (key: string, replacements: Record<string, any> = {}) => i18n.ui(locale, key, replacements);

    if (!interaction.inGuild()) {
      return interaction.reply({
        content: tr("common.guildOnly"),
        ephemeral: true,
      });
    }

    const command = getCommandFile(interaction, client);
    if (!command) {
      return interaction.reply({
        content: tr("common.outdated"),
        ephemeral: true,
      });
    }

    const player = client.music?.getPlayer(interaction.guild.id);
    const ctx = {
      interaction,
      client,
      message: null,
      author: interaction.user,
      options: interaction.options,
      args: [],
      guild: interaction.guild,
      user: interaction.user,
      member: interaction.member,
      channel: interaction.channel,
      player,

      pm: player ? new PlayerManager(player) : null,
      locale,
      t: (category: string, replacements: Record<string, unknown> = {}) => i18n.t(locale, category, replacements)
    };

    try {
      const middlewareResult = await runWithLocale(locale, () => Middleware.run(ctx, command));
      if (!middlewareResult.pass) {
        const res = middlewareResult.response;
        const payload = res?.components
          ? { components: [res], flags: MessageFlags.IsComponentsV2, ephemeral: true }
          : (typeof res === 'object' ? { ...res, ephemeral: true } : { content: String(res), ephemeral: true });
        return interaction.reply(payload);
      }

      if (command.slash?.autoDefer) {
        const isEphemeral = !!command.access?.ownerOnly;
        await interaction.deferReply({ ephemeral: isEphemeral });
      }

      if (db.economy) {
        db.economy.addCoins(interaction.user.id, 1);
      }

      const proceed = await command.beforeExecute(ctx);
      if (!proceed) {
        const errorPayload = { content: tr("common.cancelled"), ephemeral: true };
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(errorPayload).catch(() => {});
        } else {
          await interaction.reply(errorPayload).catch(() => {});
        }
        return;
      }

      await runWithLocale(ctx.locale, async () => {
        // Prefer the dedicated slash handler; fall back to the shared execute().
        if (typeof command.slashExecute === 'function') {
          await command.slashExecute(ctx);
        } else {
          await command.execute(ctx);
        }
      });
      await command.afterExecute(ctx);
      DiscordLogger.logCmdRun(client, { user: interaction.user, commandName: command.name, guild: interaction.guild, type: 'Slash' });

    } catch (error) {
      DiscordLogger.logError(client, { context: `SlashCmd:${command.name}`, error, message: `Error running slash command` });
      if (typeof command.onError === 'function') {
        await command.onError(ctx, error);
      } else {
        logger.error("InteractionCreate", `Error executing slash command '${command.name}'`, error);
      }

      // Never leave the user staring at a bare "interaction failed". The base
      // onError() only logs, so surface a localized fallback unless the command
      // already produced its own response (editReply sets replied = true).
      try {
        if (!interaction.replied) {
          const errReply = { content: tr("common.unexpected"), ephemeral: true };
          if (interaction.deferred) await interaction.editReply(errReply);
          else await interaction.reply(errReply);
        }
      } catch { /* response already sent / expired interaction */ }
    }
  },
};

// Made by Nikhil Under CodeX Devs
