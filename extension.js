/*
    Dock from Dash - GNOME Shell 40+ extension
    Copyright Francois Thirioux
    GitHub contributors: @fthx, @rastersoft
    Some ideas picked from GNOME Shell native code
    License GPL v3
*/

const { Clutter, GLib, GObject, Meta, Shell, St } = imports.gi;

const Main = imports.ui.main;
const Dash = imports.ui.dash;
const ExtensionUtils = imports.misc.extensionUtils;
const AppDisplay = imports.ui.appDisplay;
const WorkspaceManager = global.workspace_manager;

var DASH_MAX_HEIGHT_RATIO = 15;
var SHOW_DOCK_BOX_HEIGHT = 2;

var settings;


var ScreenBorderBox = GObject.registerClass(
class ScreenBorderBox extends St.BoxLayout {
    _init() {
        super._init();
        Main.layoutManager.addChrome(this);
        this.set_reactive(true);
        this.set_track_hover(true);
        this.show();
    }
});

var Dock = GObject.registerClass(
class Dock extends Dash.Dash {
    _init() {
        super._init();
        Main.layoutManager.addTopChrome(this);
        this.showAppsButton.set_toggle_mode(false);
        this.set_opacity(Math.round(settings.get_int('icons-opacity') / 100 * 255));
        this._background.set_opacity(Math.round(settings.get_int('background-opacity') / 100 * 255));
        this._dashContainer.set_track_hover(true);
        this._dashContainer.set_reactive(true);
        this.show();
        this.dock_animated = false;
        this.keep_dock_shown = false;
    }

    _itemMenuStateChanged(item, opened) {
        if (opened) {
            if (this._showLabelTimeoutId > 0) {
                GLib.source_remove(this._showLabelTimeoutId);
                this._showLabelTimeoutId = 0;
            }
            item.hideLabel();

            this._last_appicon_with_menu = item;
            this.keep_dock_shown = true;
        } else {
            if (item == this._last_appicon_with_menu) {
                this._last_appicon_with_menu = null;
                this.keep_dock_shown = false
            }
        }

        this._on_dock_hover();
    }

    _on_dock_hover() {
        if (!settings.get_boolean('always-show') && !this._dashContainer.get_hover() && !this.keep_dock_shown) {
            this.auto_hide_dock_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, settings.get_int('autohide-delay'), () => {
                if (!this._dashContainer.get_hover()) {
                    this._hide_dock();
                    this.auto_hide_dock_timeout = null;
                }
            });
        }
    }

    _on_dock_scroll(origin, event) {
        this.active_workspace = WorkspaceManager.get_active_workspace();
        switch(event.get_scroll_direction()) {
            case Clutter.ScrollDirection.DOWN:
            case Clutter.ScrollDirection.RIGHT:
                this.active_workspace.get_neighbor(Meta.MotionDirection.RIGHT).activate(event.get_time());
                break;
            case Clutter.ScrollDirection.UP:
            case Clutter.ScrollDirection.LEFT:
                this.active_workspace.get_neighbor(Meta.MotionDirection.LEFT).activate(event.get_time());
                break;
        }
    }

    _on_overview_shown() {
        if (settings.get_boolean('always-show') || this.dock_animated || !this.is_visible()) {
            return;
        }

        this.dock_animated = true;
        this.hide();
        this.ease({
            duration: 0,
            translation_y: this.height,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.dock_animated = false;
            },
        });
    }

    _hide_dock() {
        if (this.dock_animated || !this.is_visible()) {
            return;
        }

        this.dock_animated = true;
        this.ease({
            duration: settings.get_int('hide-dock-duration'),
            translation_y: this.height,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.dock_animated = false;
                this.hide();
            },
        });
    }

    _show_dock() {
        if (this.dock_animated || this.is_visible()) {
            return;
        }

        this.show();
        this.dock_animated = true;
        this.ease({
            duration: settings.get_int('show-dock-duration'),
            translation_y: -this.height,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.dock_animated = false;
            },
        });
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

        let workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        if (!workArea) {
            return;
        }
        this._current_workarea_data.x = workArea.x;
        this._current_workarea_data.y = workArea.y;
        this._current_workarea_data.width = workArea.width;
        this._current_workarea_data.height = workArea.height;

        this.max_dock_height = Math.round(this._current_workarea_data.height * DASH_MAX_HEIGHT_RATIO);
        this.dock.set_width(this._current_workarea_data.width);
        this.dock.set_height(Math.min(this.dock.get_preferred_height(this._current_workarea_data.width), this.max_dock_height));
        this.dock.setMaxSize(this.dock.width, this.max_dock_height);
        this.dock.set_position(this._current_workarea_data.x, this._current_workarea_data.y + this._current_workarea_data.height);

        this.dock.show();
        if (!this.dock._dashContainer.get_hover()) {
            this.dock._hide_dock();
        }
        if (this.show_dock_at_startup_timeout) {
            GLib.source_remove(this.show_dock_at_startup_timeout);
        }
        this.show_dock_at_startup_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            this.dock._show_dock();
            this.show_dock_at_startup_timeout = null;
            return false;
        });

        if (this.refresh_screen_border_box_timeout) {
            GLib.source_remove(this.refresh_screen_border_box_timeout);
        }
        this.refresh_screen_border_box_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            this._screen_border_box_refresh();
            this.refresh_screen_border_box_timeout = null;
            return false;
        });

        this.dock_refreshing = false;
    }

    _screen_border_box_refresh() {
        this.screen_border_box.set_size(this.dock._dashContainer.width, SHOW_DOCK_BOX_HEIGHT);
        this.screen_border_box_x = this._current_workarea_data.x + Math.round((this._current_workarea_data.width - this.dock._dashContainer.width) / 2);
        this.screen_border_box_y = this._current_workarea_data.y + this._current_workarea_data.height - SHOW_DOCK_BOX_HEIGHT;
        this.screen_border_box.set_position(this.screen_border_box_x, this.screen_border_box_y);
    }

    _on_screen_border_box_hover() {
        if (!this.screen_border_box.get_hover()) {
            if (this.toggle_dock_hover_timeout) {
                GLib.source_remove(this.dock.auto_hide_dock_timeout);
                this.toggle_dock_hover_timeout = null;
            }
            return;
        }

        if (this.dock.auto_hide_dock_timeout) {
            this.dock.auto_hide_dock_timeout = null;
            GLib.source_remove(this.dock.auto_hide_dock_timeout);
        }

        if (!Main.overview.visible && !Main.sessionMode.isLocked) {
            if (this.toggle_dock_hover_timeout) {
                return;
            }
            this.toggle_dock_hover_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, settings.get_int('toggle-delay'), () => {
                if (settings.get_boolean('show-in-full-screen') || !global.display.get_focus_window() || !global.display.get_focus_window().is_fullscreen()) {
                    if (this.screen_border_box.get_hover() && !this.dock.is_visible()) {
                        this.dock._show_dock();
                    }
                }
                this.toggle_dock_hover_timeout = null;
                return false;
            });
        }
    }

    _on_settings_changed() {
        this.dock._background.set_opacity(Math.round(settings.get_int('background-opacity') / 100 * 255));
        this.dock.set_opacity(Math.round(settings.get_int('icons-opacity') / 100 * 255));
        if (settings.get_boolean('always-show')) {
            this.dock._show_dock();
        } else {
            this.dock._hide_dock();
        }
    }

    _create_dock() {
        this.dock = new Dock();
        this.screen_border_box = new ScreenBorderBox();
        this._dock_refresh();
        this.screen_border_box.connect('notify::hover', this._on_screen_border_box_hover.bind(this));
        this.dock._dashContainer.connect('notify::hover', this.dock._on_dock_hover.bind(this.dock));
        this.screen_border_box.connect('scroll-event', this.dock._on_dock_scroll.bind(this.dock));
        this.dock._dashContainer.connect('scroll-event', this.dock._on_dock_scroll.bind(this.dock));
    }

    enable() {
        this._current_workarea_data = {x:0, y:0, width:0, height:0};
        settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.dock-from-dash')
        this.settings_changed = settings.connect('changed', this._on_settings_changed.bind(this));

        this._modify_native_click_behavior();
        this._create_dock();
        this._startupLayoutCompleteId = Main.layoutManager.connect('startup-complete', () => {
            Main.overview.hide();
            Main.layoutManager.disconnect(this._startupLayoutCompleteId);
            this._startupLayoutCompleteId = 0;
        });

        this.dock.showAppsButton.connect('button-release-event', () => Main.overview.showApps());
        this.workareas_changed = global.display.connect('workareas-changed', () => {
            let workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
            if (!workArea) {
                return;
            }
            if ((workArea.x == this._current_workarea_data.x) &&
                (workArea.y == this._current_workarea_data.y) &&
                (workArea.width == this._current_workarea_data.width) &&
                (workArea.height == this._current_workarea_data.height)) {
                    return;
                }
            this._dock_refresh();
        });
        this.overview_shown = Main.overview.connect('shown', this.dock._on_overview_shown.bind(this.dock));
    }

    disable() {
        AppDisplay.AppIcon.prototype.activate = this.original_click_function;

        settings.disconnect(this.settings_changed);

        if (this.toggle_dock_hover_timeout) {
            this.toggle_dock_hover_timeout = null;
            GLib.source_remove(this.toggle_dock_hover_timeout);
        }
        if (this.refresh_screen_border_box_timeout) {
            this.refresh_screen_border_box_timeout = null;
            GLib.source_remove(this.refresh_screen_border_box_timeout);
        }
        if (this.dock.auto_hide_dock_timeout) {
            this.dock.auto_hide_dock_timeout = null;
            GLib.source_remove(this.dock.auto_hide_dock_timeout);
        }
        if (this.show_dock_at_startup_timeout) {
            this.show_dock_at_startup_timeout = null;
            GLib.source_remove(this.show_dock_at_startup_timeout);
        }

        if (this.workareas_changed) {
            global.display.disconnect(this.workareas_changed);
            this.workareas_changed = null;
        }
        if (this.overview_shown) {
            Main.overview.disconnect(this.overview_shown);
            this.overview_shown = null;
        }
        if (this._startupLayoutCompleteId) {
            Main.layoutManager.disconnect(this._startupLayoutCompleteId);
            this._startupLayoutCompleteId = 0;
        }

        Main.layoutManager.removeChrome(this.screen_border_box);
        Main.layoutManager.removeChrome(this.dock);
        this.screen_border_box.destroy();
        this.dock.destroy();
        settings = null;
    }
}

function init() {
    return new Extension();
}
