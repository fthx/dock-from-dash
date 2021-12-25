/* 
	Dock from Dash - GNOME Shell 40+ extension
	Copyright Francois Thirioux 2021, 2022
	GitHub contributors: @fthx
	Some ideas picked from GNOME Shell native code:
	https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/dash.js
	https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/overviewControls.js
	License GPL v3
*/

const { Clutter, GLib, GObject, St } = imports.gi;

const Main = imports.ui.main;
const Dash = imports.ui.dash;

var DASH_MAX_HEIGHT_RATIO = 0.15;
var DASH_OPACITY_RATIO = 0.9;
var SHOW_DOCK_BOX_HEIGHT = 3;
var SHOW_DOCK_DURATION = 200;
var HIDE_DOCK_DURATION = 200;
var SHOW_DOCK_DELAY = 120;
var HIDE_DOCK_DELAY = 400;


var ScreenBorderBox = GObject.registerClass(
class ScreenBorderBox extends St.BoxLayout {
	_init() {
		super._init();
		Main.layoutManager.addTopChrome(this);
		this.set_track_hover(true);
		this.set_reactive(true);
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
		this.set_opacity(Math.round(DASH_OPACITY_RATIO * 255));
	}
});

class Extension {
    constructor() {
		if (Main.layoutManager.startInOverview) {Main.layoutManager.startInOverview = false;}
    }

	_dock_refresh() {
		this.monitor = Main.layoutManager.primaryMonitor;

        this.max_dock_height = Math.round(this.monitor.height * DASH_MAX_HEIGHT_RATIO);
        this.dock.setMaxSize(this.monitor.width, this.max_dock_height);
		this.dock.set_height(Math.min(this.dock.get_preferred_height(this.monitor.width), this.max_dock_height));
		this.dock_x_offset = Math.round((this.monitor.width - this.dock.width) / 2);
		this.dock.set_position(this.monitor.x + this.dock_x_offset, this.monitor.y + this.monitor.height);

		this.screen_border_box.set_size(this.monitor.width, SHOW_DOCK_BOX_HEIGHT);
		this.screen_border_box.set_position(this.monitor.x, this.monitor.y + this.monitor.height - SHOW_DOCK_BOX_HEIGHT);
	}

	_show_apps() {
		if (Main.overview.visible) {
			Main.overview.hide();
		} else {
			Main.overview.showApps();
		}
	}

	_on_dock_hover() {
		if (this.monitor) {
			if (this.dock.is_visible() && !this.dock.get_hover()) {
				this.hide_dock_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HIDE_DOCK_DELAY, () => {
					if (!this.dock.get_hover() && !this.screen_border_box.get_hover()) {
						this._hide_dock();
					}
				});
			}
		}
	}

	_on_screen_border_box_hover() {
		if (this.monitor) {
			if (!this.dock.is_visible() && !Main.overview.visible && !Main.sessionMode.isLocked) {
				if (!global.display.get_focus_window() || !global.display.get_focus_window().is_fullscreen()) {
					this.show_dock_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SHOW_DOCK_DELAY, () => {
						if (this.screen_border_box.get_hover()) {
							this._dock_refresh();
							this._show_dock();
						}
					});
				}
			}
		}
	}

	_hide_dock() {
		this.dock.ease({
			duration: HIDE_DOCK_DURATION,
			translation_y: this.dock._dashContainer.height,
			mode: Clutter.AnimationMode.EASE_OUT_QUAD,
			onComplete: () => {
				this.dock.hide();
			},
		});
	}

	_show_dock() {
		this.dock.show();
		this.dock.ease({
			duration: SHOW_DOCK_DURATION,
			translation_y: -this.dock._dashContainer.height,
			mode: Clutter.AnimationMode.EASE_OUT_QUAD,
		});
	}

	_create_dock() {
		this.dock = new Dock();
		this.screen_border_box = new ScreenBorderBox();
	}

	enable() {
		Main.layoutManager.connect('startup-complete', () => {
			this._create_dock();
			this._dock_refresh();
			this._show_dock();
			
			this.dock.showAppsButton.connect('button-release-event', this._show_apps.bind(this));
			this._dock_hover = this.dock.connect('notify::hover', this._on_dock_hover.bind(this));
			this._screen_border_box_hover = this.screen_border_box.connect('notify::hover', this._on_screen_border_box_hover.bind(this));
			this._workareas_changed = global.display.connect('workareas-changed', this._dock_refresh.bind(this));
			this._overview_showing = Main.overview.connect('showing', this._hide_dock.bind(this));
        });
	}

    disable() {
		if (this.show_dock_timeout) {GLib.source_remove(this.show_dock_timeout);}
		if (this.hide_dock_timeout) {GLib.source_remove(this.hide_dock_timeout);}
		if (this._workareas_changed) {global.display.disconnect(this._workareas_changed);}
		if (this._overview_showing) {Main.overview.disconnect(this._overview_showing);}
		
		Main.layoutManager.removeChrome(this.screen_border_box);
		Main.layoutManager.removeChrome(this.dock);
		this.screen_border_box.destroy();
		this.dock.destroy();
    }
}

function init() {
	return new Extension();
}
