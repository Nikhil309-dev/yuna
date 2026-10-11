/**
 * Shared filter command card builders (Phase 5 localization completion).
 *
 * The ~22 filter commands previously duplicated an English content block each;
 * they now delegate here so the text is localized in exactly one place.
 * Titles resolve through `i18n.translateTitle()` inside Theme, phrases come
 * from the locale-bound phrase pool.
 */
import { buildResult, buildError } from "#ui/Theme";
import { config } from "#config/config";
import emoji from "#config/emoji";
import { i18n } from "#utils/i18n";

/** Success card for a named filter command (bassboost, reggae, …). */
export function buildFilterAppliedContainer(filterName: string) {
        const name = String(filterName);
        const blocks = [
                {
                        label: i18n.cmd("Filter"),
                        text: i18n.cmd("{emoji} **{filter}** Equalizer", {
                                emoji: emoji.get("music") || "🎵",
                                filter: name,
                        }),
                },
                {
                        label: i18n.cmd("Status"),
                        text: i18n.cmd("{emoji} Applied successfully", {
                                emoji: emoji.get("check") || "✅",
                        }),
                },
                {
                        label: i18n.cmd("Effect"),
                        text: i18n.cmd("{emoji} {effect}", {
                                emoji: emoji.get("info") || "ℹ️",
                                effect: i18n.cmd("Enhanced for {filter} music", { filter: name.toLowerCase() }),
                        }),
                },
        ];

        return buildResult({
                title: "Filter Applied",
                blocks,
                icon: emoji.get("music") || "ℹ️",
                avatarUrl: config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork,
                footer: 'phrases.filterApplied',
        });
}

/** Success card for resetting all filters (/reset). */
export function buildFilterResetContainer() {
        const blocks = [
                {
                        label: i18n.cmd("Filters"),
                        text: i18n.cmd("{emoji} All filters cleared", {
                                emoji: emoji.get("music") || "🎵",
                        }),
                },
                {
                        label: i18n.cmd("Status"),
                        text: i18n.cmd("{emoji} Reset successfully", {
                                emoji: emoji.get("check") || "✅",
                        }),
                },
                {
                        label: i18n.cmd("Effect"),
                        text: i18n.cmd("{emoji} {effect}", {
                                emoji: emoji.get("info") || "ℹ️",
                                effect: i18n.cmd("Audio back to original quality"),
                        }),
                },
        ];

        return buildResult({
                title: "Filters Reset",
                blocks,
                icon: emoji.get("reset") || "🔄",
                avatarUrl: config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork,
                footer: 'phrases.filterCleared',
        });
}

/** Error card when applying a named filter fails. */
export function buildFilterError(filterName: string) {
        return buildError(
                i18n.cmd("Could not apply the {filter} filter.", { filter: String(filterName).toLowerCase() }),
                "Error",
        );
}

// Made by Nikhil Under CodeX Devs
