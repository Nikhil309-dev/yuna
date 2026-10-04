import { Command, CommandContext } from '#core/Command';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder,
} from "discord.js";
import type { Message } from "discord.js";
import { db } from "#database/Database";
import { config } from "#config/config";
import emoji from "#config/emoji";
import { logger } from "#utils/logger";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import { componentCollectorSource } from "#ui/Components";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";

const PREMIUM_PREFIX_LIMIT = 5;
const COMMON_PREFIXES = ["!", ".", "?", "$", "%", "^", "&", "*"];

class PrefixCommand extends Command {
  constructor() {
    super({
      name: "prefix",
      description: i18n.cmd("View or change the bot prefix for this server."),
      usage: "prefix [new prefix]",
      aliases: ["setprefix"],
      category: "settings",
      examples: ["prefix", "prefix !", "setprefix $", "prefix ?"],
      cooldown: 1,
      access: {
        permissions: [PermissionFlagsBits.ManageMessages],
        botPermissions: [PermissionFlagsBits.SendMessages],
      },
      slash: {
        enabled: true,
        data: {
          name: "prefix",
          description: i18n.cmd("View or change the bot prefix for this server."),
          options: [
            {
              name: "set",
              description: i18n.cmd("Set a new prefix. This will overwrite it for standard servers."),
              type: 3,
              required: false,
              max_length: 5,
            },
          ],
        },
      },
    });
  }

  async execute({ message, args }: any) {
    await this._handleCommand(message, args[0]);
  }

  async slashExecute({ interaction }: any) {
    const newPrefix = interaction.options.getString("set");
    await this._handleCommand(interaction, newPrefix);
  }

  async _handleCommand(ctx: any, newPrefix: any) {
    const isPremium = db.isGuildPremium(ctx.guild.id);

    if (newPrefix) {
      await this._setPrefix(ctx, newPrefix, isPremium);
    } else {
      await this._showManagementUI(ctx, isPremium);
    }
  }

  async _setPrefix(ctx: any, newPrefix: any, isPremium: any) {
    if (newPrefix.length > 5) {
      return this._sendError(ctx, "Error", "Prefix is too long. Maximum 5 characters allowed.");
    }

    let prefixes = db.getPrefixes(ctx.guild.id);
    let updateMessage;

    if (isPremium) {
      if (prefixes.includes(newPrefix)) {
        return this._sendError(ctx, i18n.translateTitle("Prefix Exists"), i18n.cmd('The prefix `{prefix}` is already set for this server.', { prefix: newPrefix }));
      }
      if (prefixes.length >= PREMIUM_PREFIX_LIMIT) {
        return this._sendError(ctx, i18n.translateTitle("Prefix Limit Reached"), i18n.cmd("Premium servers can have a maximum of {max} prefixes.", { max: PREMIUM_PREFIX_LIMIT }));
      }
      prefixes.push(newPrefix);
      updateMessage = i18n.cmd('Successfully added new prefix: `{prefix}`', { prefix: newPrefix });
    } else {
      prefixes = [newPrefix];
      updateMessage = i18n.cmd('Server prefix has been updated to `{prefix}`', { prefix: newPrefix });
    }

    db.setPrefixes(ctx.guild.id, prefixes);

    const replyOptions = this._createSuccessResponse("Prefix Updated", updateMessage, newPrefix);
    const isInteraction = !!ctx.user;
    if (isInteraction) {
      if (ctx.deferred || ctx.replied) await ctx.editReply(replyOptions);
      else await ctx.reply(replyOptions);
    } else {
      await ctx.channel.send(replyOptions);
    }
  }

  async _showManagementUI(ctx: any, isPremium: any) {
    const prefixes = db.getPrefixes(ctx.guild.id);
    const container = isPremium ? this._createPremiumContainer(prefixes) : this._createStandardContainer(prefixes[0]);

    const isInteraction = !!ctx.user;
    const replyOptions = {
      components: [container],
      fetchReply: true,
      flags: MessageFlags.IsComponentsV2,
    };
    let reply;
    if (isInteraction) {
      if (ctx.deferred || ctx.replied) reply = await ctx.editReply(replyOptions);
      else reply = await ctx.reply(replyOptions);
    } else {
      reply = await ctx.channel.send(replyOptions);
    }

    if (isPremium) {
      this._setupCollector(reply, isInteraction ? ctx.user.id : ctx.author.id, ctx.guild.id);
    }
  }

  _createStandardContainer(prefix: any) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(i18n.cmd("{emoji} **{title}**", { emoji: emoji.get("info"), title: i18n.translateTitle("Server Prefix") }))
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const content = i18n.cmd("**{emoji} Current Default Prefix:** `{prefix}`", { emoji: emoji.get("check"), prefix }) + "\n\n" +
      i18n.cmd("This prefix is used for all bot commands in this server.") + "\n\n" +
      i18n.cmd("**{emoji} Usage Examples:**", { emoji: emoji.get("folder") }) + "\n" +
      i18n.cmd("├─ `{prefix}prefix new!`", { prefix }) + "\n" +
      i18n.cmd("└─ `/prefix set:new!`") + "\n\n" +
      i18n.cmd("**{emoji} Premium Features:**", { emoji: emoji.get("add") }) + "\n" +
      `└─ Multiple prefix support available with premium`;

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    return container;
  }

  _createPremiumContainer(prefixes: any) {
    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(i18n.cmd("{emoji} **{title}**", { emoji: emoji.get("add"), title: i18n.translateTitle("Premium Prefix Management") }))
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    const prefixList = prefixes.map((p: any) => `\`${p}\``).join(" ") || i18n.cmd("None");
    const content = i18n.cmd("**{emoji} Current Prefixes ({count}/{max}):**\n{list}", {
      emoji: emoji.get("check"),
      count: prefixes.length,
      max: PREMIUM_PREFIX_LIMIT,
      list: prefixList,
    }) + "\n\n" +
      i18n.cmd("**{emoji} Premium Features:**", { emoji: emoji.get("folder") }) + "\n" +
      i18n.cmd("├─ Multiple prefix support") + "\n" +
      i18n.cmd("├─ Quick prefix switching") + "\n" +
      i18n.cmd("├─ Advanced customization") + "\n" +
      i18n.cmd("└─ Priority support access");

    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork));

    container.addSectionComponents(section);

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    if (prefixes.length > 0) {
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("prefix_remove")
        .setPlaceholder(i18n.cmd("Select prefixes to remove..."))
        .setMinValues(1)
        .setMaxValues(Math.min(prefixes.length, 5))
        .addOptions(
          prefixes.map((prefix: any) => ({
            label: i18n.cmd("Remove {prefix}", { prefix }),
            value: prefix,
            description: i18n.cmd('Remove the prefix "{prefix}" from this server', { prefix }),
            emoji: emoji.get("cross"),
          }))
        );

      container.addActionRowComponents(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)
      );
    }

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("prefix_add")
        .setLabel(i18n.cmd("Set New"))
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get("add"))
        .setDisabled(prefixes.length >= PREMIUM_PREFIX_LIMIT),
      new ButtonBuilder()
        .setCustomId("prefix_reset")
        .setLabel(i18n.cmd("Reset to Default"))
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji.get("reset")),
    );

    container.addActionRowComponents(buttons);

    return container;
  }

  _setupCollector(message: Message, userId: any, guildId: any) {
    const collector = componentCollectorSource(message).createMessageComponentCollector({
      filter: (i: any) => i.user.id === userId,
      time: 300_000,
    });

    collector.on("collect", async (interaction: any) => {
      try {
        if (interaction.customId === "prefix_add") {
          const modal = new ModalBuilder()
            .setCustomId("prefix_add_modal")
            .setTitle(i18n.cmd("Add New Prefix"))
            .addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId("new_prefix_input")
                  .setLabel(i18n.cmd("New prefix (max 5 characters)"))
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMaxLength(5)
                  .setPlaceholder(i18n.cmd("Enter a new prefix..."))
              ),
            );

          await interaction.showModal(modal);

          const modalSubmit = await interaction
            .awaitModalSubmit({ time: 60_000 })
            .catch(() => null);

          if (!modalSubmit) return;

          const newPrefix = modalSubmit.fields.getTextInputValue("new_prefix_input").trim();

          if (!newPrefix) {
            return modalSubmit.reply({
              content: `${emoji.get("cross")} ${i18n.cmd("Error: Prefix cannot be empty.")}`,
              ephemeral: true,
            });
          }

          if (newPrefix.length > 5) {
            return modalSubmit.reply({
              content: `${emoji.get("cross")} ${i18n.cmd("Error: Prefix is too long (max 5 characters).")}`,
              ephemeral: true,
            });
          }

          let prefixes = db.getPrefixes(guildId);

          if (prefixes.includes(newPrefix)) {
            return modalSubmit.reply({
              content: `${emoji.get("cross")} ${i18n.cmd("Error: This prefix already exists.")}`,
              ephemeral: true,
            });
          }

          if (prefixes.length >= PREMIUM_PREFIX_LIMIT) {
            return modalSubmit.reply({
              content: `${emoji.get("cross")} ${i18n.cmd("Error: Prefix limit reached.")}`,
              ephemeral: true,
            });
          }

          prefixes.push(newPrefix);
          db.setPrefixes(guildId, prefixes);

          await modalSubmit.deferUpdate();

          const updatedContainer = this._createPremiumContainer(prefixes);
          await message.edit({ components: [updatedContainer] });

        } else if (interaction.customId === "prefix_remove") {
          const selectedPrefixes = interaction.values;
          let prefixes = db.getPrefixes(guildId);

          prefixes = prefixes.filter(p => !selectedPrefixes.includes(p));

          if (prefixes.length === 0) {
            prefixes = [config.prefix];
          }

          db.setPrefixes(guildId, prefixes);

          await interaction.deferUpdate();

          const updatedContainer = this._createPremiumContainer(prefixes);
          await message.edit({ components: [updatedContainer] });

        } else if (interaction.customId === "prefix_reset") {
          const defaultPrefixes = [config.prefix];
          db.setPrefixes(guildId, defaultPrefixes);

          await interaction.deferUpdate();

          const updatedContainer = this._createPremiumContainer(defaultPrefixes);
          await message.edit({ components: [updatedContainer] });
        }
      } catch (error) {
        logger.error("PrefixCollector", "An error occurred in the prefix collector:", error);
      }
    });

    collector.on("end", async () => {
      try {
        const fetchedMessage = await message.fetch().catch(() => null);
        if (fetchedMessage && (fetchedMessage.components?.length ?? 0) > 0) {
          await fetchedMessage.edit({
            components: [this._createExpiredContainer()]
          });
        }
      } catch (error: any) {
        if (error?.code !== 10008) {
          logger.error("PrefixCommand", "Failed to disable components on end:", error);
        }
      }
    });
  }

  _createSuccessResponse(title: any, description: any, prefix: any) {
    const note = phrases.get("prefixUpdated");
    let fullDescription = `${description}\n\n*${note}*`;
    if (COMMON_PREFIXES.includes(prefix)) {
      fullDescription += i18n.cmd("\n\n**{emoji} Warning:** Using a common prefix like `{prefix}` may cause conflicts with other bots.", { emoji: emoji.get("folder"), prefix });
    }

    const container = buildSuccess(fullDescription, title);
    return { components: [container], flags: MessageFlags.IsComponentsV2 };
  }

  _createExpiredContainer() {
    return buildError("This interaction has expired. Run the command again to manage prefix settings.", "Server Prefix");
  }

  async _sendError(ctx: any, title: any, description: any) {
    const container = buildError(description, title);

    const replyOptions = {
      components: [container],
      ephemeral: true,
      flags: MessageFlags.IsComponentsV2,
    };

    const isInteraction = !!ctx.user;
    try {
      if (isInteraction) {
        if (ctx.deferred || ctx.replied) await ctx.editReply(replyOptions);
        else await ctx.reply(replyOptions);
      } else {
        await ctx.channel.send(replyOptions);
      }
    } catch (error) {
      logger.error("PrefixError", "Failed to send error message:", error);
    }
  }
}

export default new PrefixCommand();

// Made by Nikhil Under CodeX Devs
