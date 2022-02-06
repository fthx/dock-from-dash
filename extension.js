/*
    Dock from Dash - GNOME Shell 40+ extension
    Copyright Francois Thirioux 2021, 2022
    GitHub contributors: @fthx
    Some ideas picked from GNOME Shell native code
    License GPL v3
*/

const { Clutter, GLib, GObject, Shell, St } = imports.gi;

const Main = imports.ui.main;
const Dash = imports.ui.dash;
const AppDisplay = imports.ui.appDisplay;

var DASH_MAX_HEIGHT_RATIO = 0.15;
var DASH_OPACITY_RATIO = 0.9;
var SHOW_DOCK_BOX_HEIGHT = 2;
var SHOW_DOCK_DURATION = 100;
var HIDE_DOCK_DURATION = 200;
var SHOW_DOCK_DELAY = 100;
var HIDE_DOCK_DELAY = 300;
var AUTO_HIDE_DOCK_DELAY = 300;


var ScreenBorderBox = GObject.registerClass(
class ScreenBorderBox extends St.BoxLayout {
    _init() {
        super._init();
        Main.layoutManager.addTopChrome(this);
        this.set_track_hover(true);
        this.set_reactive(true);
        this.show();
    }
});

var Dock = GObject.registerClass(
class Dock extends Dash.Dash {
    _init() {
        super._init();
        Main.layoutManager.addTopChrome(this);
        this.showAppsButton.set_toggle_mode(false);
        this.set_track_hover(true);
        this.set_reactive(true);
        this._dashContainer.set_track_hover(true);
        this._dashContainer.set_reactive(true);
        this.set_opacity(Math.round(DASH_OPACITY_RATIO * 255));
        this.show();
    }
});

class Extension {
    constructor() {
    }

    _modify_native_click_behavior() {
        this.original_click_function = AppDisplay.AppIcon.prototype.activate;
        AppDisplay.AppIcon.prototype.activate = function(button) {
            let event = Clutter.get_current_event();
            let modifiers = event ? event.get_state() : 0;
            let isMiddleButton = button && button == Clutter.BUTTON_MIDDLE;
            let isCtrlPressed = (modifiers & Clutter.ModifierType.CONTROL_MASK) != 0;
            let openNewWindow = this.app.can_open_new_window() && this.app.state == Shell.AppState.RUNNING && (isCtrlPressed || isMiddleButton);
            if (this.app.state == Shell.AppState.STOPPED || openNewWindow) {
                this.animateLaunch();
            }
            if (openNewWindow) {
                this.app.open_new_window(-1);
                Main.overview.hide();
            } else {
                switch (this.app.get_n_windows()) {
                    case 0:
                        this.app.activate();
                        Main.overview.hide();
                    break;
                    case 1:
                        if (this.app.get_windows()[0].has_focus() && this.app.get_windows()[0].can_minimize()) {
                            this.app.get_windows()[0].minimize();
                            Main.overview.hide();
                        }
                        if (!this.app.get_windows()[0].has_focus()) {
                            this.app.get_windows()[0].activate(global.get_current_time());
                            Main.overview.hide();
                        }
                    break;
                    default:
                        Main.overview.show();
                }               
            }
        }
    }

    _dock_refresh() {
        if (this.dock_refreshing) {
            return;
        }
        this.dock_refreshing = true;
        this.work_area = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        if (!this.work_area) {
            return;
        }
        this.max_dock_height = Math.round(this.work_area.height * DASH_MAX_HEIGHT_RATIO);
        this.dock.set_width(this.work_area.width);
        this.dock.set_height(Math.min(this.dock.get_preferred_height(this.work_area.width), this.max_dock_height));
        this.dock.setMaxSize(this.work_area.width, this.max_dock_height);
        this.dock.set_position(this.work_area.x, this.work_area.y + this.work_area.height);
        this.dock.show();
        this._hide_dock();
        this.refresh_screen_border_box_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            this._screen_border_box_refresh();
        });
        this.dock_refreshing = false;
    }

    _screen_border_box_refresh() {
        this.screen_border_box.set_size(this.dock._dashContainer.width, SHOW_DOCK_BOX_HEIGHT);
        this.screen_border_box_x = this.work_area.x + Math.round((this.work_area.width - this.dock._dashContainer.width) / 2);
        this.screen_border_box_y = this.work_area.y + this.work_area.height - SHOW_DOCK_BOX_HEIGHT;
        this.screen_border_box.set_position(this.screen_border_box_x, this.screen_border_box_y);
    }

    _on_dock_hover() {
        if (this.dock.is_visible() && !this.dock._dashContainer.get_hover()) {
            this.hide_dock_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HIDE_DOCK_DELAY, () => {
                if (!this.dock._dashContainer.get_hover() && !this.screen_border_box.get_hover()) {
                    this._hide_dock();
                }
                this.hide_dock_timeout = null;
            });
        }
    }

    _on_screen_border_box_hover() {
        if (!this.dock.is_visible() && !Main.overview.visible && !Main.sessionMode.isLocked) {
            if (!global.display.get_focus_window() || !global.display.get_focus_window().is_fullscreen()) {
                this.show_dock_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SHOW_DOCK_DELAY, () => {
                    if (this.screen_border_box.get_hover()) {
                        this._show_dock();
                    }
                    this.show_dock_timeout = null;
                });
            }
        }
        if (!Main.overview.visible && !Main.sessionMode.isLocked) {
            this.auto_hide_dock_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, AUTO_HIDE_DOCK_DELAY, () => {
                if (!this.dock._dashContainer.get_hover() && !this.screen_border_box.get_hover()) {
                    this._hide_dock();
                }
                this.auto_hide_dock_timeout = null;
            });
        }
    }

    _on_overview_hide_dock() {
        if (this.dock_animated || !this.dock.is_visible()) {
            return;
        }
        this.dock_animated = true;
        this.dock.hide();
        this.dock.ease({
            duration: 0,
            translation_y: this.dock.height,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.dock_animated = false;
            },
        });
    }

    _hide_dock() {
        if (this.dock_animated || !this.dock.is_visible()) {
            return;
        }
        this.dock_animated = true;
        this.dock.ease({
            duration: HIDE_DOCK_DURATION,
            translation_y: this.dock.height,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.dock_animated = false;
                this.dock.hide();
            },
        });
    }

    _show_dock() {
        if (this.dock_animated || this.dock.is_visible()) {
            return;
        }
        this.dock.show();
        this.dock_animated = true;
        this.dock.ease({
            duration: SHOW_DOCK_DURATION,
            translation_y: -this.dock.height,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.dock_animated = false;
            },
        });
    }

    _create_dock() {
        this.dock = new Dock();
        this.screen_border_box = new ScreenBorderBox();
        this._dock_refresh();
    }

    enable() {
        this._modify_native_click_behavior();
        this._create_dock();
        this.dock.showAppsButton.connect('button-release-event', () => Main.overview.showApps());
        this.dock_hover = this.dock._dashContainer.connect('notify::hover', this._on_dock_hover.bind(this));
        this.screen_border_box_hover = this.screen_border_box.connect('notify::hover', this._on_screen_border_box_hover.bind(this));
        this.workareas_changed = global.display.connect('workareas-changed', this._dock_refresh.bind(this));
        this.restacked = global.display.connect('restacked', this._hide_dock.bind(this));
        this.main_session_mode_updated = Main.sessionMode.connect('updated', this._dock_refresh.bind(this));
        this.overview_shown = Main.overview.connect('shown', this._on_overview_hide_dock.bind(this));
    }

    disable() {
        AppDisplay.AppIcon.prototype.activate = this.original_click_function;
        if (this.refresh_screen_border_box_timeout) {
            GLib.source_remove(this.refresh_screen_border_box_timeout);
        }
        if (this.show_dock_timeout) {
            GLib.source_remove(this.show_dock_timeout);
        }
        if (this.hide_dock_timeout) {
            GLib.source_remove(this.hide_dock_timeout);
        }
        if (this.auto_hide_dock_timeout) {
            GLib.source_remove(this.auto_hide_dock_timeout);
        }
        if (this.workareas_changed) {
            global.display.disconnect(this.workareas_changed);
        }
        if (this.restacked) {
            global.display.disconnect(this.restacked);
        }
        this.show_dock_timeout = null;
        this.hide_dock_timeout = null;
        this.auto_hide_dock_timeout = null;
        if (this.main_session_mode_updated) {
            Main.sessionMode.disconnect(this.main_session_mode_updated);
        }
        if (this.overview_shown) {
            Main.overview.disconnect(this.overview_shown);
        }
        Main.layoutManager.removeChrome(this.screen_border_box);
        Main.layoutManager.removeChrome(this.dock);
        this.screen_border_box.destroy();
        this.dock.destroy();
    }
}

function init() {
    return new Extension();
}
