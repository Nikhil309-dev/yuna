import { Command, CommandContext } from '#core/Command';
import { db } from "#database/Database";
import { MessageFlags } from "discord.js";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import { config } from "#config/config";
import emoji from "#config/emoji";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";

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

    const container = buildContainer({
      title: i18n.translateTitle("Your Balance"),
      content: i18n.cmd("You currently have **{coins}** coins.\n\n*Tip: You earn 5 coins per minute listening to music and 1 coin per command used!*", { coins }),
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

    const container = buildContainer({
      title: i18n.translateTitle("Your Balance"),
      content: i18n.cmd("You currently have **{coins}** coins.\n\n*Tip: You earn 5 coins per minute listening to music and 1 coin per command used!*", { coins }),
      thumbnail: interaction.user.displayAvatarURL(),
      icon: emoji.get("add") || '💰'
    });

    return interaction.editReply({
      components: [container],
      flags: MessageFlags.IsComponentsV2
    });
  }
}

export default new CoinsCommand();

// Made by Nikhil Under CodeX Devs
