import { Command } from '#core/Command';
import { db } from "#database/Database";
import { MessageFlags } from "discord.js";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";
import { invalidatePremiumCache } from "#core/AccessControl";
import emoji from "#config/emoji";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";
import { splitFooter } from "#ui/Formatters";

const PRICES: Record<string, number> = {
  "1h": 100,
  "1d": 1000,
  "1w": 5000,
  "1m": 15000,
  "1y": 100000
};

const DURATIONS_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1m": 30 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000
};

class BuyPremiumCommand extends Command {
  constructor() {
    super({
      name: "buypremium",
      description: "Buy premium using your coins",
      usage: "buypremium <1h|1d|1w|1m|1y>",
      aliases: ["buyprem"],
      category: "premium",
      slash: {
        enabled: true,
        data: {
          name: "buypremium",
          description: "Buy premium using your coins",
          options: [
            {
              name: "duration",
              description: i18n.cmd("The duration of premium to buy"),
              type: 3,
              required: false,
              choices: [
                { name: i18n.cmd("1 Hour (100 coins)"), value: "1h" },
                { name: i18n.cmd("1 Day (1,000 coins)"), value: "1d" },
                { name: i18n.cmd("1 Week (5,000 coins)"), value: "1w" },
                { name: i18n.cmd("1 Month (15,000 coins)"), value: "1m" },
                { name: i18n.cmd("1 Year (100,000 coins)"), value: "1y" }
              ]
            }
          ]
        }
      }
    });
  }

  async slashExecute({ interaction }: any) {
    const duration = interaction.options.getString("duration");
    const user = interaction.user;
    const userId = user.id;

    if (!duration) {
      return this._sendPricing(interaction, user);
    }

    if (!PRICES[duration]) {
      return this._sendError(interaction, user, i18n.translateTitle("Invalid Duration"), i18n.cmd("Please provide a valid duration: `1h`, `1d`, `1w`, `1m`, or `1y`"));
    }

    const price = PRICES[duration];
    const userCoins = db.economy ? db.economy.getCoins(userId) : 0;

    if (userCoins < price) {
      return this._sendError(interaction, user, i18n.translateTitle("Insufficient Coins"), i18n.cmd("You need **{price}** coins to buy **{duration}** premium, but you only have **{coins}** coins.", { price, duration, coins: userCoins }));
    }

    const removed = db.economy.removeCoins(userId, price);

    if (removed === false) {
      return this._sendError(interaction, user, i18n.translateTitle("Transaction Failed"), i18n.cmd("Failed to deduct coins. Please try again."));
    }

    if (db.premium.isUserPremium(userId)) {
      db.premium.extendPremium('user', userId, DURATIONS_MS[duration]);
    } else {
      const expiresAt = Date.now() + DURATIONS_MS[duration];
      db.premium.grantUserPremium(userId, "System", expiresAt, i18n.cmd("Purchased with {price} coins for {duration}", { price, duration }));
    }
    invalidatePremiumCache(userId);

    return this._sendSuccess(interaction, user, i18n.cmd("Successfully bought {duration} of Premium for {price} coins! Enjoy your perks!", { duration, price }));
  }

  async execute({ message, args }: any) {
    if (args.length < 1) {
      return this._sendPricing(message);
    }

    const duration = args[0].toLowerCase();

    if (!PRICES[duration]) {
      return this._sendError(message, i18n.translateTitle("Invalid Duration"), i18n.cmd("Please provide a valid duration: `1h`, `1d`, `1w`, `1m`, or `1y`"));
    }

    const userId = message.author.id;
    const price = PRICES[duration];
    const userCoins = db.economy ? db.economy.getCoins(userId) : 0;

    if (userCoins < price) {
      return this._sendError(message, i18n.translateTitle("Insufficient Coins"), i18n.cmd("You need **{price}** coins to buy **{duration}** premium, but you only have **{coins}** coins.", { price, duration, coins: userCoins }));
    }

    const removed = db.economy.removeCoins(userId, price);
    if (removed === false) {
      return this._sendError(message, i18n.translateTitle("Transaction Failed"), i18n.cmd("Failed to deduct coins. Please try again."));
    }

    if (db.premium.isUserPremium(userId)) {
      db.premium.extendPremium('user', userId, DURATIONS_MS[duration]);
    } else {
      const expiresAt = Date.now() + DURATIONS_MS[duration];
      db.premium.grantUserPremium(userId, "System", expiresAt, i18n.cmd("Purchased with {price} coins for {duration}", { price, duration }));
    }
    invalidatePremiumCache(userId);

    return this._sendSuccess(message, i18n.cmd("Successfully bought {duration} of Premium for {price} coins! Enjoy your perks!", { duration, price }));
  }

  _sendPricing(context: any, user = context.author) {
    let content = i18n.cmd("**Available Durations & Prices:**") + "\n\n";
    content += i18n.cmd("└─ `1h` (1 Hour) - **100 Coins**") + "\n";
    content += i18n.cmd("└─ `1d` (1 Day) - **1,000 Coins**") + "\n";
    content += i18n.cmd("└─ `1w` (1 Week) - **5,000 Coins**") + "\n";
    content += i18n.cmd("└─ `1m` (1 Month) - **15,000 Coins**") + "\n";
    content += i18n.cmd("└─ `1y` (1 Year) - **100,000 Coins**") + "\n\n";
    content += i18n.cmd("*Usage: `buypremium <duration>`*");

    const container = buildContainer({
      title: i18n.translateTitle("Premium Store"),
      content: content,
      thumbnail: user.displayAvatarURL(),
      icon: emoji.get("folder") || '💎'
    });

    const payload = { components: [container], flags: MessageFlags.IsComponentsV2 };
    if (context.editReply && (context.deferred || context.replied)) return context.editReply(payload);
    else if (context.reply) return context.reply(payload);
    else return context.channel.send(payload);
  }

  _sendError(context: any, user: any = context.author, title: any = "", description: any = "") {
    if (typeof user === 'string') {

      description = title;
      title = user;
      user = context.author || context.user;
    }

    const container = buildError(description, title);

    const payload = { components: [container], flags: MessageFlags.IsComponentsV2 };
    if (context.editReply && (context.deferred || context.replied)) return context.editReply(payload);
    else if (context.reply) return context.reply(payload);
    else return context.channel.send(payload);
  }

  _sendSuccess(context: any, user: any = context.author, description: any = "") {
    if (typeof user === 'string') {
      description = user;
      user = context.author || context.user;
    }

    const note = phrases.get("premiumSuccess");
    const body = splitFooter(`${description}\n\n*${note}*`);
    const container = buildSuccess({ message: body.content, footer: body.footer }, "Purchase Successful");

    const payload = { components: [container], flags: MessageFlags.IsComponentsV2 };
    if (context.editReply && (context.deferred || context.replied)) return context.editReply(payload);
    else if (context.reply) return context.reply(payload);
    else return context.channel.send(payload);
  }
}

export default new BuyPremiumCommand();

// Made by Nikhil Under CodeX Devs
