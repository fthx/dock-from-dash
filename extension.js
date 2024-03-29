/*
    Dock from Dash - GNOME Shell 45+ extension
    Copyright Francois Thirioux 2024
    GitHub contributors: @fthx, @rastersoft, @underlinejakez, @lucaxvi, @subpop
    Some ideas picked from GNOME Shell native code
    Bottom edge code adapted from @jdoda's Hot Edge extension
    License GPL v3
*/


import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js'
import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';
import * as AppDisplay from 'resource:///org/gnome/shell/ui/appDisplay.js';


// Dock settings
const DASH_MAX_HEIGHT_RATIO = 15; // %
const AUTO_HIDE_DELAY = 300; // ms
const SHOWING_ANIMATION_DURATION = 200; // ms
const HIDING_ANIMATION_DURATION = 200; // ms
const SHOW_OVERVIEW_AT_STARTUP = false;

// Bottom edge settings
const HOT_EDGE_PRESSURE_TIMEOUT = 1000; // ms
const PRESSURE_TRESHOLD = 150;


const BottomDock = GObject.registerClass({
    Signals: {'toggle-dash': {}},
}, class BottomDock extends Clutter.Actor {
    _init(layoutManager, monitor, x, y) {
        super._init();

        this._monitor = monitor;
        this._x = x;
        this._y = y;
        this._pressure_threshold = PRESSURE_TRESHOLD;

        this._pressure_barrier = new Layout.PressureBarrier(this._pressure_threshold,
                                                    HOT_EDGE_PRESSURE_TIMEOUT,
                                                    Shell.ActionMode.NORMAL |
                                                    Shell.ActionMode.OVERVIEW);
        this._pressure_barrier.connect('trigger', this._toggle_dock.bind(this));

        this.connect('destroy', this._on_destroy.bind(this));
    }

    setBarrierSize(size) {
        if (this._barrier) {
            this._pressure_barrier.removeBarrier(this._barrier);
            this._barrier.destroy();
            this._barrier = null;
        }

        if (size > 0) {
            size = this._monitor.width;
            let x_offset = (this._monitor.width - size) / 2;
            this._barrier = new Meta.Barrier({backend: global.backend,
                                                x1: this._x + x_offset, x2: this._x + x_offset + size,
                                                y1: this._y, y2: this._y,
                                                directions: Meta.BarrierDirection.NEGATIVE_Y});
            this._pressure_barrier.addBarrier(this._barrier);
        }
    }

    _on_destroy() {
        this.setBarrierSize(0);

        this._pressure_barrier.destroy();
        this._pressure_barrier = null;
    }

    _toggle_dock() {
        if (Main.overview.shouldToggleByCornerOrButton()) {
            this.emit('toggle-dash');
        }
    }
});

const Dock = GObject.registerClass(
class Dock extends Dash.Dash {
    _init() {
        super._init();

        Main.layoutManager.addTopChrome(this);

        this.showAppsButton.set_toggle_mode(false);
        this._dashContainer.set_track_hover(true);
        this._dashContainer.set_reactive(true);
        this.show();

        this._dock_animated = false;
        this._keep_dock_shown = false;
        this._dragging;
    }

    _itemMenuStateChanged(item, opened) {
        if (opened) {
            if (this._showLabelTimeoutId > 0) {
                GLib.source_remove(this._showLabelTimeoutId);
                this._showLabelTimeoutId = 0;
            }
            item.hideLabel();

            this._last_appicon_with_menu = item;
            this._keep_dock_shown = true;
        } else {
            if (item == this._last_appicon_with_menu) {
                this._last_appicon_with_menu = null;
                this._keep_dock_shown = false
            }
        }

        this._on_dock_hover();
    }

    _on_dock_scroll(origin, event) {
        this._active_workspace = global.workspace_manager.get_active_workspace();
        switch(event.get_scroll_direction()) {
            case Clutter.ScrollDirection.DOWN:
            case Clutter.ScrollDirection.RIGHT:
                this._active_workspace.get_neighbor(Meta.MotionDirection.RIGHT).activate(event.get_time());
                break;
            case Clutter.ScrollDirection.UP:
            case Clutter.ScrollDirection.LEFT:
                this._active_workspace.get_neighbor(Meta.MotionDirection.LEFT).activate(event.get_time());
                break;
        }
    }

    _on_dock_hover() {
        if (!this._dashContainer.get_hover() && !this._keep_dock_shown) {
            this._auto_hide_dock_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, AUTO_HIDE_DELAY, () => {
                if (!this._dashContainer.get_hover()) {
                    this._hide_dock();
                    this._auto_hide_dock_timeout = 0;
                }
            });
        }
    }

    _ensure_auto_hide_dock() {
        if (!this._dashContainer.get_hover() && !this._keep_dock_shown) {
            this._ensure_auto_hide_dock_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3 * AUTO_HIDE_DELAY, () => {
                if (!this._dashContainer.get_hover() && (this._auto_hide_dock_timeout == 0)) {
                    this._hide_dock();
                    this._ensure_auto_hide_dock_timeout = 0;
                }
            });
        }
    }

    _hide_dock() {
        if (this._dock_animated || !this.work_area || this._dragging) {
            return;
        }

        this._dock_animated = true;
        this.ease({
            duration: HIDING_ANIMATION_DURATION,
            y: this.work_area.y + this.work_area.height,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._dock_animated = false;
                this.hide();
            },
        });
    }

    _show_dock() {
        if (this._dock_animated || !this.work_area) {
            return;
        }

        this.show();
        this._dock_animated = true;
        this.ease({
            duration: SHOWING_ANIMATION_DURATION,
            y: this.work_area.y + this.work_area.height - this.height,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._dock_animated = false;
            },
        });
    }
});

export default class DockFromDashExtension {
    constructor() {
        this._edge_handler_id = null;
    }

    _update_hot_edges() {
        for (let i = 0; i < Main.layoutManager.monitors.length; i++) {
            let monitor = Main.layoutManager.monitors[i];
            let leftX = monitor.x;
            let rightX = monitor.x + monitor.width;
            let bottomY = monitor.y + monitor.height;
            let size = monitor.width;

            let haveBottom = true;
            for (let j = 0; j < Main.layoutManager.monitors.length; j++) {
                if (j != i) {
                    let otherMonitor = Main.layoutManager.monitors[j];
                    let otherLeftX = otherMonitor.x;
                    let otherRightX = otherMonitor.x + otherMonitor.width;
                    let otherTopY = otherMonitor.y;
                    if (otherTopY >= bottomY && otherLeftX < rightX && otherRightX > leftX) {
                        haveBottom = false;
                    }
                }
            }

            if (haveBottom) {
                let edge = new BottomDock(Main.layoutManager, monitor, leftX, bottomY);
                edge.connect('toggle-dash', this._toggle_dock.bind(this));
                edge.connect('toggle-dash', this._dock._ensure_auto_hide_dock.bind(this._dock));
                edge.setBarrierSize(size);
                Main.layoutManager.hotCorners.push(edge);
            } else {
                Main.layoutManager.hotCorners.push(null);
            }
        }
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
                let app_windows = this.app
                    .get_windows()
                    .filter(window => !window.is_override_redirect() && !window.is_attached_dialog() && window.located_on_workspace(global.workspace_manager.get_active_workspace()))
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
        if (this._dock_refreshing) {
            return;
        }
        this._dock_refreshing = true;

        this._dock.work_area = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        if (!this._dock.work_area) {
            return;
        }

        this._dock.max_dock_height = Math.round(this._dock.work_area.height * DASH_MAX_HEIGHT_RATIO / 100);
        this._dock.set_width(this._dock.work_area.width);
        this._dock.set_height(Math.min(this._dock.get_preferred_height(this._dock.work_area.width), this._dock.max_dock_height));
        this._dock.setMaxSize(this._dock.width, this._dock.max_dock_height);

        if (this._dock.is_visible()) {
            this._dock.set_position(this._dock.work_area.x, this._dock.work_area.y + this._dock.work_area.height - this._dock.height);
        } else {
            this._dock.set_position(this._dock.work_area.x, this._dock.work_area.y + this._dock.work_area.height);
        }

        this._dock.show();
        if (!this._dock._dashContainer.get_hover()) {
            this._dock._hide_dock();
        }

        this._dock_refreshing = false;
    }

    _toggle_dock() {
        if (Main.overview.visible) {
            return;
        }

        if (this._dock.is_visible()) {
            this._dock._hide_dock();
        } else {
            this._dock._show_dock();
        }
    }

    _create_dock() {
        this._dock = new Dock();

        this._dock_refresh();

        this._dock._dashContainer.connectObject('notify::hover', this._dock._on_dock_hover.bind(this._dock), this);
        this._dock._dashContainer.connectObject('scroll-event', this._dock._on_dock_scroll.bind(this._dock), this);
        this._dock.showAppsButton.connectObject('button-release-event', () => Main.overview.showApps(), this);

        Main.overview.connectObject('item-drag-begin', () => {this._dock._dragging = true;}, this);
        Main.overview.connectObject('item-drag-end', () => {this._dock._dragging = false;}, this);

        Main.overview.connectObject('shown', () => this._dock.hide(), this);

        global.display.connectObject('workareas-changed', this._dock_refresh.bind(this), this);
    }

    enable() {
        this._modify_native_click_behavior();
        this._create_dock();

        Main.layoutManager.connectObject('hot-corners-changed', this._update_hot_edges.bind(this), this);
        Main.layoutManager._updateHotCorners();

        Main.layoutManager.connectObject('startup-complete', () => {
                if (!SHOW_OVERVIEW_AT_STARTUP) {
                    Main.overview.hide();
                }
            },
            this);
    }

    disable() {
        AppDisplay.AppIcon.prototype.activate = this.original_click_function;

        Main.overview.disconnectObject(this);
        this._dock._dashContainer.disconnectObject(this);
        this._dock.showAppsButton.disconnectObject(this);
        global.display.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);

        if (this._dock._auto_hide_dock_timeout) {
            GLib.source_remove(this._dock._auto_hide_dock_timeout);
            this._dock._auto_hide_dock_timeout = 0;
        }

        this._dock._show_dock();

        this._dock.destroy();
        this._dock = null;

        Main.layoutManager._updateHotCorners();
    }
}
