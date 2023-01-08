/*
    Dock from Dash - GNOME Shell 40+ extension
    Copyright Francois Thirioux
    GitHub contributors: @fthx, @rastersoft, @underlinejakez, @lucaxvi, @subpop, @dgsasha
    Some ideas picked from GNOME Shell native code
    License GPL v3
*/

const { Clutter, GLib, GObject, Meta, Shell, St } = imports.gi;

const Main = imports.ui.main;
const Dash = imports.ui.dash;
const ExtensionUtils = imports.misc.extensionUtils;
const AppDisplay = imports.ui.appDisplay;
const WorkspaceManager = global.workspace_manager;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const AutoHide = Me.imports.auto_hide;

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
        this.window_overlap = false;
        this.hide_override = false;
        this.visible = true;
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

    _queueRedisplay() {
        if (Main._deferredWorkData[this._workId])
            Main.queueDeferredWork(this._workId);
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

    _on_dock_hover() {
        if ((this.hide_override || this.window_overlap) && !this._dashContainer.get_hover() && !this.keep_dock_shown) {
            this.auto_hide_dock_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, settings.get_int('autohide-delay'), () => {
                if (!this._dashContainer.get_hover()) {
                    this.auto_hide_dock_timeout = 0;
                    let should_animate = (!Main.overview.animationInProgress && !Main.overview.visible)
                    this._hide_dock(should_animate);
                }
            });
        }
    }

    _hide_dock(animate = true, callback) {
        if (this.dock_animated || !this.visible)
            return;

        if (!this.work_area)
            return;

        if (this.auto_hide_dock_timeout && this.auto_hide_dock_timeout !== 0)
            return;

        if (animate) {
            this.dock_animated = true;
            this.ease({
                duration: settings.get_int('hide-dock-duration'),
                y: this.work_area.y + this.work_area.height,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    this.dock_animated = false;
                    this.hide();
                    this.visible = false;
                    if (callback)
                        callback();
                },
            });
        } else {
            this.set_position(this.work_area.x, this.work_area.y + this.work_area.height);
            this.hide();
            this.visible = false;
        }
    }

    _show_dock(animate = true, callback) {
        if (this.dock_animated || this.visible)
            return;

        if (!this.work_area)
            return;

        if (animate) {
            this.show();
            this.dock_animated = true;
            this.ease({
                duration: settings.get_int('show-dock-duration'),
                y: this.work_area.y + this.work_area.height - this.get_height(),
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    this.dock_animated = false;
                    this.visible = true;
                    if (callback)
                        callback();
                },
            });
        } else {
            this.set_position(this.work_area.x, this.work_area.y + this.work_area.height - this.get_height());
            this.show();
            this.visible = true;
        }
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
            if (this.app.state == Shell.AppState.STOPPED || openNewWindow)
                this.animateLaunch();
            if (openNewWindow) {
                this.app.open_new_window(-1);
                Main.overview.hide();
            } else {
                let app_windows = this.app
                    .get_windows()
                    .filter(window => !window.is_override_redirect() && !window.is_attached_dialog())
                    .sort((w1, w2) => w1.get_id() - w2.get_id());

                switch (app_windows.length) {
                    case 0:
                        this.app.activate();
                        Main.overview.hide();
                    break;
                    case 1:
                        if (app_windows[0].has_focus() && app_windows[0].can_minimize()) {
                            app_windows[0].minimize();
                            Main.overview.hide();
                        } else {
                            if (!app_windows[0].has_focus()) {
                                app_windows[0].activate(global.get_current_time());
                                Main.overview.hide();
                            }
                        }
                    break;
                    default:
                        let app_has_focus = false;
                        let app_focused_window_index = 0;
                        for (var index = 0; index < app_windows.length; index++) {
                            if (app_windows[index].has_focus()) {
                                app_has_focus = true;
                                app_focused_window_index = index;
                            }
                        }

                        if (app_has_focus) {
                            let next_index = (app_focused_window_index + 1) % app_windows.length;
                            this.app.activate_window(app_windows[next_index], global.get_current_time());
                        } else {
                            this.app.activate();
                        }
                }
            }
        }
    }

    _dock_refresh() {
        if (this.dock_refreshing)
            return;
        this.dock_refreshing = true;

        this.dock.work_area = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        if (!this.dock.work_area)
            return;

        this.dock.max_dock_height = Math.round(this.dock.work_area.height * DASH_MAX_HEIGHT_RATIO / 100);
        this.dock.set_width(this.dock.work_area.width);
        this.dock.set_height(Math.min(this.dock.get_preferred_height(this.dock.work_area.width), this.dock.max_dock_height));
        this.dock.setMaxSize(this.dock.width, this.dock.max_dock_height);

        if (this.dock.visible)
            this.dock.set_position(this.dock.work_area.x, this.dock.work_area.y + this.dock.work_area.height - this.dock.get_height());
        else
            this.dock.set_position(this.dock.work_area.x, this.dock.work_area.y + this.dock.work_area.height);

        this._update_hide_override();
        this._screen_border_box_refresh();

        this.dock_refreshing = false;
    }

    _dock_refresh_visibility() {
        if (this.dock_refreshing_visibility)
            return;

        this.dock_refreshing_visibility = true;

        if (Main.layoutManager._startingUp || (Main.overview.visible && !Main.overview.animationInProgress))
            this.dock._hide_dock(false);
        else if ((this.dock.hide_override || this.dock.window_overlap) && !this.dock._dashContainer.get_hover())
            this.dock._hide_dock();
        else
            this.dock._show_dock();

        this.dock_refreshing_visibility = false;
    }

    _screen_border_box_refresh() {
        if (this.screen_border_box_refreshing || !this.dock.work_area)
            return;
        this.screen_border_box_refreshing = true;

        this.screen_border_box.set_size(this.dock._dashContainer.width, SHOW_DOCK_BOX_HEIGHT);
        this.screen_border_box_x = this.dock.work_area.x + Math.round((this.dock.work_area.width - this.dock._dashContainer.width) / 2);
        this.screen_border_box_y = this.dock.work_area.y + this.dock.work_area.height - SHOW_DOCK_BOX_HEIGHT;
        this.screen_border_box.set_position(this.screen_border_box_x, this.screen_border_box_y);

        this.screen_border_box_refreshing = false;
    }

    _update_dock_size_box() {
        if (!this.auto_hide_enabled || !this.dock.work_area)
            return;

        let dock_size_box = new Meta.Rectangle({
            x: this.dock.work_area.x + Math.round((this.dock.work_area.width - this.dock._background.width) / 2),
            y: this.dock.work_area.y + this.dock.work_area.height - this.dock.get_height(),
            width: this.dock._background.width,
            height: this.dock.get_height()
        });

        this.auto_hide.update_target_dock_size_box(dock_size_box);
    }

    _on_screen_border_box_hover() {
        if (this.dock.visible)
            return;

        if (!this.screen_border_box.get_hover()) {
            if (this.toggle_dock_hover_timeout) {
                GLib.source_remove(this.toggle_dock_hover_timeout);
                this.toggle_dock_hover_timeout = 0;
            }
            return;
        }

        if (this.dock.auto_hide_dock_timeout) {
            GLib.source_remove(this.dock.auto_hide_dock_timeout);
            this.dock.auto_hide_dock_timeout = 0;
        }

        if (!Main.overview.visible && !Main.sessionMode.isLocked) {
            if (this.toggle_dock_hover_timeout)
                return;
            this.toggle_dock_hover_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, settings.get_int('toggle-delay'), () => {
                if (settings.get_boolean('show-in-full-screen') || !global.display.get_focus_window() || !global.display.get_focus_window().is_fullscreen()) {
                    if (this.screen_border_box.get_hover())
                        this.dock._show_dock();
                }
                this.toggle_dock_hover_timeout = 0;
                return false;
            });
        }
    }

    _update_hide_override() {
        if (Main.overview.visible)
            return;

        let window = global.display.get_focus_window();
        let hide_maximized = (settings.get_int('hide') !== 0);

        let old_hide_override = this.dock.hide_override;

        if (!settings.get_boolean('always-show'))
            this.dock.hide_override = true;
        else if (window && hide_maximized && window.get_monitor() == Main.layoutManager.primaryIndex && window.maximized_vertically)
            this.dock.hide_override = true;
        else
            this.dock.hide_override = false;

        if (this.dock.hide_override !== old_hide_override || this.dock_refreshing)
            this._dock_refresh_visibility();
    }

    _on_overlap_update() {
        if (!this.auto_hide_enabled)
            return;

        if (this._on_overlap_updating)
            return;

        this._on_overlap_updating = true;

        this.dock.window_overlap = this.auto_hide.get_status();

        if (this.dock.window_overlap)
            this.dock._hide_dock(true, () => {
                // prevent dock from getting stuck if window is moved out of the way quickly
                if (!this.auto_hide.get_status()) {
                    this.dock.window_overlap = this.auto_hide.get_status();
                    this.dock._show_dock();
                }
            });
        else
            this._dock_refresh_visibility();

        this._on_overlap_updating = false;
    }

    _on_overview_shown() {
        this.dock._hide_dock(false);
        this.screen_border_box.hide();
    }

    _on_overview_hiding() {
        if ((!this.dock.hide_override && !this.dock.window_overlap) || this.dock._dashContainer.get_hover())
            this.dock._show_dock(false);
        this.screen_border_box.show();
    }

    _on_hide_changed() {
        this.auto_hide_enabled = (settings.get_boolean('always-show') && settings.get_int('hide') == 2);

        if (this.auto_hide.enabled && !this.auto_hide_enabled) {
            this.auto_hide.disable();
            this.dock.window_overlap = false;
        } else if (!this.auto_hide.enabled && this.auto_hide_enabled)
            this._enable_auto_hide();
        
        this._dock_refresh();
    }

    _on_background_opacity_changed() {
        this.dock._background.set_opacity(Math.round(settings.get_int('background-opacity') / 100 * 255));
    }

    _on_icons_opacity_changed() {
        this.dock.set_opacity(Math.round(settings.get_int('icons-opacity') / 100 * 255));
    }

    _create_dock() {
        this.dock = new Dock();
        this.screen_border_box = new ScreenBorderBox();

        this.auto_hide = new AutoHide.AutoHide();

        this.dock._box.connect('notify::position', this._screen_border_box_refresh.bind(this));
        this.dock._box.connect('notify::size', this._screen_border_box_refresh.bind(this));
        this.dock._background.connect('notify::size', this._update_dock_size_box.bind(this));
        this._dock_refresh();

        this.screen_border_box.connect('notify::hover', this._on_screen_border_box_hover.bind(this));
        this.dock._dashContainer.connect('notify::hover', this.dock._on_dock_hover.bind(this.dock));
        this.screen_border_box.connect('scroll-event', this.dock._on_dock_scroll.bind(this.dock));
        this.dock._dashContainer.connect('scroll-event', this.dock._on_dock_scroll.bind(this.dock));
        this.dock.showAppsButton.connect('button-release-event', () => Main.overview.showApps());

        this.overview_shown = Main.overview.connect('shown', this._on_overview_shown.bind(this));
        this.overview_hiding = Main.overview.connect('hiding', this._on_overview_hiding.bind(this));

        this.monitors_changed = Main.layoutManager.connect('monitors-changed', this._dock_refresh.bind(this));
        this.workareas_changed = global.display.connect_after('workareas-changed', this._dock_refresh.bind(this));
        this.window_created = global.display.connect_after('window-created', this._update_hide_override.bind(this));
        this.restacked = global.display.connect_after('restacked', this._update_hide_override.bind(this));
        this.size_changed = global.window_manager.connect_after('size-changed', this._update_hide_override.bind(this));
    }

    _enable_auto_hide() {
        this._update_dock_size_box();

        this.status_changed = this.auto_hide.connect('status-changed', this._on_overlap_update.bind(this));

        this.auto_hide.enable();
    }

    enable() {
        settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.dock-from-dash')
        this.always_show_setting_changed = settings.connect('changed::always-show', this._on_hide_changed.bind(this));
        this.hide_setting_changed = settings.connect('changed::hide', this._on_hide_changed.bind(this));
        this.background_opacity_changed = settings.connect('changed::background-opacity', this._on_background_opacity_changed.bind(this));
        this.icons_opacity_changed = settings.connect('changed::icons-opacity', this._on_icons_opacity_changed.bind(this));

        this._modify_native_click_behavior();
        this._create_dock();

        this.auto_hide_enabled = (settings.get_boolean('always-show') && settings.get_int('hide') == 2);

        if (this.auto_hide_enabled)
            this._enable_auto_hide();

        this.startup_complete = Main.layoutManager.connect('startup-complete', () => {
            // show the dock once after startup so it can be used, and then hide it immediately if overview is visible
            this.dock._show_dock(false);
            if (Main.overview.visible || !settings.get_boolean('always-show'))
                this.dock._hide_dock(false);
    
            // initially set the dock height equal to dash height
            this.dock.set_height(Main.overview._overview._controls.dash.get_height());

            if (!settings.get_boolean('show-overview'))
                Main.overview.hide();
        });
    }

    disable() {
        AppDisplay.AppIcon.prototype.activate = this.original_click_function;

        if (this.always_show_setting_changed) {
            settings.disconnect(this.always_show_setting_changed);
            this.always_show_setting_changed = null;
        }
        if (this.hide_setting_changed) {
            settings.disconnect(this.hide_setting_changed);
            this.hide_setting_changed = null;
        }
        if (this.background_opacity_changed) {
            settings.disconnect(this.background_opacity_changed);
            this.background_opacity_changed = null;
        }
        if (this.icons_opacity_changed) {
            settings.disconnect(this.icons_opacity_changed);
            this.icons_opacity_changed = null;
        }
        if (this.overview_shown) {
            Main.overview.disconnect(this.overview_shown);
            this.overview_shown = null;
        }
        if (this.overview_hiding) {
            Main.overview.disconnect(this.overview_hiding);
            this.overview_hiding = null;
        }
        if (this.toggle_dock_hover_timeout) {
            GLib.source_remove(this.toggle_dock_hover_timeout);
            this.toggle_dock_hover_timeout = 0;
        }
        if (this.dock.auto_hide_dock_timeout) {
            GLib.source_remove(this.dock.auto_hide_dock_timeout);
            this.dock.auto_hide_dock_timeout = 0;
        }
        if (this.workareas_changed) {
            global.display.disconnect(this.workareas_changed);
            this.workareas_changed = null;
        }
        if (this.monitors_changed) {
            Main.layoutManager.disconnect(this.monitors_changed);
            this.monitors_changed = null;
        }
        if (this.window_created) {
            global.display.disconnect(this.window_created);
            this.window_created = null;
        }
        if (this.restacked) {
            global.display.disconnect(this.restacked);
            this.restacked = null;
        }
        if (this.size_changed) {
            global.window_manager.disconnect(this.size_changed);
            this.size_changed = null;
        }
        if (this.startup_complete) {
            Main.layoutManager.disconnect(this.startup_complete);
            this.startup_complete = null;
        }
        if (this.status_changed) {
            this.auto_hide.disconnect(this.status_changed);
            this.status_changed = null;
        }
        Main.layoutManager.removeChrome(this.screen_border_box);
        this.screen_border_box.destroy();

        this.auto_hide.disable();
        this.auto_hide = null;

        Main.layoutManager.removeChrome(this.dock);
        this.dock._box.destroy();
        this.dock.destroy();
        this.dock = null;

        settings = null;
    }
}

function init() {
    return new Extension();
}
