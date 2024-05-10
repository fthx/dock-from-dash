import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

class SwitchRow {
    constructor(prefs, setting, title, subtitle) {
        const NewRow = new Adw.SwitchRow({
            title,
            subtitle
        });
        prefs.bind(
            setting,
            NewRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        return NewRow;
    }
}

class SpinRow {
    constructor(prefs, setting, title, subtitle, lower, upper, step_increment) {
        const adjustment = new Gtk.Adjustment({
            lower,
            upper,
            value: prefs.get_int(setting),
            step_increment
        })
        const NewRow = new Adw.SpinRow({
            adjustment,
            title,
            subtitle
        }
        )
        prefs.bind(
            setting,
            NewRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        return NewRow;
    }
}

export default class DockFromDashExtensionPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window._settings = this.getSettings('org.gnome.shell.extensions.dock-from-dash');

        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'dialog-information-symbolic',
        });
        window.add(page);

        const BehaviorGroup = new Adw.PreferencesGroup({
            title: _('Behavior'),
            description: _('Configure the Behavior of the Dock'),
        });
        page.add(BehaviorGroup);
        BehaviorGroup.add(new SpinRow(
            window._settings,
            'autohide-delay',
            _('Dock autohide timeout'),
            _('Delay, in milliseconds, before the dock hides after the cursor abandons it.'),
            0,
            1000,
            50
        ));
        BehaviorGroup.add(new SpinRow(
            window._settings,
            'toggle-delay',
            _('Dock toggle delay'),
            _('Delay, in milliseconds, before the dock shows after the cursor reaches the bottom of the screen.'),
            0,
            1000,
            50
        ));
        BehaviorGroup.add(new SpinRow(
            window._settings,
            'show-dock-duration',
            _('Show dock animation duration'),
            _('Duration, in milliseconds, of dock showing animation.'),
            0,
            1000,
            50
        ));
        BehaviorGroup.add(new SpinRow(
            window._settings,
            'hide-dock-duration',
            _('Hide dock animation duration'),
            _('Duration, in milliseconds, of dock hiding animation.'),
            0,
            1000,
            50
        ));
        BehaviorGroup.add(new SwitchRow(
            window._settings,
            'show-overview',
            _('Show overview at startup'),
            _('Show the overview at startup.')
        ));
    }
}