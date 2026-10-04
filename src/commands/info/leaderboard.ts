import { Command, CommandContext } from '#core/Command';
import { db } from "#database/Database";
import { MessageFlags } from "discord.js";
import type { Client } from "discord.js";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import emoji from "#config/emoji";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";

class LeaderboardCommand extends Command {
  constructor() {
    super({
      name: "leaderboard",
      description: "View the top listeners and wealthiest users!",
      usage: "leaderboard",
      aliases: ["lb", "top"],
      category: "info",
      slash: {
        enabled: true,
        data: {
          name: "leaderboard",
          description: "View the top listeners and wealthiest users!"
        }
      }
    });
  }

  async execute({ client, message }: any) {
    return this._handleLeaderboard(message, client, message.author);
  }

  async slashExecute({ client, interaction }: any) {
    return this._handleLeaderboard(interaction, client, interaction.user);
  }

  async _handleLeaderboard(context: CommandContext, client: Client, user: any) {
    if (!db.economy) {
      const container = buildError("Economy system is currently offline.", "Economy Offline");
      return (context.replied || context.deferred) ? context.followUp!({ components: [container], flags: MessageFlags.IsComponentsV2, ephemeral: true }) : context.reply!({ components: [container], flags: MessageFlags.IsComponentsV2, ephemeral: true });
    }

    const topUsers = db.economy.getTopUsers(10);

    if (topUsers.length === 0) {
      const container = buildError("The leaderboard is currently empty. Start listening to music to earn coins!", "Leaderboard Empty");
      return (context.replied || context.deferred) ? context.followUp!({ components: [container], flags: MessageFlags.IsComponentsV2, ephemeral: true }) : context.reply!({ components: [container], flags: MessageFlags.IsComponentsV2, ephemeral: true });
    }

    let content = "";
    const medals = ["🥇", "🥈", "🥉"];

    for (let i = 0; i < topUsers.length; i++) {
      const dbUser = topUsers[i];
      let username = i18n.cmd("Unknown User");

      try {
        const fetchUser = await client.users.fetch(dbUser.user_id);
        if (fetchUser) username = fetchUser.username;
      } catch (e) {

      }

      const rankStr = i < 3 ? medals[i] : `#${i + 1}`;
      content += `${rankStr} **${username}** — **${dbUser.coins.toLocaleString()}** Coins\n`;
    }

    const userCoins = db.economy.getCoins(user.id);
    content += i18n.cmd("\n└─ **You** currently have **{coins}** coins.", { coins: userCoins.toLocaleString() });

    const container = buildContainer({
      title: "Global Leaderboard (Top Listeners)",
      content: content,
      thumbnail: client.user!.displayAvatarURL(),
      icon: emoji.get("music") || '🏆'
    });

    const payload = { components: [container], flags: MessageFlags.IsComponentsV2 };
    if (context.replied || context.deferred) {
      return context.editReply?.(payload);
    } else if (typeof context.reply === "function") {
      return context.reply(payload);
    } else {
      return context.channel.send(payload);
    }
  }
}

export default new LeaderboardCommand();

// Made by Nikhil Under CodeX Devs
