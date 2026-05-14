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
        const upDownIcon = isPriceIncreased === null ? '' : (isPriceIncreased ? '🡱' : '🡳');

        const rate = parseInt(data?.data?.rate ?? 0);
        const displayValue = rate.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

        // Update/create labels
        if (!panelButtonText) {
            panelButtonText = new St.Label({
                style_class: 'cPanelText',
                text: `1$ = ${displayValue}T`,
                y_align: Clutter.ActorAlign.CENTER,
                style: 'line-height: 1; font-size: 14px;',
            });
            panelBox.add_child(panelButtonText);
        } else {
            panelButtonText.text = `1$ = ${displayValue}T`;
        }

        if (!panelButtonIndicator) {
            panelButtonIndicator = new St.Label({
                style_class: isPriceIncreased ? 'priceIncrease' : 'priceDecrease',
                text: upDownIcon,
                y_align: Clutter.ActorAlign.CENTER,
                style: 'line-height: 1; font-size: 12px;',
            });
            panelBox.add_child(panelButtonIndicator);
        } else {
            panelButtonIndicator.style_class = isPriceIncreased ? 'priceIncrease' : 'priceDecrease';
            panelButtonIndicator.text = upDownIcon;
        }

        panelButtonIndicator.get_clutter_text().set_line_alignment(0);
        panelButtonText.get_clutter_text().set_line_alignment(0);
    } catch (error) {
        logError(error, 'handle_request_dollar_api');
        if (!panelButtonText) {
            panelButtonText = new St.Label({
                text: '1$ = — T',
                y_align: Clutter.ActorAlign.CENTER,
            });
            panelBox.add_child(panelButtonText);
        } else {
            panelButtonText.text = '1$ = — T';
        }
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
    }
}
