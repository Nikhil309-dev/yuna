import { Command, CommandContext } from '#core/Command';
import { AttachmentBuilder, MessageFlags } from 'discord.js';
import { buildContainer, buildError } from '#ui/Theme';
import { db } from '#database/Database';
import emoji from '#config/emoji';
import BlendCard from '#ui/cards/BlendCard';
import { logger } from '#utils/logger';
import { i18n } from "#utils/i18n";

class BlendCommand extends Command {
  constructor() {
    super({
      name: 'blend',
      description: 'Generate a Spotify-style music taste blend with a friend',
      category: 'info',
      aliases: ['match', 'tasteblend'],
      cooldown: 5,
      usage: '<@user>',
      slash: {
        enabled: true,
        autoDefer: true,
        data: {
          name: 'blend',
          description: 'Generate a Spotify-style music taste blend with a friend',
          options: [
            {
              name: 'user',
              description: i18n.cmd('The user to compare music tastes with'),
              type: 6,
              required: true
            }
          ]
        }
      }
    });
  }

  async execute(ctx: CommandContext) {
    const { client, interaction, message, args, guild, user } = ctx;
    const author = user || message?.author;

    let targetUser = null;
    if (interaction) {
      targetUser = interaction.options.getUser('user');
    } else if (message) {
      targetUser = message.mentions.users.first() || (args![0] ? await client.users.fetch(args![0]).catch(() => null) : null);
    }

    if (!targetUser) {
      const err = buildError(ctx.t("pleaseMentionUser"));
      if (interaction) return interaction.editReply({ components: [err], flags: MessageFlags.IsComponentsV2 });
      return message.reply({ components: [err], flags: MessageFlags.IsComponentsV2 });
    }

    if (targetUser.id === author.id) {
      const err = buildError(ctx.t("cannotBlendSelf"));
      if (interaction) return interaction.editReply({ components: [err], flags: MessageFlags.IsComponentsV2 });
      return message.reply({ components: [err], flags: MessageFlags.IsComponentsV2 });
    }

    try {

      const likedA = db.liked.getUserLiked(author.id) || [];
      const likedB = db.liked.getUserLiked(targetUser.id) || [];

      let score = 0;
      if (likedA.length > 0 && likedB.length > 0) {
        const titlesA = new Set(likedA.map((t: any) => (t.title || '').toLowerCase()));
        let matches = 0;
        likedB.forEach((t: any) => {
          if (titlesA.has((t.title || '').toLowerCase())) matches++;
        });
        const overlapRatio = matches / Math.min(likedA.length, likedB.length);
        score = Math.min(99, Math.max(50, Math.round(50 + overlapRatio * 49)));
      } else {
        // Seeded pseudorandom based on user IDs for consistent friendly match
        const seed = (BigInt(author.id) ^ BigInt(targetUser.id)) % 37n;
        score = 63 + Number(seed);
      }

      const sampleTracks = [...likedA, ...likedB].slice(0, 2);

      const buffer = await BlendCard.generate(author, targetUser, score, sampleTracks);
      const attachment = new AttachmentBuilder(buffer, { name: 'spotify-blend.png' });

      const container = buildContainer({
        title: 'Spotify Taste Blend',
        content: i18n.cmd("**{author}** & **{target}** have a **{score}%** music taste compatibility!", { author: author.displayName || author.username, target: targetUser.displayName || targetUser.username, score }),
        icon: emoji.get('music') || '🎵'
      });

      const payload = {
        files: [attachment],
        components: [container],
        flags: MessageFlags.IsComponentsV2
      };

      if (interaction) {
        return await interaction.editReply(payload);
      }
      return await message.reply(payload);
    } catch (err) {
      logger.error('BlendCommand', 'Failed to generate blend card:', err);
      const errContainer = buildError(ctx.t("failedToGenerateBlend"));
      if (interaction) return interaction.editReply({ components: [errContainer], flags: MessageFlags.IsComponentsV2 });
      return message.reply({ components: [errContainer], flags: MessageFlags.IsComponentsV2 });
    }
  }
}

export default new BlendCommand();

// Made by Nikhil Under CodeX Devs
