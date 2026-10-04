import { MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, SectionBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder, MessageActionRowComponentBuilder } from "discord.js";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import { componentCollectorSource } from "#ui/Components";
import { config } from "#config/config";
import { Command, CommandContext } from '#core/Command';
import emoji from "#config/emoji";
import { logger } from "#utils/logger";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";
import { PlayerManager } from "#audio/PlayerManager";

/**
 * Resolves a preset's English name/description through the locale catalog so
 * the menu, select options and success card all speak the user's language.
 */
const presetName = (key: string): string => i18n.cmd(EQ_PRESETS[key as keyof typeof EQ_PRESETS].name);
const presetDescription = (key: string): string =>
  i18n.cmd(EQ_PRESETS[key as keyof typeof EQ_PRESETS].description);

const EQ_PRESETS = {
  flat: {
    name: "Flat (Default)",
    description: "Standard balanced audio output without equalizer boost",
    bands: Array.from({ length: 15 }, (_, i) => ({ band: i, gain: 0.0 })),
  },
  bass_light: {
    name: "Bass Boost (Light)",
    description: "Subtle low-end bass enhancement (+2dB)",
    bands: [
      { band: 0, gain: 0.2 },
      { band: 1, gain: 0.15 },
      { band: 2, gain: 0.1 },
    ],
  },
  bass_medium: {
    name: "Bass Boost (Medium)",
    description: "Balanced deep bass punch (+5dB)",
    bands: [
      { band: 0, gain: 0.5 },
      { band: 1, gain: 0.4 },
      { band: 2, gain: 0.25 },
      { band: 3, gain: 0.15 },
    ],
  },
  bass_extreme: {
    name: "Bass Boost (Extreme)",
    description: "Heavy sub-woofer bass blast (+9dB)",
    bands: [
      { band: 0, gain: 0.85 },
      { band: 1, gain: 0.7 },
      { band: 2, gain: 0.5 },
      { band: 3, gain: 0.3 },
    ],
  },
  treble: {
    name: "Treble Booster",
    description: "Enhances high frequencies for crisp vocals and cymbals",
    bands: [
      { band: 10, gain: 0.25 },
      { band: 11, gain: 0.35 },
      { band: 12, gain: 0.45 },
      { band: 13, gain: 0.5 },
      { band: 14, gain: 0.55 },
    ],
  },
  vocal: {
    name: "Vocal Clarity",
    description: "Brings forward mid-range frequencies for clear singing voices",
    bands: [
      { band: 3, gain: 0.1 },
      { band: 4, gain: 0.35 },
      { band: 5, gain: 0.45 },
      { band: 6, gain: 0.4 },
      { band: 7, gain: 0.25 },
    ],
  },
  club: {
    name: "Deep Club / Party",
    description: "V-shaped sound profile with boosted bass & treble",
    bands: [
      { band: 0, gain: 0.5 },
      { band: 1, gain: 0.4 },
      { band: 2, gain: 0.2 },
      { band: 11, gain: 0.3 },
      { band: 12, gain: 0.4 },
      { band: 13, gain: 0.5 },
    ],
  },
  acoustic: {
    name: "Acoustic / Live",
    description: "Warm mid-range emphasis for acoustic instruments",
    bands: [
      { band: 2, gain: 0.15 },
      { band: 3, gain: 0.25 },
      { band: 4, gain: 0.3 },
      { band: 5, gain: 0.25 },
      { band: 6, gain: 0.15 },
    ],
  },
};

class EqualizerCommand extends Command {
  constructor() {
    super({
      name: "eq",
      description: "Fine-tune 15-band audio equalizer settings and presets",
      usage: "eq [preset]",
      aliases: ["equalizer", "eqs"],
      category: "filters",
      examples: ["eq", "eq bass_medium", "eq treble"],
      cooldown: 3,
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
          name: "eq",
          description: "Fine-tune 15-band audio equalizer settings and presets",
          options: [
            {
              name: "preset",
              description: i18n.cmd("Select an equalizer preset"),
              type: 3,
              required: false,
              choices: Object.entries(EQ_PRESETS).map(([key, data]) => ({
                name: data.name,
                value: key,
              })),
            },
          ],
        },
      },
    });
  }

  async execute(ctx: CommandContext) {
    const { client, message, interaction, player, pm, args = [] } = ctx;
    const context = interaction || message;
    const activePm = pm || (player ? new PlayerManager(player) : (client?.music?.getPlayer(context.guildId || context.guild?.id) ? new PlayerManager(client.music.getPlayer(context.guildId || context.guild?.id)) : null));
    if (!activePm) return;
    const presetKey = interaction ? interaction.options.getString("preset") : args[0]?.toLowerCase();
    if (presetKey && presetKey in EQ_PRESETS) {
      return this._applyPreset(context, activePm, presetKey);
    }
    return this._sendEQMenu(context, activePm);
  }

  async slashExecute(ctx: CommandContext) {
    return this.execute(ctx);
  }

  async _sendEQMenu(context: CommandContext, pm: PlayerManager) {
    const button = new ButtonBuilder()
      .setLabel(i18n.cmd("Support"))
      .setURL(config.links?.supportServer || "https://discord.gg/XYwwyDKhec")
      .setStyle(ButtonStyle.Link);

    let desc = i18n.cmd("Select a custom equalizer profile below to sculpt your server's audio experience in real-time!") + "\n\n";
    Object.keys(EQ_PRESETS).forEach((key) => {
      desc += `🎚️ **${presetName(key)}**\n${presetDescription(key)}\n${i18n.cmd("Command: .eq {preset}", { preset: key })}\n\n`;
    });

    const container = new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(i18n.cmd("### 🎛️ 15-Band Graphic Equalizer"))
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
      )
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(desc.trim())
          )
          .setButtonAccessory(button)
      );

    const selectOptions = Object.keys(EQ_PRESETS).map((key) => ({
      label: presetName(key),
      description: presetDescription(key).substring(0, 100),
      value: key,
      emoji: "🎚️",
    }));

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("eq_select_preset")
        .setPlaceholder(i18n.cmd("Choose Equalizer Preset..."))
        .addOptions(selectOptions)
    );

    container.addActionRowComponents(row);

    const payload = { components: [container], flags: MessageFlags.IsComponentsV2 };
    const ctxAny = context as any;
    const msg = ctxAny.reply
      ? await ctxAny.reply({ ...payload, fetchReply: true })
      : await ctxAny.channel.send(payload);

    if (msg) {
      const userId = ctxAny.author?.id || ctxAny.user?.id;
      const filter = (i: any) => i.customId === "eq_select_preset" && i.user.id === userId;
      const collector = componentCollectorSource(msg).createMessageComponentCollector({ filter, time: 60000 });

      collector.on("collect", async (i: any) => {
        const selectedKey = i.values[0];
        await i.deferUpdate();
        await this._applyPreset(i, pm, selectedKey, msg);
      });
    }
  }

  async _applyPreset(context: CommandContext, pm: PlayerManager, presetKey: any, existingMsg = null) {
    const ctxAny = context as any;
    try {
      const preset = EQ_PRESETS[presetKey as keyof typeof EQ_PRESETS];
      if (!preset) return;

      await pm.player.filterManager.setEQ(preset.bands);

      const note = phrases.get("filterApplied");
      const container = buildSuccess(
        i18n.cmd("Successfully set audio equalizer to **{preset}**!", { preset: presetName(presetKey) }) +
          `\n\n*${presetDescription(presetKey)}*\n*${note}*`,
        "Equalizer Profile Applied"
      );

      const payload = { components: [container], flags: MessageFlags.IsComponentsV2 };

      if (existingMsg && (existingMsg as any).edit) {
        await (existingMsg as any).edit(payload);
      } else if (ctxAny.reply && (context.replied || context.deferred)) {
        await context.editReply!(payload);
      } else if (ctxAny.reply) {
        await context.reply!(payload);
      } else {
        await ctxAny.channel.send(payload);
      }
    } catch (err: any) {
      logger.error("EqualizerCommand", "Error applying equalizer preset:", err);
      const errorContainer = buildError(phrases.get("errorGeneric"), "Equalizer Error");
      const payload = { components: [errorContainer], flags: MessageFlags.IsComponentsV2 };
      if (ctxAny.reply && (context.replied || context.deferred)) {
        await context.editReply!(payload);
      } else if (ctxAny.reply) {
        await context.reply!(payload);
      } else {
        await ctxAny.channel.send(payload);
      }
    }
  }
}

export default new EqualizerCommand();

// Made by Nikhil Under CodeX Devs
