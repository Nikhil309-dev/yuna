/**
 * Shared filter command card builders (Phase 5 localization completion).
 *
 * The ~22 filter commands previously duplicated an English content block each;
 * they now delegate here so the text is localized in exactly one place.
 * Titles resolve through `i18n.translateTitle()` inside Theme, phrases come
 * from the locale-bound phrase pool.
 */
import { buildContainer, buildError } from "#ui/Theme";
import { config } from "#config/config";
import emoji from "#config/emoji";
import phrases from "#utils/phrases";
import { i18n } from "#utils/i18n";

/** Success card for a named filter command (bassboost, reggae, …). */
export function buildFilterAppliedContainer(filterName: string) {
	const name = String(filterName);
	const content =
		i18n.tr("cmd.**Filter Information**") +
		"\n\n" +
		i18n.tr("cmd.└─ **{emoji} Filter:** {filter} Equalizer", {
			emoji: emoji.get("music") || "🎵",
			filter: name,
		}) +
		"\n" +
		i18n.tr("cmd.└─ **{emoji} Status:** Applied successfully", {
			emoji: emoji.get("check") || "✅",
		}) +
		"\n" +
		i18n.tr("cmd.└─ **{emoji} Effect:** {effect}", {
			emoji: emoji.get("info") || "ℹ️",
			effect: i18n.tr("cmd.Enhanced for {filter} music", { filter: name.toLowerCase() }),
		}) +
		"\n\n" +
		`*${phrases.get("filterApplied")}*`;

	return buildContainer({
		title: "Filter Applied",
		content,
		thumbnail: config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork,
		icon: emoji.get("music") || "ℹ️",
	});
}

/** Success card for resetting all filters (/reset). */
export function buildFilterResetContainer() {
	const content =
		i18n.tr("cmd.**Reset Information**") +
		"\n\n" +
		i18n.tr("cmd.└─ **{emoji} Filters:** All filters cleared", {
			emoji: emoji.get("music") || "🎵",
		}) +
		"\n" +
		i18n.tr("cmd.└─ **{emoji} Status:** Reset successfully", {
			emoji: emoji.get("check") || "✅",
		}) +
		"\n" +
		i18n.tr("cmd.└─ **{emoji} Effect:** {effect}", {
			emoji: emoji.get("info") || "ℹ️",
			effect: i18n.tr("cmd.Audio back to original quality"),
		}) +
		"\n\n" +
		`*${phrases.get("filterCleared")}*`;

	return buildContainer({
		title: "Filter Applied",
		content,
		thumbnail: config.assets?.defaultThumbnail || config.assets?.defaultTrackArtwork,
		icon: emoji.get("music") || "ℹ️",
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
