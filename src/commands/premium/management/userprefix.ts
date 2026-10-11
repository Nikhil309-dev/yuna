import { Command, CommandContext } from '#core/Command';
import { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder, UserSelectMenuBuilder, RoleSelectMenuBuilder, ChannelSelectMenuBuilder, MentionableSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import type { Message } from "discord.js";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import { componentCollectorSource } from "#ui/Components";
import { db } from "#database/Database";
import emoji from "#config/emoji";
import { config } from "#config/config";
import { logger } from "#utils/logger";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";
import { splitFooter } from "#ui/Formatters";

const USER_PREFIX_LIMIT = 3;

class UserPrefixCommand extends Command {
  constructor() {
    super({
      name: "userprefix",
      description: "Manage your personal command prefixes (Premium Only).",
      usage: "userprefix [prefix]",
      aliases: ["up", "myprefix"],
      category: "settings",
      examples: ["userprefix", "userprefix !", "up $"],
      cooldown: 5,
      access: {
        premium: 'user',
      },
      slash: {
        enabled: true,
        data: {
          name: "userprefix",
          description: "Manage your personal command prefixes (Premium Only).",
          options: [
            {
              name: "add",
              description: "Add a new personal prefix.",
              type: 3,
              required: false,
              max_length: 5,
            },
          ],
        },
      },
    });
  }

  _buildUIManagementContainer(username: any, prefixes: string[] = [], actionMessage: string | null = null) {
    let content = i18n.cmd("**Hello {user}!** Manage your personal command prefixes here.\n\n", { user: username });

    if (actionMessage) {
      content += `${actionMessage}\n\n`;
    }

    content += i18n.cmd("**{emoji} Your Prefixes ({count}/{max}):**", {
      emoji: emoji.get("folder"),
      count: prefixes.length,
      max: USER_PREFIX_LIMIT,
    }) + "\n";
    if (prefixes.length > 0) {
      prefixes.forEach((prefix, index) => {
        const isLast = index === prefixes.length - 1;
        content += `${isLast ? '└─' : '├─'} \`${prefix}\`\n`;
      });
    } else {
      content += `└─ ${emoji.get("cross")} ${i18n.cmd("No custom prefixes set")}\n`;
    }

    content += `\n${i18n.cmd("**{emoji} How it works:**", { emoji: emoji.get("check") })}\n`;
    content += i18n.cmd("└─ These prefixes work for you in any server where I am present\n");
    content += i18n.cmd("└─ Use them instead of the server's default prefix\n");
    content += i18n.cmd("└─ Maximum {max} prefixes allowed per user\n\n", { max: USER_PREFIX_LIMIT });

    content += i18n.cmd("**{emoji} Examples:**\n", { emoji: emoji.get("add") });
    content += i18n.cmd("└─ Add `.` as prefix → Use `.play song` anywhere\n");
    content += i18n.cmd("└─ Add `.` as prefix → Use `.help` anywhere\n");
    content += i18n.cmd("└─ Add `y!` as prefix → Use `y!queue` anywhere");

    const components: ActionRowBuilder[] = [];

    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("up_add")
          .setLabel(i18n.cmd("Add Prefix"))
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(emoji.get("add"))
          .setDisabled(prefixes.length >= USER_PREFIX_LIMIT),
        new ButtonBuilder()
          .setCustomId("up_remove_all")
          .setLabel(i18n.cmd("Remove All"))
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(emoji.get("reset"))
          .setDisabled(prefixes.length === 0)
      )
    );

    if (prefixes.length > 0) {
      components.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("up_remove_select")
            .setPlaceholder(i18n.cmd("Select specific prefixes to remove..."))
            .setMinValues(1)
            .setMaxValues(prefixes.length)
            .addOptions(
              prefixes.map((p) => ({
                label: i18n.cmd('Remove prefix: "{value}"', { value: p }),
                value: p,
                emoji: emoji.get("cross"),
              }))
            )
        )
      );
    }

    return buildContainer({
      title: "Personal Prefix Management",
      content,
      thumbnail: config.assets.defaultThumbnail,
      icon: emoji.get("info"),
      components
    });
  }

  async _sendResponse(ctx: any, isSuccess: any, message: string) {
    let container;
    if (isSuccess) {
      const body = splitFooter(message);
      container = buildSuccess({ message: body.content, footer: body.footer });
    } else {
      container = buildError(message);
    }
    const replyOptions = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      ephemeral: !isSuccess,
    };
    if (ctx.user) {
        if (ctx.deferred || ctx.replied) await ctx.editReply(replyOptions);
        else await ctx.reply(replyOptions);
    } else {
        await ctx.channel.send(replyOptions);
    }
  }

  async _addPrefix(userId: any, newPrefix: any) {
    if (!newPrefix || newPrefix.trim() === "") {
      return {
        success: false,
        message: phrases.get("invalidOption"),
      };
    }

    const trimmedPrefix = newPrefix.trim();

    if (trimmedPrefix.length > 5) {
      return {
        success: false,
        message: `Maximum 5 characters allowed per prefix.`,
      };
    }

    const currentPrefixes = db.getUserPrefixes(userId);

    if (currentPrefixes.length >= USER_PREFIX_LIMIT) {
      return {
        success: false,
        message: i18n.cmd("You can only have {max} custom prefixes. Remove some existing prefixes first.", { max: USER_PREFIX_LIMIT }),
      };
    }

    if (currentPrefixes.includes(trimmedPrefix)) {
      return {
        success: false,
        message: i18n.cmd('The prefix `{prefix}` is already in your list.', { prefix: trimmedPrefix }),
      };
    }

    const newPrefixes = [...currentPrefixes, trimmedPrefix];
    db.users.setUserPrefixes(userId, newPrefixes);

    const note = phrases.get("prefixUpdated");
    return {
      success: true,
      message: i18n.cmd("Prefix `{prefix}` has been added to your personal prefixes.\n\n*{note}*", { prefix: trimmedPrefix, note }),
      prefixes: newPrefixes,
    };
  }

  async _handleCommand(ctx: any, directPrefix = null) {
    const isInteraction = !!ctx.user;
    const author = isInteraction ? ctx.user : ctx.author;
    const userId = author.id;
    const username = author.username;

    if (directPrefix) {
      const result = await this._addPrefix(userId, directPrefix);
      return this._sendResponse(ctx, result.success, result.message);
    }

    const replyOptions = {
        components: [this._buildUIManagementContainer(username, db.getUserPrefixes(userId)) as any],
        flags: MessageFlags.IsComponentsV2,
        fetchReply: true,
    };
    let message;
    if (isInteraction) {
        if (ctx.deferred || ctx.replied) message = await ctx.editReply(replyOptions);
        else message = await ctx.reply(replyOptions);
    } else {
        message = await ctx.channel.send(replyOptions);
    }

    this._setupCollector(message, userId, username);
  }

  async execute({ message, args }: any) {
    await this._handleCommand(message, args[0]);
  }

  async slashExecute({ interaction }: any) {
    await this._handleCommand(interaction, interaction.options.getString("add"));
  }

  _setupCollector(message: Message, userId: any, username: any) {
    const collector = componentCollectorSource(message).createMessageComponentCollector({
      filter: (i: any) => i.user.id === userId,
      time: 300_000,
    });

    collector.on("collect", async (interaction: any) => {
      try {
        let prefixes = db.getUserPrefixes(userId);
        let actionMessage = null;

        if (interaction.customId === "up_add") {
          const modal = new ModalBuilder()
            .setCustomId("up_add_modal")
            .setTitle(i18n.cmd("Add Personal Prefix"))
            .addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId("new_prefix_input")
                  .setLabel(i18n.cmd("New Prefix (max 5 characters)"))
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setMaxLength(5)
                  .setPlaceholder(i18n.cmd("Enter your custom prefix..."))
              )
            );

          await interaction.showModal(modal);

          try {
            const modalSubmit = await interaction.awaitModalSubmit({ time: 60000 });
            const newPrefix = modalSubmit.fields.getTextInputValue("new_prefix_input");
            const result = await this._addPrefix(userId, newPrefix);

            prefixes = db.getUserPrefixes(userId);
            actionMessage = result.message;

            await modalSubmit.update({
              components: [this._buildUIManagementContainer(username, prefixes, actionMessage) as any],
            });
          } catch (error) {
            return;
          }
        } else if (interaction.customId === "up_remove_all") {
          await interaction.deferUpdate();
          db.users.setUserPrefixes(userId, []);
          prefixes = [];
          actionMessage = i18n.cmd("{emoji} **All Prefixes Removed**\n\nAll custom prefixes have been successfully removed from your account.", { emoji: emoji.get("check") });

          await interaction.editReply({
            components: [this._buildUIManagementContainer(username, prefixes, actionMessage) as any],
          });
        } else if (interaction.isStringSelectMenu() && interaction.customId === "up_remove_select") {
          await interaction.deferUpdate();
          const valuesToRemove = interaction.values;
          prefixes = prefixes.filter((p: any) => !valuesToRemove.includes(p));
          db.users.setUserPrefixes(userId, prefixes);

          const removedList = valuesToRemove.map((p: any) => `\`${p}\``).join(", ");
          actionMessage = i18n.cmd("{emoji} **Prefixes Removed**\n\nSuccessfully removed: {list}", { emoji: emoji.get("check"), list: removedList });

          await interaction.editReply({
            components: [this._buildUIManagementContainer(username, prefixes, actionMessage) as any],
          });
        }
      } catch (error) {
        logger.error("UserPrefix", "Collector Error:", error);
      }
    });

    collector.on("end", async () => {
      try {
        const fetchedMessage = await message.fetch().catch(() => null);
        if (fetchedMessage?.components?.length) {
          const disabledComponents = fetchedMessage.components.map((row: any) => {
            const newRow = ActionRowBuilder.from(row);
            (newRow.components as any[]).forEach((component: any) => {
              if (component.data?.style !== ButtonStyle.Link) {
                component.setDisabled(true);
              }
            });
            return newRow;
          });
          await fetchedMessage.edit({ components: disabledComponents as any });
        }
      } catch (error: any) {
        if (error?.code !== 10008) {
          logger.error("UserPrefix", "Failed to disable components on end:", error);
        }
      }
    });
  }
}

export default new UserPrefixCommand();

// Made by Nikhil Under CodeX Devs
