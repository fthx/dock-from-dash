/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;

const ExtensionUtils = imports.misc.extensionUtils;
const Gio = imports.gi.Gio;
const Gettext = imports.gettext;

var _ = Gettext.domain("dock-from-dash").gettext
Gettext.bindtextdomain("dock-from-dash", ExtensionUtils.getCurrentExtension().path + "/locale");

let settings;

function init() {
    settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.dock-from-dash');
}

function fillPreferencesWindow(window) {
    const Adw = imports.gi.Adw;

    const page = new Adw.PreferencesPage();

    /* Behavior PreferencesGroup */
    const behaviorGroup = new Adw.PreferencesGroup({ title: _("Behavior") });
    page.add(behaviorGroup);

    let showOverview = buildActionRowWithSwitch('show-overview', _("Show overview at startup"), "");
    behaviorGroup.add(showOverview);

    let alwaysShow = buildActionRowWithSwitch('always-show', _("Always show the dock"), "");
    behaviorGroup.add(alwaysShow);

    let hideTimeout = buildActionRowWithSpinButton('autohide-delay', _("Delay for dock autohide (ms)"), _("Delay, in milliseconds, before the dock hides after the cursor abandons it."), 0, 1000, 50);
    behaviorGroup.add(hideTimeout);

    let toggleDelay = buildActionRowWithSpinButton('toggle-delay', _("Delay for dock showing (ms)"), _("Delay, in milliseconds, before the dock shows after the cursor reaches the bottom of the screen."), 0, 1000, 50);
    behaviorGroup.add(toggleDelay);

    let showDockDuration = buildActionRowWithSpinButton('show-dock-duration', _("Duration of dock showing animation (ms)"), _("Duration, in milliseconds, of dock showing animation."), 0, 1000, 50);
    behaviorGroup.add(showDockDuration);

    let hideDockDuration = buildActionRowWithSpinButton('hide-dock-duration', _("Duration of dock hiding animation (ms)"), _("Duration, in milliseconds, of dock hiding animation."), 0, 1000, 50);
    behaviorGroup.add(hideDockDuration);

    /* Appearance PreferencesGroup */
    const appearanceGroup = new Adw.PreferencesGroup({ title: _("Appearance") });
    page.add(appearanceGroup);

    let backgroundOpacity = buildActionRowWithSpinButton('background-opacity', _("Dock background opacity (%)"), _("Opacity, in %, of the dock background, 0 = translucent 100 = solid."), 0, 100, 5);
    appearanceGroup.add(backgroundOpacity);

    let iconsOpacity = buildActionRowWithSpinButton('icons-opacity', _("Dock icons opacity (%)"), _("Opacity, in %, of the dock icons, 0 = translucent 100 = solid."), 0, 100, 5);
    appearanceGroup.add(iconsOpacity);

    window.add(page);
}

/**
 * Create an Adw.ActionRow using @labelText, appending a Gtk.Switch control to
 * the row, and binding its value to the setting @key.
 * @param {string} key - GSettings key this ActionRow should bind to.
 * @param {string} titleText - Title of the ActionRow.
 * @param {string} subtitleText - Subtitle of the ActionRow.
 * @returns Adw.ActionRow
 */
function buildActionRowWithSwitch(key, titleText, subtitleText) {
    const Adw = imports.gi.Adw;

    let row = new Adw.ActionRow({ title: titleText, subtitle: subtitleText });
    let switcher = new Gtk.Switch({ active: settings.get_boolean(key), valign: Gtk.Align.CENTER });

    settings.bind(key, switcher, 'active', Gio.SettingsBindFlags.DEFAULT);
    row.add_suffix(switcher);
    row.activatable_widget = switcher;

    return row;
}

/**
 * Create an Adw.ActionRow using @labelText, appending a Gtk.SpinButton control
 * to the row, and binding its value to the setting @key.
 * @param {string} key - GSettings key this ActionRow should bind to.
 * @param {string} titleText - Title of the ActionRow.
 * @param {string} subtitleText - Subtitle of the ActionRow.
 * @param {integer} minval - Lowest value of the SpinButton.
 * @param {integer} maxval - Highest value of the SpinButton.
 * @param {integer} step_increment - Adjustment increment of the SpinButton.
 * @returns Adw.ActionRow
 */
function buildActionRowWithSpinButton(key, titleText, subtitleText, minval, maxval, step_increment) {
    const Adw = imports.gi.Adw;

    let row = new Adw.ActionRow({ title: titleText, subtitle: subtitleText });
    let adjust = new Gtk.Adjustment({ lower: minval, upper: maxval, value: settings.get_int(key), step_increment: step_increment });
    let spin = new Gtk.SpinButton({ digits: 0, adjustment: adjust, valign: Gtk.Align.CENTER });

    settings.bind(key, adjust, 'value', Gio.SettingsBindFlags.DEFAULT);
    row.add_suffix(spin);
    row.activatable_widget = spin;

    return row;
}

function buildPrefsWidget() {
    let frame = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL,
                              margin_top: 10,
                              margin_bottom: 10,
                              margin_start: 10,
                              margin_end: 10,
                              spacing: 10});

    let showOverview = buildSwitcher('show-overview',_("Show overview at startup"));
    frame.append(showOverview);

    let alwaysShow = buildSwitcher('always-show',_("Always show the dock"));
    frame.append(alwaysShow);

    let showInFullScreen = buildSwitcher('show-in-full-screen',_("Show dock in full screen mode"));
    frame.append(showInFullScreen);

    let backgroundOpacity = buildSpinButton('background-opacity',_("Dock background opacity (%)"), 0, 100, 5);
    frame.append(backgroundOpacity);

    let iconsOpacity = buildSpinButton('icons-opacity',_("Dock icons opacity (%)"), 0, 100, 5);
    frame.append(iconsOpacity);

    let hideTimeout = buildSpinButton('autohide-delay',_("Delay for dock autohide (ms)"), 0, 1000, 50);
    frame.append(hideTimeout);

    let toggleDelay = buildSpinButton('toggle-delay',_("Delay for dock showing (ms)"), 0, 1000, 50);
    frame.append(toggleDelay);

    let showDockDuration = buildSpinButton('show-dock-duration',_("Duration of dock showing animation (ms)"), 0, 1000, 50);
    frame.append(showDockDuration);

    let hideDockDuration = buildSpinButton('hide-dock-duration',_("Duration of dock hiding animation (ms)"), 0, 1000, 50);
    frame.append(hideDockDuration);

    frame.show();
    return frame;
}

function buildSwitcher(key, labelText) {
    let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 });
    let label = new Gtk.Label({ label: labelText, xalign: 0 });
    let switcher = new Gtk.Switch({ active: settings.get_boolean(key) });

    label.set_hexpand(true);
    switcher.set_hexpand(false);
    switcher.set_halign(Gtk.Align.END);
    settings.bind(key, switcher, 'active', 3);

    hbox.append(label);
    hbox.append(switcher);

    return hbox;
}

function buildSpinButton(key, labeltext, minval, maxval, step_increment) {
    let hbox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 });
    let label = new Gtk.Label({label: labeltext, xalign: 0 });
    let adjust = new Gtk.Adjustment({lower: minval, upper: maxval, value: settings.get_int(key), step_increment: step_increment});
    let spin = new Gtk.SpinButton({digits: 0, adjustment: adjust});

    label.set_hexpand(true);
    spin.set_hexpand(false);
    spin.set_halign(Gtk.Align.END);
    settings.bind(key, adjust, 'value', 3);

    hbox.append(label);
    hbox.append(spin);

    return hbox;
}
