import {
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder} from "discord.js";
import { Command } from "#core/Command";
import emoji from "#config/emoji";
import { logger } from "#utils/logger";
import { buildContainer, buildError, buildSuccess } from "#ui/Theme";

class ServersCommand extends Command {
  constructor() {
    super({
      name: "servers",
      description: "Explore servers, inspect music state, generate invites, or leave remotely (Owner Only)",
      usage: "servers [leave <guildId> | invite <guildId> | search <query>]",
      aliases: ["guilds", "serverlist", "glist"],
      category: "developer",
      access: { ownerOnly: true },
      slash: {
        enabled: false
      }
    });
  }

  async autocomplete({ interaction, client }: any) {
    const focused = interaction.options.getFocused().toLowerCase();
    const guilds: any[] = Array.from(client.guilds.cache.values());

    const choices = guilds
      .filter((g: any) => g.name.toLowerCase().includes(focused) || g.id.includes(focused))
      .slice(0, 25)
      .map((g: any) => ({
        name: `🏰 ${g.name.slice(0, 50)} (${g.memberCount} members)`,
        value: g.id
      }));

    await interaction.respond(choices).catch(() => {});
  }

  async execute(ctx: any) {
    const { client, interaction, message, args } = ctx;
    const context = interaction || message;

    const action = interaction?.options?.getString("action") || args?.[0]?.toLowerCase() || "list";
    const targetGuildId = interaction?.options?.getString("server") || args?.[1];

    try {
      if (action === "leave" && targetGuildId) {
        return this._handleLeaveGuild(context, client, targetGuildId);
      }

      if (action === "invite" && targetGuildId) {
        return this._handleInviteGuild(context, client, targetGuildId);
      }

      const searchQuery = (action === "search" && targetGuildId) ? targetGuildId.toLowerCase() : null;
      return this._displayGuildList(context, client, searchQuery);
    } catch (error: any) {
      logger.error("ServersCommand", "Error in servers command", error);
      const err = buildError(ctx.t("failedToInspectServers"));
      if (interaction) return interaction.editReply({ components: [err], flags: MessageFlags.IsComponentsV2 });
      return message?.reply({ components: [err], flags: MessageFlags.IsComponentsV2 });
    }
  }

  async _displayGuildList(context: any, client: any, queryFilter = null, page = 0) {
    let guilds: any[] = Array.from(client.guilds.cache.values());

    if (queryFilter) {
      guilds = guilds.filter(
        (g: any) => g.name.toLowerCase().includes(queryFilter) || g.id.includes(queryFilter)
      );
    }

    if (guilds.length === 0) {
      const err = buildError("No matching servers found.");
      if (context.editReply) return context.editReply({ components: [err], flags: MessageFlags.IsComponentsV2 });
      return context.reply({ components: [err], flags: MessageFlags.IsComponentsV2 });
    }

    const guildsPerPage = 5;
    const totalPages = Math.ceil(guilds.length / guildsPerPage);
    page = Math.max(0, Math.min(page, totalPages - 1));

    const currentGuilds = guilds.slice(page * guildsPerPage, (page + 1) * guildsPerPage);
    const totalMembers = guilds.reduce((acc: number, g: any) => acc + (g.memberCount || 0), 0);

    const container = buildContainer({
      title: "Connected Servers Inspector",
      content: `📊 **Total Servers:** \`${client.guilds.cache.size}\` | **Total Reach:** \`${totalMembers.toLocaleString()}\` members | **Page:** \`${page + 1}/${totalPages}\``,
      icon: emoji.get("crown") || "👑"
    });

    currentGuilds.forEach((guild: any, idx: number) => {
      const globalIdx = page * guildsPerPage + idx + 1;
      const player = client.audio?.getPlayer(guild.id);
      const musicStatus = player?.playing ? `🎵 Playing: *${player.queue?.current?.info?.title?.slice(0, 30) || 'Active'}*` : "💤 Idle";

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `\`${globalIdx}.\` **${guild.name}** \`(${guild.id})\`\n└ **Members:** \`${guild.memberCount}\` • **Music:** ${musicStatus} • **Owner:** <@${guild.ownerId}>`
            )
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(
              guild.iconURL({ size: 128 }) || "https://cdn.discordapp.com/embed/avatars/0.png"
            )
          )
      );
    });

    const payload = { components: [container], flags: MessageFlags.IsComponentsV2 };
    if (context.editReply && (context.deferred || context.replied)) {
      return await context.editReply(payload);
    }
    return await context.reply(payload);
  }

  async _handleLeaveGuild(context: any, client: any, guildId: any) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      const err = buildError(`Server with ID \`${guildId}\` was not found in cache.`);
      if (context.editReply) return context.editReply({ components: [err], flags: MessageFlags.IsComponentsV2 });
      return context.reply({ components: [err], flags: MessageFlags.IsComponentsV2 });
    }

    const name = guild.name;
    await guild.leave();
    const success = buildSuccess(`Successfully left server **${name}** \`(${guildId})\`.`, "Server Left");
    if (context.editReply) return context.editReply({ components: [success], flags: MessageFlags.IsComponentsV2 });
    return context.reply({ components: [success], flags: MessageFlags.IsComponentsV2 });
  }

  async _handleInviteGuild(context: any, client: any, guildId: any) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      const err = buildError(`Server with ID \`${guildId}\` was not found in cache.`);
      if (context.editReply) return context.editReply({ components: [err], flags: MessageFlags.IsComponentsV2 });
      return context.reply({ components: [err], flags: MessageFlags.IsComponentsV2 });
    }

    let inviteUrl = null;
    const channel = guild.channels.cache.find((c: any) => c.isTextBased() && c.permissionsFor(guild.members.me)?.has('CreateInstantInvite'));

    if (channel) {
      const invite = await channel.createInvite({ maxAge: 3600, maxUses: 1 }).catch(() => null);
      if (invite) inviteUrl = invite.url;
    }

    if (inviteUrl) {
      const success = buildSuccess(`Invite link for **${guild.name}**: [Join Server](${inviteUrl}) (Expires in 1h)`, "Invite Generated");
      if (context.editReply) return context.editReply({ components: [success], flags: MessageFlags.IsComponentsV2 });
      return context.reply({ components: [success], flags: MessageFlags.IsComponentsV2 });
    }

    const err = buildError(`Could not generate invite for **${guild.name}** (missing permissions).`);
    if (context.editReply) return context.editReply({ components: [err], flags: MessageFlags.IsComponentsV2 });
    return context.reply({ components: [err], flags: MessageFlags.IsComponentsV2 });
  }
}

export default new ServersCommand();

// Made by Nikhil Under CodeX Devs
