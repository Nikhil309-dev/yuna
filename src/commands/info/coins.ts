import { Command, CommandContext } from '#core/Command';
import { db } from "#database/Database";
import { MessageFlags } from "discord.js";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import { config } from "#config/config";
import emoji from "#config/emoji";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";
import { splitFooter } from "#ui/Formatters";

class CoinsCommand extends Command {
  constructor() {
    super({
      name: "coins",
      description: "Check your current coin balance",
      usage: "coins",
      aliases: ["bal", "balance"],
      category: "info",
      slash: {
        enabled: true,
        data: {
          name: "coins",
          description: "Check your current coin balance"
        }
      }
    });
  }

  async execute({ client, message, args }: any) {
    const userId = message.author.id;
    const coins = db.economy ? db.economy.getCoins(userId) : 0;

    const { content, footer } = this._balanceBody(coins);
    const container = buildContainer({
      title: i18n.translateTitle("Your Balance"),
      content,
      footer,
      thumbnail: message.author.displayAvatarURL(),
      icon: emoji.get("add") || '💰'
    });

    return message.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2
    });
  }

  async slashExecute({ interaction }: any) {
    const userId = interaction.user.id;
    const coins = db.economy ? db.economy.getCoins(userId) : 0;

    const { content, footer } = this._balanceBody(coins);
    const container = buildContainer({
      title: i18n.translateTitle("Your Balance"),
      content,
      footer,
      thumbnail: interaction.user.displayAvatarURL(),
      icon: emoji.get("add") || '💰'
    });

    return interaction.editReply({
      components: [container],
      flags: MessageFlags.IsComponentsV2
    });
  }

  /**
   * The balance literal ships as one translated string with the tip folded in
   * after a blank line. Split it so the tip renders as a proper card footer
   * (separator + small text) instead of running straight into the balance.
   */
  _balanceBody(coins: any) {
    return splitFooter(i18n.cmd(
      "You currently have **{coins}** coins.\n\n*Tip: You earn 5 coins per minute listening to music and 1 coin per command used!*",
      { coins },
    ));
  }
}

export default new CoinsCommand();

// Made by Nikhil Under CodeX Devs
