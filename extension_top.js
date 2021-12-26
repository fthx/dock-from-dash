/* 
	Dock from Dash - GNOME Shell 40+ extension
	Copyright Francois Thirioux 2021, 2022
	GitHub contributors: @fthx
	Some ideas picked from GNOME Shell native code:
	https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/dash.js
	https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/overviewControls.js
	License GPL v3
*/

const { Clutter, GLib, GObject } = imports.gi;

const Main = imports.ui.main;
const Dash = imports.ui.dash;

var DASH_MAX_HEIGHT_RATIO = 0.15;
var DASH_OPACITY_RATIO = 0.9;
var SHOW_DOCK_DURATION = 200;
var HIDE_DOCK_DURATION = 200;
var SHOW_DOCK_DELAY = 120;
var HIDE_DOCK_DELAY = 400;


var Dock = GObject.registerClass(
class Dock extends Dash.Dash {
	_init() {
		super._init();
		Main.layoutManager.addTopChrome(this);
		this.showAppsButton.set_toggle_mode(false);
		this.set_track_hover(true);
		this.set_reactive(true);
		this.set_opacity(Math.round(DASH_OPACITY_RATIO * 255));
		this.show();
	}
});

class Extension {
    constructor() {
		if (Main.layoutManager.startInOverview) {Main.layoutManager.startInOverview = false;}
    }

	_dock_refresh() {
		if (!this.dock_refreshing) {
			this.dock_refreshing = true;
			this.work_area = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
			if (!this.work_area) {
				return;
			}
			this.max_dock_height = Math.round(this.work_area.height * DASH_MAX_HEIGHT_RATIO);
			this.dock.set_width(this.work_area.width);
			this.dock.set_height(Math.min(this.dock.get_preferred_height(this.work_area.width), this.max_dock_height));
			this.dock.setMaxSize(this.work_area.width, this.max_dock_height);
			this.dock_x_offset = Math.round((this.work_area.width - this.dock.width) / 2);
			this.dock.set_position(this.work_area.x + this.dock_x_offset, this.work_area.y - this.dock.height);
			this.dock.show();
			this._hide_dock();
			this.dock_refreshing = false;
		}
	}

	_show_apps() {
		if (Main.overview.visible) {
			Main.overview.hide();
		} else {
			Main.overview.showApps();
		}
	}

	_on_dock_hover() {
		if (this.dock.is_visible() && !this.dock.get_hover()) {
			this.hide_dock_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HIDE_DOCK_DELAY, () => {
				if (!this.dock.get_hover() && !Main.panel.get_hover()) {
					this._hide_dock();
				}
				this.hide_dock_timeout = null;
			});
		}
	}

	_on_panel_hover() {
		if (!Main.overview.visible && !Main.sessionMode.isLocked) {
			if (!global.display.get_focus_window() || !global.display.get_focus_window().is_fullscreen()) {
				this.show_dock_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SHOW_DOCK_DELAY, () => {
					if (Main.panel.get_hover()) {
						this._show_dock();
					}
					this.show_dock_timeout = null;
				});
			}
		}
	}

	_hide_dock() {
		this.dock.ease({
			duration: HIDE_DOCK_DURATION,
			translation_y: -this.dock.height,
			mode: Clutter.AnimationMode.EASE_OUT_QUAD,
			onComplete: () => {this.dock.hide();},
		});
	}

	_show_dock() {
		this.dock.show();
		this.dock.ease({
			duration: SHOW_DOCK_DURATION,
			translation_y: this.dock.height,
			mode: Clutter.AnimationMode.EASE_OUT_QUAD,
		});
	}

	_create_dock() {
		this.dock = new Dock();
		this._dock_refresh();
	}

	enable() {
		this._create_dock();
		Main.panel.set_track_hover(true);
		this.dock.showAppsButton.connect('button-release-event', this._show_apps.bind(this));
		this.dock_hover = this.dock.connect('notify::hover', this._on_dock_hover.bind(this));
		this.panel_hover = Main.panel.connect('notify::hover', this._on_panel_hover.bind(this));
		this.workareas_changed = global.display.connect('workareas-changed', this._dock_refresh.bind(this));
		this.main_session_mode_updated = Main.sessionMode.connect('updated', this._dock_refresh.bind(this));
        this.overview_showing = Main.overview.connect('showing', this._hide_dock.bind(this));
	}

    disable() {
		Main.panel.set_track_hover(false);
		if (this.show_dock_timeout) {GLib.source_remove(this.show_dock_timeout);}
		if (this.hide_dock_timeout) {GLib.source_remove(this.hide_dock_timeout);}
        if (this.panel_hover) {Main.panel.disconnect(this.panel_hover);}
		if (this.workareas_changed) {global.display.disconnect(this.workareas_changed);}
		if (this.main_session_mode_updated) {Main.sessionMode.disconnect(this.main_session_mode_updated);}
		if (this.overview_showing) {Main.overview.disconnect(this.overview_showing);}
		Main.layoutManager.removeChrome(this.dock);
		this.dock.destroy();
    }
}

function init() {
	return new Extension();
}
