import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { logger, pink, mint, red, gray, white, purple } from '#utils/logger';
import { Collection } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { Client } from "discord.js";
import { i18n, toDiscordLocale } from "#utils/i18n";
import { SLASH_STRINGS } from "../locales/slash-strings.js";

export class CommandLoader {
  client: any;
  slashCommands: any;
  slashCommandFiles: any;
  commandPaths: any;
  failedCommands: any;

  constructor(client: Client) {
    this.client = client;
    this.client.commands = new Collection();
    this.client.aliases = new Map();
    this.client.categories = new Map();
    this.slashCommands = new Map();
    this.slashCommandFiles = new Map();
    this.commandPaths = new Map();
    this.failedCommands = [];
  }

  async load(dirPath: any = '../commands') {
    return this.loadCommands(dirPath);
  }

  async loadCommands(dirPath: any = '../commands') {
    this.client.commands.clear();
    this.client.aliases.clear();
    this.client.categories.clear();
    this.slashCommands.clear();
    this.slashCommandFiles.clear();
    this.commandPaths.clear();
    this.failedCommands = [];

    const commandsAbsolutePath = path.join(__dirname, dirPath);

    try {
      await this._recursivelyLoadCommands(commandsAbsolutePath);
      this._finalizeSlashCommands();

      if (this.failedCommands.length === 0) {
        const catCount = this.client.categories.size;
        const cmdCount = this.client.commands.size;
        const slashCount = this.slashCommandFiles.size;
        console.log(
          `${logger.formatTime()} ${pink('🌸 [Commands]')} ${mint('✔ All ' + cmdCount + ' commands loaded successfully')} ${gray(`(${catCount} categories · ${slashCount} slash)`)}`
        );
      } else {
        console.log(
          `${logger.formatTime()} ${pink('🌸 [Commands]')} ${red(`✖ Failed to load ${this.failedCommands.length} command(s):`)}`
        );
        for (const failure of this.failedCommands) {
          console.log(`   ${red('└─')} ${white(failure.file)}: ${red(failure.error)}`);
        }
        console.log(
          `${logger.formatTime()} ${pink('🌸 [Commands]')} ${mint(`✔ ${this.client.commands.size} command(s) loaded successfully`)}`
        );
      }
    } catch (error) {
      logger.error('CommandLoader', 'Failed to load commands', error);
    }
  }

  async _recursivelyLoadCommands(dirPath: any, relativePath: any = '') {
    try {
      if (!fs.existsSync(dirPath)) return;
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      const loadPromises = entries.map(async (entry: any) => {
        const fullPath = path.join(dirPath, entry.name);
        const currentRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name;

        if (entry.isDirectory()) {
          await this._recursivelyLoadCommands(fullPath, currentRelativePath);
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          const category = relativePath ? relativePath.split(path.sep)[0] : 'default';
          if (!this.client.categories.has(category)) {
            this.client.categories.set(category, []);
          }
          await this._loadCommandFile(fullPath, category);
        }
      });

      await Promise.all(loadPromises);
    } catch (error) {
      logger.error('CommandLoader', `Failed to read directory: ${dirPath}`, error);
    }
  }

  async _loadCommandFile(filePath: any, category: any) {
    const relName = path.relative(process.cwd(), filePath);
    try {
      const commandModule = await import(`file:${filePath}`);
      if (!commandModule?.default) {
        this.failedCommands.push({ file: relName, error: 'Missing default export' });
        return;
      }

      const command = commandModule.default;
      command.category = category;

      // ---- Contract validation: fail loudly at boot, not at runtime. ----
      if (!command || typeof command !== 'object' || typeof command.name !== 'string' || !command.name.trim()) {
        this.failedCommands.push({ file: relName, error: 'Invalid command: missing or empty "name"' });
        return;
      }
      if (typeof command.execute !== 'function') {
        this.failedCommands.push({ file: relName, error: `Command "${command.name}" does not implement execute()` });
        return;
      }
      if (this.client.commands.has(command.name)) {
        const originalPath = this.commandPaths.get(command.name);
        this.failedCommands.push({
          file: relName,
          error: `Duplicate command name "${command.name}" (already registered from ${originalPath ? path.relative(process.cwd(), originalPath) : 'unknown file'})`,
        });
        return;
      }
      const slashEnabled = command.slash?.enabled ?? command.enabledSlash;
      if (slashEnabled) {
        const data = command.slash?.data || command.slashData;
        if (!data || !data.name) {
          this.failedCommands.push({ file: relName, error: `Command "${command.name}" enables slash but defines no slash data name` });
          return;
        }
      }

      this.commandPaths.set(command.name, filePath);
      this.client.commands.set(command.name, command);

      if (command.aliases?.length > 0) {
        command.aliases.forEach((alias: any) => {
          if (typeof alias !== 'string' || !alias.trim()) {
            this.failedCommands.push({ file: relName, error: `Command "${command.name}" has an invalid alias: ${JSON.stringify(alias)}` });
            return;
          }
          if (this.client.aliases.has(alias)) {
            this.failedCommands.push({ file: relName, error: `Duplicate alias "${alias}" (command "${command.name}")` });
            return;
          }
          this.client.aliases.set(alias, command.name);
        });
      }

      const slashData = command.slash?.data || command.slashData;
      if (slashEnabled && slashData) {
        const rawName = slashData.name;
        const slashName = Array.isArray(rawName) ? rawName[1] : (rawName || command.name);
        if (slashName) {
          this.slashCommandFiles.set(slashName.toString().toLowerCase(), command);
        }
      }

      this.client.categories.get(category)?.push(command);
    } catch (error) {
      this.failedCommands.push({ file: relName, error: (error as any).message || error });
    }
  }

  _finalizeSlashCommands() {
    for (const [slashName, command] of this.slashCommandFiles.entries()) {
      const slashData = command.slash?.data || command.slashData;
      if (!slashData) continue;

      const rawName = slashData.name;
      const finalName = Array.isArray(rawName) ? rawName[1] : (rawName || slashName);

      const dataJson = typeof slashData.toJSON === 'function' ? slashData.toJSON() : {
        name: finalName.toLowerCase(),
        description: slashData.description || command.description || `${finalName} command`,
        options: slashData.options || []
      };

      dataJson.name = finalName.toLowerCase();
      this._applySlashLocalizations(dataJson);
      this.slashCommands.set(finalName.toLowerCase(), dataJson);
    }
  }

  /**
   * Attaches Discord `*_localizations` maps to a slash command payload so the
   * client renders translated descriptions, option descriptions and choice
   * names. Everything is looked up in the shared `cmd.` catalog by the exact
   * English literal; anything without a translation is simply left out, which
   * makes Discord fall back to the English text.
   *
   * Command *names* are only localized when the translation is still a legal
   * Discord command name (lowercase, digits, `_`/`-`). Discord rejects the
   * whole registration payload when a localized name breaks those rules, so a
   * non-Latin translation is deliberately skipped rather than submitted.
   *
   * Discord validates localized descriptions with the same 1..100 range as the
   * base description and fails the *entire* payload — not just the offending
   * entry — when one is out of range. Every emitted value is therefore length
   * checked here, so a too-long catalog entry degrades to the English fallback
   * instead of breaking registration for all commands.
   */
  _applySlashLocalizations(dataJson: any) {
    if (!dataJson) return;
    const localeCodes = Array.from(i18n.getLocales().keys());
    if (localeCodes.length === 0) return;

    const lookup = (locale: string, english: string | undefined | null): string | null => {
      if (!english || typeof english !== 'string') return null;
      const fromSlash = SLASH_STRINGS[locale]?.[english];
      if (typeof fromSlash === 'string' && fromSlash.length > 0 && fromSlash !== english) return fromSlash;
      const key = `cmd.${english}`;
      const translated = i18n.ui(locale, key);
      return translated === key ? null : translated;
    };

    // Discord: 1-100 chars for descriptions, 1-32 for command names, and a
    // localized name must keep the base name's lowercase [a-z0-9_-] shape.
    const isValidCommandName = (value: string): boolean => /^[a-z0-9_-]{1,32}$/.test(value);
    const isValidDescription = (value: string): boolean => value.length >= 1 && value.length <= 100;
    const pick = (locale: string, english: string | undefined | null): string | null => {
      const value = lookup(locale, english);
      return value && isValidDescription(value) ? value : null;
    };

    for (const locale of localeCodes) {
      if (locale === i18n.defaultLocale) continue;

      // Discord rejects region-qualified codes it doesn't define (e.g. "de-DE"),
      // so emit the mapped locale code while still translating from the bundled one.
      const discordLocale = toDiscordLocale(locale);

      const description = pick(locale, dataJson.description);
      if (description) {
        dataJson.description_localizations = dataJson.description_localizations || {};
        dataJson.description_localizations[discordLocale] = description;
      }

      const name = lookup(locale, dataJson.name);
      if (name && isValidCommandName(name)) {
        dataJson.name_localizations = dataJson.name_localizations || {};
        dataJson.name_localizations[discordLocale] = name;
      }

      if (!Array.isArray(dataJson.options)) continue;
      for (const option of dataJson.options) {
        const optionDescription = pick(locale, option?.description);
        if (optionDescription) {
          option.description_localizations = option.description_localizations || {};
          option.description_localizations[discordLocale] = optionDescription;
        }
        if (!Array.isArray(option?.choices)) continue;
        for (const choice of option.choices) {
          const choiceName = pick(locale, choice?.name);
          if (choiceName) {
            choice.name_localizations = choice.name_localizations || {};
            choice.name_localizations[discordLocale] = choiceName;
          }
        }
      }
    }
  }

  getSlashCommandsData() {
    return Array.from(this.slashCommands.values());
  }

  getSlashData() {
    return this.getSlashCommandsData();
  }
}

export default CommandLoader;

// Made by Nikhil Under CodeX Devs
