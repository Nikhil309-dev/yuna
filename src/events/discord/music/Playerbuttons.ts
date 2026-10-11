import {
	ContainerBuilder,
	TextDisplayBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	MessageFlags,
} from 'discord.js';
import { PlayerManager } from '#audio/PlayerManager';
import { FilterEngine } from '#audio/FilterEngine';
import { logger } from '#utils/logger';
import { db } from '#database/Database';
import { createPlayerContainer } from '#ui/Components';
import { EventUtils } from '#utils/EventUtils';
import { i18n } from '#utils/i18n.js';

function buildResponseContainer(title: any, text: any) {
	return new ContainerBuilder()
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### **${title}**`))
		.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
}

let registered = false;

function registerPlayerButtons(client: any) {
    if (registered) return;
    registered = true;

    const defaultOptions = { defer: true, sameUser: false, sameVoice: true };

    const registerBoth = (shortName: string, yunaName: string, handler: (interaction: any) => Promise<void>, options = defaultOptions) => {
        client.components.register(shortName, handler, options);
        client.components.register(yunaName, handler, options);
    };

    // `t` resolves the locale bound by ComponentLoader for this interaction.
    const t = (key: string, replacements?: Record<string, any>) => i18n.tr(key, replacements);
    const errCard = () => buildResponseContainer(t('ui.error.title'), t('player.noPlayer'));

    registerBoth('music_previous', 'yuna:music:previous', async (interaction: any) => {
        const player = client.music?.getPlayer(interaction.guild.id);
        if (!player) return interaction.editReply({ components: [errCard()], flags: MessageFlags.IsComponentsV2 });
        const pm = new PlayerManager(player);
        const hasPrevious = await pm.playPrevious();
        const response = hasPrevious ? t('player.previousTrack') : t('player.noPrevious');
        await interaction.editReply({ components: [buildResponseContainer(t('title.previousTrack'), response)], flags: MessageFlags.IsComponentsV2 });
    });

    registerBoth('music_pause', 'yuna:music:pause', async (interaction: any) => {
        const player = client.music?.getPlayer(interaction.guild.id);
        if (!player) return interaction.editReply({ components: [errCard()], flags: MessageFlags.IsComponentsV2 });
        const pm = new PlayerManager(player);
        let response = '';
        let title = '';
        if (pm.isPaused) {
            await pm.resume();
            title = t('title.musicResumed');
            response = t('player.resumed');
            EventUtils.refreshNowPlaying(client, player).catch(() => {});
        } else {
            await pm.pause();
            title = t('title.musicPaused');
            response = t('player.paused');
        }
        await interaction.editReply({ components: [buildResponseContainer(title, response)], flags: MessageFlags.IsComponentsV2 });
    });

    registerBoth('music_skip', 'yuna:music:skip', async (interaction: any) => {
        const player = client.music?.getPlayer(interaction.guild.id);
        if (!player) return interaction.editReply({ components: [errCard()], flags: MessageFlags.IsComponentsV2 });
        const pm = new PlayerManager(player);
        const trackTitle = pm.currentTrack?.info?.title || i18n.cmd('Unknown Track');
        await pm.skip();
        await interaction.editReply({ components: [buildResponseContainer(t('title.trackSkipped'), `${t('player.skipped')}: **${trackTitle}**`)], flags: MessageFlags.IsComponentsV2 });
    });

    registerBoth('music_stop', 'yuna:music:stop', async (interaction: any) => {
        const player = client.music?.getPlayer(interaction.guild.id);
        if (!player) return interaction.editReply({ components: [errCard()], flags: MessageFlags.IsComponentsV2 });
        const pm = new PlayerManager(player);
        await pm.stop();
        await interaction.editReply({ components: [buildResponseContainer(t('title.musicStopped'), t('player.stopped'))], flags: MessageFlags.IsComponentsV2 });
    });

    registerBoth('music_like', 'yuna:music:like', async (interaction: any) => {
        const player = client.music?.getPlayer(interaction.guild.id);
        if (!player) return interaction.editReply({ components: [errCard()], flags: MessageFlags.IsComponentsV2 });
        const pm = new PlayerManager(player);
        const trackToLike = pm.currentTrack;
        let response = '';
        if (!trackToLike) {
            response = t('player.noTrack');
        } else {
            const added = db.liked?.addLikedTrack ? db.liked.addLikedTrack(interaction.user.id, trackToLike.info) : false;
            response = added
                ? `${t('player.liked')} **${trackToLike.info.title}**`
                : `**${trackToLike.info.title}** ${t('player.alreadyLiked')}`;
        }
        await interaction.editReply({ components: [buildResponseContainer(t('title.favourites'), response)], flags: MessageFlags.IsComponentsV2 });
    });

    registerBoth('music_rewind10', 'yuna:music:rewind10', async (interaction: any) => {
        const player = client.music?.getPlayer(interaction.guild.id);
        if (!player) return interaction.editReply({ components: [errCard()], flags: MessageFlags.IsComponentsV2 });
        const pm = new PlayerManager(player);
        await pm.rewind(10000);
        await interaction.editReply({ components: [buildResponseContainer(t('title.playbackSeek'), `${t('player.rewound')} **-10s**`)], flags: MessageFlags.IsComponentsV2 });
    });

    registerBoth('music_rewind5', 'yuna:music:rewind5', async (interaction: any) => {
        const player = client.music?.getPlayer(interaction.guild.id);
        if (!player) return interaction.editReply({ components: [errCard()], flags: MessageFlags.IsComponentsV2 });
        const pm = new PlayerManager(player);
        await pm.rewind(5000);
        await interaction.editReply({ components: [buildResponseContainer(t('title.playbackSeek'), `${t('player.rewound')} **-5s**`)], flags: MessageFlags.IsComponentsV2 });
    });

    registerBoth('music_forward5', 'yuna:music:forward5', async (interaction: any) => {
        const player = client.music?.getPlayer(interaction.guild.id);
        if (!player) return interaction.editReply({ components: [errCard()], flags: MessageFlags.IsComponentsV2 });
        const pm = new PlayerManager(player);
        await pm.forward(5000);
        await interaction.editReply({ components: [buildResponseContainer(t('title.playbackSeek'), `${t('player.forwarded')} **+5s**`)], flags: MessageFlags.IsComponentsV2 });
    });

    registerBoth('music_forward10', 'yuna:music:forward10', async (interaction: any) => {
        const player = client.music?.getPlayer(interaction.guild.id);
        if (!player) return interaction.editReply({ components: [errCard()], flags: MessageFlags.IsComponentsV2 });
        const pm = new PlayerManager(player);
        await pm.forward(10000);
        await interaction.editReply({ components: [buildResponseContainer(t('title.playbackSeek'), `${t('player.forwarded')} **+10s**`)], flags: MessageFlags.IsComponentsV2 });
    });

    registerBoth('music_replay', 'yuna:music:replay', async (interaction: any) => {
        const player = client.music?.getPlayer(interaction.guild.id);
        if (!player) return interaction.editReply({ components: [errCard()], flags: MessageFlags.IsComponentsV2 });
        const pm = new PlayerManager(player);
        await pm.replay();
        await interaction.editReply({ components: [buildResponseContainer(t('title.trackReplay'), t('player.replaying'))], flags: MessageFlags.IsComponentsV2 });
    });

    registerBoth('np_feature_menu', 'yuna:music:feature', async (interaction: any) => {
        const player = client.music?.getPlayer(interaction.guild.id);
        if (!player) return interaction.editReply({ components: [errCard()], flags: MessageFlags.IsComponentsV2 });
        const selectedValue = interaction.values[0];
        const selectedMode = selectedValue.replace('mode_', '');
        player.set('controlMode', selectedMode);

        try {
            const style = interaction.user?.id ? db.getNpStyle?.(interaction.user.id) : 'card';
            const isTextMode = style === 'text';
            const track = player.queue?.current;
            // Preserve the now-playing card: the image gallery and progress bar
            // only render when hasImage/position are passed, otherwise switching
            // mode redraws the message as bare controls and the card "disappears".
            const newContainer = createPlayerContainer
                ? createPlayerContainer(selectedMode, {
                    isTextMode,
                    track,
                    hasImage: !isTextMode,
                    position: player.position || 0,
                })
                : buildResponseContainer(t('title.modeChanged'), `${t('player.modeChanged')} ${selectedMode}`);

            // Edit the original now-playing message in place so the card keeps
            // its attachment; cleaning up the ephemeral "thinking" reply after.
            const target = interaction.message ?? interaction;
            await target.edit({
                components: [newContainer],
                flags: MessageFlags.IsComponentsV2
            });

            await interaction.deleteReply().catch(() => {});
        } catch (err: any) {
            logger.debug('PlayerButtons', `Failed to update mode controls: ${err?.message}`);
            await interaction.editReply({ components: [buildResponseContainer(t('ui.error.title'), t('player.modeFailed'))], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    });

    registerBoth('np_filter_menu', 'yuna:music:filter', async (interaction: any) => {
        const player = client.music?.getPlayer(interaction.guild.id);
        if (!player) return interaction.editReply({ components: [errCard()], flags: MessageFlags.IsComponentsV2 });
        const selectedFilter = interaction.values[0];
        const filterName = selectedFilter.replace('filter_', '');

        if (filterName === 'reset') {
            await FilterEngine.reset(player);
            return interaction.editReply({ components: [buildResponseContainer(t('title.audioFilter'), t('player.filterCleared'))], flags: MessageFlags.IsComponentsV2 });
        }

        const applied = await FilterEngine.apply(player, filterName);
        if (!applied) return interaction.editReply({ components: [buildResponseContainer(t('ui.error.title'), `${t('player.unknownFilter')}: **${filterName}**`)], flags: MessageFlags.IsComponentsV2 });
        await interaction.editReply({ components: [buildResponseContainer(t('title.audioFilter'), `${t('player.filterApplied')}: **${filterName}**`)], flags: MessageFlags.IsComponentsV2 });
    });
}

export default {
    name: "interactionCreate",
    once: false,
    async execute(interaction: any, client: any) {
        if (!registered) {
            registerPlayerButtons(client);
        }

        if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
            try {
                await client.components.handle(interaction);
            } catch (error) {
                logger.error('InteractionCreate', 'Error handling component:', error);
            }
        }
    }
};

// Made by Nikhil Under CodeX Devs
