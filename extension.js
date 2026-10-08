'use strict';

import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import Soup from 'gi://Soup';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

let panelBox;                // BoxLayout container (replaces Bin)
let panelButtonText;         // St.Label
let panelButtonIndicator;    // St.Label
let session;                 // Soup.Session
let sourceId = null;
let arrows = null;           // chosen arrow pair, cached per enable()

// Prefer the nicer arrows; fall back when no installed font has the glyphs
const FANCY_ARROWS = { up: '🡱', down: '🡳' };
const BASIC_ARROWS = { up: '↑', down: '↓' };

function pickArrows(actor) {
    const layout = actor.create_pango_layout(FANCY_ARROWS.up + FANCY_ARROWS.down);
    return layout.get_unknown_glyphs_count() === 0 ? FANCY_ARROWS : BASIC_ARROWS;
}

// Fonts put glyphs at different heights inside their line box, so shift the
// label until the visible glyphs (ink), not the line box, sit on the center
function centerInk(label) {
    const [ink, logical] = label.get_clutter_text().get_layout().get_pixel_extents();
    const offset = (ink.y + ink.height / 2) - (logical.y + logical.height / 2);
    label.translation_y = ink.height > 0 ? -Math.round(offset) : 0;
}

function newCenteredLabel(params) {
    const label = new St.Label({ y_align: Clutter.ActorAlign.CENTER, ...params });
    // Re-measure once the theme font is applied
    label.connect_after('style-changed', () => centerInk(label));
    return label;
}

async function handle_request_dollar_api() {
    try {
        if (!session) {
            session = new Soup.Session({ timeout: 10 });
        }

        const url = 'https://currency.servicefather.ir/api/currencies/irt/usd';
        const message = Soup.Message.new('GET', url);

        // Await the request and get a GLib.Bytes back
        const bytes = await session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            null
        );

        // Optional: check HTTP status
        if (message.get_status() !== Soup.Status.OK) {
            throw new Error(`HTTP ${message.get_status()}`);
        }

        const response = new TextDecoder().decode(bytes.get_data());
        const data = JSON.parse(response);

        const diff = parseFloat(data?.data?.diff ?? 0);
        const isPriceIncreased = diff === 0 ? null : diff > 0;

        const rate = parseInt(data?.data?.rate ?? 0);
        const displayValue = rate.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

        // Update/create labels
        if (!panelButtonText) {
            panelButtonText = newCenteredLabel({
                style_class: 'cPanelText',
                text: `1$ = ${displayValue}T`,
                style: 'line-height: 1; font-size: 14px;',
            });
            panelBox.add_child(panelButtonText);
        } else {
            panelButtonText.text = `1$ = ${displayValue}T`;
        }

        if (!panelButtonIndicator) {
            panelButtonIndicator = newCenteredLabel({
                style: 'line-height: 1; font-size: 12px;',
            });
            panelBox.add_child(panelButtonIndicator);
        }

        if (!arrows) {
            arrows = pickArrows(panelButtonIndicator.get_clutter_text());
        }

        const upDownIcon = isPriceIncreased === null ? '' : (isPriceIncreased ? arrows.up : arrows.down);
        panelButtonIndicator.style_class = isPriceIncreased ? 'priceIncrease' : 'priceDecrease';
        panelButtonIndicator.text = upDownIcon;

        panelButtonIndicator.get_clutter_text().set_line_alignment(0);
        panelButtonText.get_clutter_text().set_line_alignment(0);
        centerInk(panelButtonIndicator);
        centerInk(panelButtonText);
    } catch (error) {
        logError(error, 'handle_request_dollar_api');
        if (!panelButtonText) {
            panelButtonText = newCenteredLabel({
                text: '1$ = — T',
            });
            panelBox.add_child(panelButtonText);
        } else {
            panelButtonText.text = '1$ = — T';
        }
        centerInk(panelButtonText);
    }
}

export default class Extension {
    enable() {
        panelBox = new St.BoxLayout({
            style_class: 'panel-button',
            y_expand: true
        });

        Main.panel._centerBox.insert_child_at_index(panelBox, 0);

        handle_request_dollar_api();

        sourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
            handle_request_dollar_api();
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        if (sourceId) {
            GLib.Source.remove(sourceId);
            sourceId = null;
        }

        if (panelButtonIndicator) {
            panelButtonIndicator.destroy();
            panelButtonIndicator = null;
        }

        if (panelButtonText) {
            panelButtonText.destroy();
            panelButtonText = null;
        }

        if (panelBox) {
            if (panelBox.get_parent()) {
                panelBox.get_parent().remove_child(panelBox);
            }
            panelBox.destroy();
            panelBox = null;
        }

        if (session) {
            session.abort();
            session = null;
        }

        arrows = null;
    }
}
