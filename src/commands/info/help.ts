import { Command, CommandContext } from '#core/Command';
import {
  MessageFlags,
  ActionRowBuilder,
  MessageActionRowComponentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  MentionableSelectMenuBuilder,
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
  AttachmentBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder
} from "discord.js";
import type { Client, Message } from "discord.js";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import { componentCollectorSource } from "#ui/Components";
import { CommandCard } from "#ui/cards/CommandCard";
import { config } from "#config/config";
import emoji from "#config/emoji";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { isOwner } from '#core/AccessControl';
import { logger } from "#utils/logger";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";
import { splitFooter } from "#ui/Formatters";

class HelpCommand extends Command {
  constructor() {
    super({
      name: "help",
      description: "Shows all available commands and their information",
      usage: "help [command]",
      aliases: ["h", "commands"],
      category: "info",
      examples: ["help", "help play", "help music", "h skip"],
      cooldown: 3,
      slash: {
        enabled: true,
        data: {
          name: "help",
          description: "Get help for commands",
          options: [
            {
              name: "command",
              description: "Specific command to get help for",
              type: 3,
              required: false,
              autocomplete: true,
            },
          ],
        },
      },
    });
  }

  async _scanCommandDirectories() {
    try {
      const commandsPath = path.join(process.cwd(), "src", "commands");
      const commands = new Map();
      const categories = new Map();
      const subcategories = new Map();

      if (!fs.existsSync(commandsPath)) {
        logger.warn("HelpCommand", "Commands directory not found");
        return { commands, categories, subcategories };
      }

      const categoryDirs = fs
        .readdirSync(commandsPath, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .filter((name) => name !== "developer");

      for (const categoryName of categoryDirs) {
        const categoryPath = path.join(commandsPath, categoryName);

        if (!categories.has(categoryName)) {
          categories.set(categoryName, []);
        }

        await this._scanCategoryDirectory(
          categoryPath,
          categoryName,
          commands,
          categories,
          subcategories,
        );
      }

      return { commands, categories, subcategories };
    } catch (error: any) {
      logger.error("HelpCommand", "Error scanning command directories:", error);
      return {
        commands: new Map(),
        categories: new Map(),
        subcategories: new Map(),
      };
    }
  }

  async _scanCategoryDirectory(categoryPath: any, categoryName: any, commands: any, categories: any, subcategories: any,
  ) {
    try {
      const items = fs.readdirSync(categoryPath, { withFileTypes: true });

      const commandFiles = items
        .filter((item) => item.isFile() && item.name.endsWith(".ts"))
        .map((item) => item.name);

      for (const file of commandFiles) {
        await this._loadCommand(
          path.join(categoryPath, file),
          categoryName,
          commands,
          categories,
        );
      }

      const subdirs = items
        .filter((item) => item.isDirectory())
        .map((item) => item.name);

      if (subdirs.length > 0) {
        if (!subcategories.has(categoryName)) {
          subcategories.set(categoryName, new Map());
        }

        const categorySubcats = subcategories.get(categoryName);

        for (const subdir of subdirs) {
          const subdirPath = path.join(categoryPath, subdir);
          const subcategoryCommands = [];

          const subCommandFiles = fs
            .readdirSync(subdirPath, { withFileTypes: true })
            .filter((item) => item.isFile() && item.name.endsWith(".ts"))
            .map((item) => item.name);

          for (const file of subCommandFiles) {
            const command = await this._loadCommand(
              path.join(subdirPath, file),
              categoryName,
              commands,
              categories,
            );
            if (command) {
              subcategoryCommands.push(command);
            }
          }

          if (subcategoryCommands.length > 0) {
            categorySubcats.set(subdir, subcategoryCommands);
          }
        }
      }
    } catch (error: any) {
      logger.error(
        "HelpCommand",
        `Error scanning category directory ${categoryName}:`,
        error,
      );
    }
  }

  async _loadCommand(filePath: any, categoryName: any, commands: any, categories: any) {
    try {
      const module = await import(pathToFileURL(filePath).href);
      const CommandExport = module.default || module.Command;

      if (!CommandExport) return null;

      const instance = typeof CommandExport === 'function' ? new CommandExport() : CommandExport;
      if (!instance || !instance.name) return null;

      const command = {
        name: instance.name,
        description: instance.description || i18n.cmd('No description provided'),
        usage: instance.usage || instance.name,
        aliases: instance.aliases || [],
        category: categoryName,
        examples: instance.examples || [],
        cooldown: instance.cooldown || 3,
        enabledSlash: !!instance.enabledSlash,
        slashData: instance.slashData || null,
        ownerOnly: !!instance.ownerOnly,
        userPrem: !!instance.userPrem,
        guildPrem: !!instance.guildPrem,
        anyPrem: !!instance.anyPrem,
        voiceRequired: !!instance.voiceRequired,
        sameVoiceRequired: !!instance.sameVoiceRequired,
        playerRequired: !!instance.playerRequired,
        playingRequired: !!instance.playingRequired,
        userPermissions: instance.userPermissions || [],
        permissions: instance.permissions || [],
      };

      commands.set(command.name, command);

      if (command.aliases && Array.isArray(command.aliases)) {
        for (const alias of command.aliases) {
          commands.set(alias, command);
        }
      }

      const categoryCommands = categories.get(categoryName);
      if (categoryCommands && !categoryCommands.find((cmd: any) => cmd.name === command.name)) {
        categoryCommands.push(command);
      }

      return command;
    } catch (error: any) {
      logger.error(
        "HelpCommand",
        `Error loading command from ${filePath}:`,
        error,
      );
      return null;
    }
  }

  _getCommandsFromClient(client: any, userId = null) {
    const commands = new Map();
    const categories = new Map();
    const subcategories = new Map();

    const isUserOwner = userId && (isOwner(userId) || config.ownerIds?.includes(userId));
    const clientCommands = client.commands || client.commandLoader?.client?.commands;

    if (clientCommands) {
      for (const [name, cmd] of clientCommands.entries()) {
        const cat = cmd.category || 'info';
        if ((cat === 'developer' || cmd.access?.ownerOnly) && !isUserOwner) {
          continue;
        }

        const cmdData = {
          name: cmd.name,
          description: cmd.description || i18n.cmd('No description provided'),
          usage: cmd.usage || cmd.name,
          aliases: cmd.aliases || [],
          category: cat,
          examples: cmd.examples || [],
          cooldown: cmd.cooldown || 3,
          enabledSlash: !!(cmd.slash?.enabled ?? cmd.enabledSlash),
          slashData: cmd.slash?.data || cmd.slashData || null,
          ownerOnly: !!cmd.access?.ownerOnly,
          userPrem: cmd.access?.premium === 'user' || cmd.access?.premium === 'any',
          guildPrem: cmd.access?.premium === 'guild' || cmd.access?.premium === 'any',
          anyPrem: !!cmd.access?.premium,
          voiceRequired: !!cmd.access?.voice,
          sameVoiceRequired: !!cmd.access?.sameVoice,
          playerRequired: !!cmd.access?.player,
          playingRequired: !!cmd.access?.playing,
          userPermissions: cmd.access?.permissions || [],
          permissions: cmd.access?.botPermissions || [],
        };

        commands.set(name, cmdData);

        if (!categories.has(cat)) {
          categories.set(cat, []);
        }
        const catList = categories.get(cat);
        if (!catList.some((c: any) => c.name === cmdData.name)) {
          catList.push(cmdData);
        }
      }

      if (client.aliases) {
        for (const [alias, targetName] of client.aliases.entries()) {
          const target = commands.get(targetName);
          if (target) {
            commands.set(alias, target);
          }
        }
      }
    }
    return { commands, categories, subcategories };
  }

  async execute(ctx: CommandContext) {
    const { client, message, interaction, args = [] } = ctx;
    if (interaction) {
      return this.slashExecute({ client, interaction });
    }
    const userId = message?.author?.id;
    try {
      let { commands, categories, subcategories } = this._getCommandsFromClient(client, userId);

      if (args.length > 0) {
        const commandName = args[0].toLowerCase();
        const command = commands.get(commandName);

        if (command) {
          return await this._sendCommandHelp(
            message,
            command,
            "message",
            client,
            commands,
            categories,
            subcategories,
          );
        } else {
          return message.reply({
            components: [
              this._createErrorContainer(i18n.cmd('Command "{name}" not found.', { name: commandName })),
            ],
            flags: MessageFlags.IsComponentsV2,
          });
        }
      }

      if (categories.size === 0) {
        return message.reply({
          components: [this._createErrorContainer(i18n.cmd("No commands available."))],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const helpMessage = await message.reply({
        components: [
          this._createMainContainer(commands, categories, subcategories),
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      this._setupCollector(
        helpMessage,
        message.author.id,
        client,
        commands,
        categories,
        subcategories,
      );
    } catch (error: any) {
      client.logger?.error(
        "HelpCommand",
        `Error in prefix command: ${error.message}`,
        error,
      );
      await message
        .reply({
          components: [
            this._createErrorContainer(i18n.cmd("An error occurred while loading help.")),
          ],
          flags: MessageFlags.IsComponentsV2,
        })
        .catch(() => {});
    }
  }

  async slashExecute({ client, interaction }: any) {
    const userId = interaction.user.id;
    try {
      let { commands, categories, subcategories } = this._getCommandsFromClient(client, userId);
      const commandName = interaction.options.getString("command");

      if (commandName) {
        const command = commands.get(commandName.toLowerCase());

        if (command) {
          return await this._sendCommandHelp(
            interaction,
            command,
            "interaction",
            client,
            commands,
            categories,
            subcategories,
          );
        } else {
          return interaction.editReply({
            components: [
              this._createErrorContainer(i18n.cmd('Command "{name}" not found.', { name: commandName })),
            ],
            flags: MessageFlags.IsComponentsV2,
          });
        }
      }

      if (categories.size === 0) {
        return interaction.editReply({
          components: [this._createErrorContainer(i18n.cmd("No commands available."))],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const helpMessage = await interaction.editReply({
        components: [
          this._createMainContainer(commands, categories, subcategories),
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      this._setupCollector(
        helpMessage,
        interaction.user.id,
        client,
        commands,
        categories,
        subcategories,
      );
    } catch (error: any) {
      client.logger?.error(
        "HelpCommand",
        `Error in slash command: ${error.message}`,
        error,
      );
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({
            components: [
              this._createErrorContainer(
                i18n.cmd("An error occurred while loading help."),
              ),
            ],
          });
        } else {
          await interaction.editReply({
            components: [
              this._createErrorContainer(
                i18n.cmd("An error occurred while loading help."),
              ),
            ],
          });
        }
      } catch (e) {
        logger.error("HelpCommand", "Failed to send error response:", e);
      }
    }
  }

  async autocomplete(ctx: any) {
    const { interaction, client } = ctx;
    try {
      const { commands } = this._getCommandsFromClient(client);
      const focusedValue = interaction.options.getFocused();

      const uniqueCommands = new Set<string>();
      for (const [name, command] of commands) {
        if (command.name === name) {
          uniqueCommands.add(name);
        }
      }

      const choices = Array.from(uniqueCommands)
        .filter((name: string) =>
          name.toLowerCase().includes(focusedValue.toLowerCase()),
        )
        .slice(0, 25)
        .map((name: string) => ({ name, value: name }));

      await interaction.respond(choices);
    } catch (error: any) {
      await interaction.respond([]).catch(() => {});
    }
  }

  _createMainContainer(commands: any, categories: any, subcategories: any) {
    try {
      const categoryArray = Array.from(categories.keys());
      const uniqueCommands = (Array.from(commands.values()) as any[]).filter(
        (cmd, index, arr) =>
          arr.findIndex((c) => c.name === cmd.name) === index,
      );

      const slashCommands = uniqueCommands.filter(
        (cmd) => cmd.enabledSlash && cmd.slashData,
      );

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          i18n.cmd("{emoji} **{title}**", { emoji: emoji.get("info"), title: i18n.translateTitle("Help Menu") }),
        ),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      let content = `**Bot Command Information**\n\n`;
      content += `┌─ **${emoji.get("info")} Statistics**\n`;
      content += i18n.cmd("├─ Prefix Commands: {count}\n", { count: uniqueCommands.length });
      content += i18n.cmd("├─ Slash Commands: {count}\n", { count: slashCommands.length });
      content += `└─ ${i18n.cmd("Categories:")} ${categoryArray.length}\n\n`;

      content += `**Available Categories:**\n`;

      categoryArray.forEach((category, index) => {
        const isLast = index === categoryArray.length - 1;
        const prefix = isLast ? "└─" : "├─";
        const icon = category === 'developer' ? (emoji.get("crown") || "👑") : emoji.get("folder");
        content += `${prefix} **${icon} ${this._capitalize(category)}**\n`;
      });

      const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            config.assets?.helpThumbnail || config.assets?.defaultThumbnail,
          ),
        );

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      if (categoryArray.length === 0) {
        return this._createErrorContainer(i18n.cmd("No command categories available."));
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("help_category_select")
        .setPlaceholder(i18n.cmd("Select a category"))
        .addOptions(
          categoryArray.map((category: any) => {
            const categoryCommands = categories.get(category) || [];
            const totalCommands = categoryCommands.length;

            return {
              label: this._capitalize(category),
              value: category,
              emoji: emoji.get("folder"),
              description: `${totalCommands} commands`,
            };
          }),
        );

      container.addActionRowComponents(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(selectMenu),
      );

      container.addActionRowComponents(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("help_switch_buttons")
            .setLabel(i18n.cmd("Button Menu"))
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🔘"),
          new ButtonBuilder()
            .setCustomId("help_close")
            .setLabel(i18n.cmd("Close"))
            .setStyle(ButtonStyle.Danger),
        ),
      );

      return container;
    } catch (error: any) {
      logger.error("HelpCommand", "Error creating main container:", error);
      return this._createErrorContainer(i18n.cmd("Unable to load help menu."));
    }
  }

  _createButtonModeHomeContainer(commands: any, categories: any, subcategories: any) {
    try {
      const categoryArray = Array.from(categories.keys());
      const uniqueCommands = (Array.from(commands.values()) as any[]).filter(
        (cmd, index, arr) =>
          arr.findIndex((c) => c.name === cmd.name) === index,
      );

      const slashCommands = uniqueCommands.filter(
        (cmd) => cmd.enabledSlash && cmd.slashData,
      );

      if (categoryArray.length === 0) {
        return this._createErrorContainer(i18n.cmd("No command categories available."));
      }

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          i18n.cmd("{emoji} **{title} — Button Mode**", { emoji: emoji.get("info"), title: i18n.translateTitle("Help Menu") }),
        ),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      let content = `**Bot Command Information**\n\n`;
      content += `┌─ **${emoji.get("info")} Statistics**\n`;
      content += i18n.cmd("├─ Prefix Commands: {count}\n", { count: uniqueCommands.length });
      content += i18n.cmd("├─ Slash Commands: {count}\n", { count: slashCommands.length });
      content += `└─ ${i18n.cmd("Categories:")} ${categoryArray.length}\n\n`;

      content += `**${i18n.cmd("All Categories:")}**\n`;
      categoryArray.forEach((category, index) => {
        const isLast = index === categoryArray.length - 1;
        const prefix = isLast ? "└─" : "├─";
        content += `${prefix} **${emoji.get("folder")} ${this._capitalize(category)}**\n`;
      });

      const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            config.assets?.helpThumbnail || config.assets?.defaultThumbnail,
          ),
        );

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      container.addActionRowComponents(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("help_page_next")
            .setLabel(i18n.cmd("Start Browsing ▶"))
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("help_switch_dropdown")
            .setLabel(i18n.cmd("Dropdown Menu"))
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("📋"),
          new ButtonBuilder()
            .setCustomId("help_close")
            .setLabel(i18n.cmd("Close"))
            .setStyle(ButtonStyle.Danger),
        ),
      );

      return container;
    } catch (error: any) {
      logger.error("HelpCommand", "Error creating button mode home container:", error);
      return this._createErrorContainer(i18n.cmd("Unable to load help menu."));
    }
  }

  _createCategoryContainer(category: any, categories: any, subcategories: any, pageIndex = 0, isButtonMode = false) {
    try {
      const commands = categories.get(category) || [];
      const subcats = subcategories.get(category);

      const allCommands = [...commands];
      if (subcats) {
        for (const [, subcatCommands] of subcats) {
          for (const cmd of subcatCommands) {
            if (!allCommands.find((c) => c.name === cmd.name)) {
              allCommands.push(cmd);
            }
          }
        }
      }

      if (allCommands.length === 0) {
        return this._createErrorContainer(
          i18n.cmd('No commands found in category: "{category}".', { category }),
        );
      }

      const ITEMS_PER_PAGE = 10;
      const totalPages = Math.ceil(allCommands.length / ITEMS_PER_PAGE) || 1;
      const safePage = Math.max(0, Math.min(pageIndex, totalPages - 1));

      const startIndex = safePage * ITEMS_PER_PAGE;
      const endIndex = startIndex + ITEMS_PER_PAGE;
      const paginatedCommands = allCommands.slice(startIndex, endIndex);

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emoji.get("info")} **${this._capitalize(category)} Commands**${isButtonMode ? " — Button Mode" : ""}`,
        ),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      let content = `**${this._capitalize(category)} Category** — ${allCommands.length} commands\n`;
      if (totalPages > 1) content += `*Page ${safePage + 1} of ${totalPages}*\n\n`;
      else content += `\n`;

      paginatedCommands.forEach((cmd, index) => {
        content += `\`${startIndex + index + 1}.\` ${emoji.get("info")} \`${cmd.name}\`\n`;
      });

      const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            config.assets?.helpThumbnail || config.assets?.defaultThumbnail,
          ),
        );

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      if (paginatedCommands.length > 0) {
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`help_command_select_${category}`)
          .setPlaceholder(i18n.cmd("Select a command for detailed info"))
          .addOptions(
            paginatedCommands.map((cmd) => ({
              label: cmd.name,
              emoji: emoji.get("info"),
              value: cmd.name,
              description: cmd.description
                ? cmd.description.slice(0, 100)
                : "No description",
            })),
          );

        container.addActionRowComponents(
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(selectMenu),
        );
      }

      if (totalPages > 1) {
        const cmdButtonRow = new ActionRowBuilder<MessageActionRowComponentBuilder>();
        cmdButtonRow.addComponents(
          new ButtonBuilder()
            .setCustomId(isButtonMode ? `help_btn_cmd_prev_${category}_${safePage - 1}` : `help_cat_page_${category}_${safePage - 1}`)
            .setLabel(i18n.cmd("◀ Prev Cmds"))
            .setStyle(ButtonStyle.Primary)
            .setDisabled(safePage === 0),
          new ButtonBuilder()
            .setCustomId(isButtonMode ? `help_btn_cmd_next_${category}_${safePage + 1}` : `help_cat_page_${category}_${safePage + 1}`)
            .setLabel(i18n.cmd("Next Cmds ▶"))
            .setStyle(ButtonStyle.Primary)
            .setDisabled(safePage >= totalPages - 1)
        );
        container.addActionRowComponents(cmdButtonRow);

        if (isButtonMode) {
          container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
          );
        }
      }

      const navButtonRow = new ActionRowBuilder<MessageActionRowComponentBuilder>();

      if (isButtonMode) {
        const categoryArray = Array.from(categories.keys());
        const categoryIndex = categoryArray.indexOf(category);
        const isFirst = categoryIndex <= 0;
        const isLast = categoryIndex >= categoryArray.length - 1;

        navButtonRow.addComponents(
          new ButtonBuilder()
            .setCustomId("help_page_first")
            .setLabel("⏮")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(isFirst),
          new ButtonBuilder()
            .setCustomId("help_page_prev")
            .setLabel("◀")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("help_page_home")
            .setEmoji("🏠")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("help_page_next")
            .setLabel("▶")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(isLast),
          new ButtonBuilder()
            .setCustomId("help_page_last")
            .setLabel("⏭")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(isLast)
        );

        container.addActionRowComponents(navButtonRow);

        const closeRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("help_close")
            .setLabel(i18n.cmd("Close"))
            .setStyle(ButtonStyle.Danger)
        );
        container.addActionRowComponents(closeRow);
      } else {
        navButtonRow.addComponents(
          new ButtonBuilder()
            .setCustomId("help_back_main")
            .setLabel(i18n.cmd("Back"))
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("help_close")
            .setLabel(i18n.cmd("Close"))
            .setStyle(ButtonStyle.Danger)
        );

        container.addActionRowComponents(navButtonRow);
      }

      return container;
    } catch (error: any) {
      logger.error("HelpCommand", "Error creating category container:", error);
      return this._createErrorContainer(i18n.cmd("Unable to load category commands."));
    }
  }

  async _createCommandContainer(command: any, category: any) {
    try {
      if (!command) return { components: [this._createErrorContainer(i18n.cmd("Command not found."))] };

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          i18n.cmd('{emoji} **Command Details: {name}**', { emoji: emoji.get("info") || "🌸", name: command.name.toUpperCase() }),
        ),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      let attachment = null;
      try {
        const buffer = await CommandCard.generate(command);
        attachment = new AttachmentBuilder(buffer, { name: "command-card.png" });
      } catch (err) {
        logger.error("HelpCommand", "Failed to render CommandCard canvas:", err);
      }

      if (attachment) {
        const mediaGallery = new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL("attachment://command-card.png"),
        );
        container.addMediaGalleryComponents(mediaGallery);
      } else {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`> **${command.name}**: ${command.description || "No description."}`),
        );
      }

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      const buttons = [
        new ButtonBuilder()
          .setCustomId(
            `help_back_category_${category || command.category || "misc"}`,
          )
          .setLabel(i18n.cmd("Back"))
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("help_back_main")
          .setEmoji("🏠")
          .setStyle(ButtonStyle.Primary),
      ];

      const navButtonRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(buttons);
      container.addActionRowComponents(navButtonRow);

      return {
        components: [container],
        files: attachment ? [attachment] : [],
      };
    } catch (error: any) {
      logger.error("HelpCommand", "Error creating command container payload:", error);
      return { components: [this._createErrorContainer(i18n.cmd("Unable to load command info."))] };
    }
  }

  _createSlashInfoContainer(command: any, category: any) {
    try {
      if (!command?.slashData)
        return this._createErrorContainer(
          "Slash command information not available.",
        );

      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          i18n.cmd("{emoji} **Slash Command: {name}**", { emoji: emoji.get("info"), name: command.name }),
        ),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      const slashName = Array.isArray(command.slashData.name)
        ? `/${command.slashData.name.join(" ")}`
        : `/${command.slashData.name}`;

      let content = `**Slash Command Information**\n\n`;
      content += `┌─ **Command:** \`${slashName}\`\n`;
      content += `└─ **Description:** ${command.slashData.description}\n\n`;

      if (command.slashData.options?.length) {
        content += `**Options:**\n`;
        command.slashData.options.forEach((option: any, i: any) => {
          const required = option.required ? " (Required)" : " (Optional)";
          const isLast = i === command.slashData.options.length - 1;
          const prefix = isLast ? "└─" : "├─";
          const indent = isLast ? "   " : "│  ";
          content += `${prefix} \`${option.name}\`${required}: ${option.description}\n`;

          if (option.choices?.length) {
            option.choices.forEach((choice: any, ci: any) => {
              const isChoiceLast = ci === option.choices.length - 1;
              const choicePrefix = isChoiceLast ? `${indent}└─` : `${indent}├─`;
              content += `${choicePrefix} \`${choice.name}\`\n`;
            });
          }
        });
      }

      const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            config.assets?.helpThumbnail || config.assets?.defaultThumbnail,
          ),
        );

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      container.addActionRowComponents(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(
              `help_back_command:${command.name}:${category || command.category || "misc"}`,
            )
            .setLabel(i18n.cmd("Back"))
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("help_back_main")
            .setEmoji("🏠")
            .setStyle(ButtonStyle.Primary),
        ),
      );

      return container;
    } catch (error: any) {
      logger.error(
        "HelpCommand",
        i18n.cmd("Error creating slash info container:"),
        error,
      );
      return this._createErrorContainer(
        i18n.cmd("Unable to load slash command information."),
      );
    }
  }

  _createErrorContainer(message: string) {
    try {
      const container = new ContainerBuilder();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${emoji.get("cross")} **Error**`),
      );

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      const body = splitFooter(i18n.cmd(
        "**Something went wrong**\n\n┌─ **{info} Issue:** {message}\n└─ **{reset} Action:** Try again or contact support\n\n*Please check your input and try again*",
        { info: emoji.get("info"), reset: emoji.get("reset"), message },
      ));

      const section = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(body.content),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            config.assets?.helpThumbnail || config.assets?.defaultThumbnail,
          ),
        );

      container.addSectionComponents(section);

      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );

      if (body.footer) {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(body.footer),
        );
      }

      return container;
    } catch (error: any) {
      logger.error("HelpCommand", "Error creating error container:", error);
      const fallbackContainer = new ContainerBuilder();
      fallbackContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          i18n.cmd("{emoji} **{title}**\n*{tip}*", { emoji: emoji.get("cross"), title: i18n.tr("ui.error.title"), tip: i18n.cmd("Help system unavailable") }),
        ),
      );
      return fallbackContainer;
    }
  }

  async _sendCommandHelp(messageOrInteraction: any, command: any, type: any, client: Client, commands: any, categories: any, subcategories: any,
  ) {
    try {
      const payload = await this._createCommandContainer(command, command.category);

      if (type === "message") {
        const helpMessage = await messageOrInteraction.reply({
          ...payload,
          flags: MessageFlags.IsComponentsV2,
        });
        this._setupCollector(
          helpMessage,
          messageOrInteraction.author.id,
          client,
          commands,
          categories,
          subcategories,
        );
      } else {
        const helpMessage = await messageOrInteraction.editReply({
          ...payload,
          flags: MessageFlags.IsComponentsV2,
        });
        this._setupCollector(
          helpMessage,
          messageOrInteraction.user.id,
          client,
          commands,
          categories,
          subcategories,
        );
      }
    } catch (error: any) {
      logger.error("HelpCommand", "Error sending command help:", error);
    }
  }

  _setupCollector(message: Message, userId: any, client: Client, commands: any, categories: any, subcategories: any,
  ) {
    try {
      let currentCategoryIndex = -1;
      const categoryArray = Array.from(categories.keys());

      const collector = componentCollectorSource(message).createMessageComponentCollector({
        time: 300_000,
      });

      collector.on("collect", async (interaction: any) => {
        try {
          if (interaction.user.id !== userId) {
            return interaction.reply({
              components: [buildError(phrases.get("notYourInteraction"), "Access Denied")],
              flags: MessageFlags.IsComponentsV2,
              ephemeral: true,
            });
          }

          await interaction.deferUpdate();

          if (interaction.customId === "help_close") {
            await interaction.deleteReply().catch(() => {});
            collector.stop();
            return;
          }

          if (interaction.customId === "help_back_main") {
            currentCategoryIndex = -1;
            await interaction.editReply({
              components: [
                this._createMainContainer(commands, categories, subcategories),
              ],
            });
            return;
          }

          if (interaction.customId === "help_switch_buttons") {
            currentCategoryIndex = -1;
            await interaction.editReply({
              components: [
                this._createButtonModeHomeContainer(commands, categories, subcategories),
              ],
            });
            return;
          }

          if (interaction.customId === "help_switch_dropdown") {
            currentCategoryIndex = -1;
            await interaction.editReply({
              components: [
                this._createMainContainer(commands, categories, subcategories),
              ],
            });
            return;
          }

          if (interaction.customId === "help_page_first") {
            currentCategoryIndex = 0;
            await interaction.editReply({
              components: [
                this._createCategoryContainer(categoryArray[currentCategoryIndex], categories, subcategories, 0, true)
              ],
            });
            return;
          }

          if (interaction.customId === "help_page_prev") {
            if (currentCategoryIndex > 0) {
              currentCategoryIndex--;
              await interaction.editReply({
                components: [
                  this._createCategoryContainer(categoryArray[currentCategoryIndex], categories, subcategories, 0, true)
                ],
              });
            } else {
              currentCategoryIndex = -1;
              await interaction.editReply({
                components: [
                  this._createButtonModeHomeContainer(commands, categories, subcategories)
                ],
              });
            }
            return;
          }

          if (interaction.customId === "help_page_next") {
            if (currentCategoryIndex < categoryArray.length - 1) {
              currentCategoryIndex++;
              await interaction.editReply({
                components: [
                  this._createCategoryContainer(categoryArray[currentCategoryIndex], categories, subcategories, 0, true)
                ],
              });
            }
            return;
          }

          if (interaction.customId === "help_page_last") {
            currentCategoryIndex = categoryArray.length - 1;
            await interaction.editReply({
              components: [
                this._createCategoryContainer(categoryArray[currentCategoryIndex], categories, subcategories, 0, true)
              ],
            });
            return;
          }

          if (interaction.customId === "help_page_home") {
            currentCategoryIndex = -1;
            await interaction.editReply({
              components: [
                this._createButtonModeHomeContainer(commands, categories, subcategories)
              ],
            });
            return;
          }

          if (interaction.customId.startsWith("help_btn_cmd_")) {
            const isNext = interaction.customId.includes("_next_");
            const prefix = isNext ? "help_btn_cmd_next_" : "help_btn_cmd_prev_";
            const parts = interaction.customId.replace(prefix, "").split("_");
            const targetPage = parseInt(parts.pop(), 10);
            const category = parts.join("_");

            await interaction.editReply({
              components: [
                this._createCategoryContainer(category, categories, subcategories, targetPage, true)
              ],
            });
            return;
          }

          if (interaction.customId === "help_category_select") {
            const category = interaction.values[0];
            await interaction.editReply({
              components: [
                this._createCategoryContainer(
                  category,
                  categories,
                  subcategories,
                ),
              ],
            });
            return;
          }

          if (interaction.customId.startsWith("help_command_select_")) {
            const category = interaction.customId.replace(
              "help_command_select_",
              "",
            );
            const commandName = interaction.values[0];
            const command = commands.get(commandName);

            if (command) {
              const payload = await this._createCommandContainer(command, category);
              await interaction.editReply(payload);
            }
            return;
          }

          if (interaction.customId.startsWith("help_cat_page_")) {
            const parts = interaction.customId.replace("help_cat_page_", "").split("_");
            const targetPage = parseInt(parts.pop(), 10);
            const category = parts.join("_");

            await interaction.editReply({
              components: [
                this._createCategoryContainer(
                  category,
                  categories,
                  subcategories,
                  targetPage
                ),
              ],
            });
            return;
          }

          if (interaction.customId.startsWith("help_back_category_")) {
            const category = interaction.customId.replace(
              "help_back_category_",
              "",
            );
            await interaction.editReply({
              components: [
                this._createCategoryContainer(
                  category,
                  categories,
                  subcategories,
                  0
                ),
              ],
            });
            return;
          }

          if (interaction.customId.startsWith("help_slash_info_")) {
            const commandName = interaction.customId.replace(
              "help_slash_info_",
              "",
            );
            const command = commands.get(commandName);

            if (command) {
              await interaction.editReply({
                components: [
                  this._createSlashInfoContainer(command, command.category),
                ],
              });
            }
            return;
          }

          if (interaction.customId.startsWith("help_back_command:") || interaction.customId.startsWith("help_back_command_")) {
            let commandName, category;
            if (interaction.customId.includes(":")) {
              const parts = interaction.customId.split(":");
              commandName = parts[1];
              category = parts[2];
            } else {
              const parts = interaction.customId.replace("help_back_command_", "").split("_");
              commandName = parts[0];
              category = parts[1];
            }
            const command = commands.get(commandName);

            if (command) {
              const payload = await this._createCommandContainer(command, category);
              await interaction.editReply(payload);
            }
            return;
          }
        } catch (error: any) {
          logger.error(
            "HelpCommand",
            `Error in collector: ${error.message}`,
            error,
          );

          try {
            await interaction.followUp({
              content: i18n.cmd("An error occurred while processing your request. Please try again."),
              ephemeral: true,
            });
          } catch (followUpError: any) {
            logger.error(
              "HelpCommand",
              `Error sending followup: ${followUpError.message}`,
              followUpError,
            );
          }
        }
      });

      collector.on("end", async (collected: any, reason: any) => {
        if (reason === "limit" || reason === "messageDelete") return;

        try {
          const currentMessage = await this._fetchMessage(message).catch(
            () => null,
          );

          if (!currentMessage?.components?.length) {
            logger.debug(
              "HelpCommand",
              i18n.cmd("No message or components found for disabling"),
            );
            return;
          }

          const success = await this._disableAllComponents(
            currentMessage,
            client,
          );

          if (success) {
            logger.debug(
              "HelpCommand",
              `Components disabled successfully. Reason: ${reason}`,
            );
          }
        } catch (error: any) {
          this._handleDisableError(error, client, reason);
        }
      });

      collector.on("dispose", async (interaction: any) => {
        logger.debug(
          "HelpCommand",
          `Interaction disposed: ${interaction.customId}`,
        );
      });
    } catch (error: any) {
      logger.error("HelpCommand", "Error setting up collector:", error);
    }
  }

  async _disableAllComponents(message: Message, client: Client) {
    try {
      const disabledComponents = this._processComponents(message.components);

      await message.edit({
        components: disabledComponents,
        flags: MessageFlags.IsComponentsV2,
      });

      return true;
    } catch (error: any) {
      logger.error(
        "HelpCommand",
        `Failed to disable components: ${error.message}`,
        error,
      );
      return false;
    }
  }

  _processComponents(components: any) {
    return components.map((component: any) => {
      if (component.type === ComponentType.ActionRow) {
        return {
          ...component.toJSON(),
          components: component.components.map((subComponent: any) => ({
            ...subComponent.toJSON(),
            disabled: true,
          })),
        };
      }

      if (component.type === ComponentType.Container) {
        return {
          ...component.toJSON(),
          components: this._processComponents(component.components),
        };
      }

      if (component.type === ComponentType.Section) {
        const processedComponent = {
          ...component.toJSON(),
          components: this._processComponents(component.components),
        };

        if (
          component.accessory &&
          component.accessory.type === ComponentType.Button
        ) {
          processedComponent.accessory = {
            ...component.accessory.toJSON(),
            disabled: true,
          };
        }

        return processedComponent;
      }

      return component.toJSON();
    });
  }

  _handleDisableError(error: any, client: Client, reason: any) {
    if (error.code === 10008) {

      logger.debug(
        "HelpCommand",
        `Message was deleted, cannot disable components. Reason: ${reason}`,
      );
    } else if (error.code === 50001) {

      logger.warn(
        "HelpCommand",
        `Missing permissions to edit message. Reason: ${reason}`,
      );
    } else {
      logger.error(
        "HelpCommand",
        `Error disabling components: ${error.message}. Reason: ${reason}`,
        error,
      );
    }
  }

  async _fetchMessage(messageOrInteraction: any) {
    if (messageOrInteraction.fetchReply) {
      return await messageOrInteraction.fetchReply();
    } else if (messageOrInteraction.fetch) {
      return await messageOrInteraction.fetch();
    } else {
      return messageOrInteraction;
    }
  }

  _shouldDisableComponent(component: any) {
    const selectMenuTypes = [
      StringSelectMenuBuilder,
      UserSelectMenuBuilder,
      RoleSelectMenuBuilder,
      ChannelSelectMenuBuilder,
      MentionableSelectMenuBuilder,
    ];

    if (selectMenuTypes.some((type) => component instanceof type)) {
      return true;
    }

    if (component instanceof ButtonBuilder) {
      return component.data.style !== ButtonStyle.Link;
    }

    return false;
  }

  _capitalize(str: any) {
    try {
      if (!str || typeof str !== "string") {
        return "Unknown";
      }
      return str.charAt(0).toUpperCase() + str.slice(1);
    } catch (error: any) {
      return "Unknown";
    }
  }
}

export default new HelpCommand();

// Made by Nikhil Under CodeX Devs
