/*
    Dock from Dash - Auto Hide
    Based on https://github.com/micheleg/dash-to-dock/blob/master/intellihide.js
    GitHub contributors: @dgsasha
    License GPL v3
*/

const { GLib, Meta, Shell } = imports.gi;

const Main = imports.ui.main;
const Signals = imports.signals;

const overlap_status = {
    UNDEFINED: -1,
    FALSE: 0,
    TRUE: 1
};

const AUTO_HIDE_CHECK_INTERVAL = 100;

var AutoHide = class AutoHide {
    constructor() {
        this._status = overlap_status.UNDEFINED;
        this._window_list = new Map();
        this._tracker = Shell.WindowTracker.get_default();
        this.dock_size_box = null;
        this._check_overlap_timeout_continue = false;
        this._check_overlap_timeout_id = 0;
        this.enabled = false;
    }

    _check_overlap() {
        /* Limit the number of calls to the _do_check_overlap function */
        if (this._check_overlap_timeout_id) {
            this._check_overlap_timeout_continue = true;
            return
        }

        this._do_check_overlap();

        this._check_overlap_timeout_id = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, AUTO_HIDE_CHECK_INTERVAL, () => {
            this._do_check_overlap();
            if (this._check_overlap_timeout_continue) {
                this._check_overlap_timeout_continue = false;
                return GLib.SOURCE_CONTINUE;
            } else {
                this._check_overlap_timeout_id = 0;
                return GLib.SOURCE_REMOVE;
            }
        });
    }

    _do_check_overlap() {
        if (this.dock_size_box == null)
            return;

        let overlaps = overlap_status.FALSE;
        let window = global.display.get_focus_window();

        if (window) {
            if (window.maximized_vertically)
                return;

            let dock_rect = this.dock_size_box;
            let window_rect = window.get_frame_rect();

            let test = window_rect.overlap(dock_rect)

            if (test)
                overlaps = overlap_status.TRUE;
        }
        if (this._status !== overlaps) {
            this._status = overlaps;
            this.emit('status-changed', this._status);
        }
    }

    _add_signals(window) {
        let signal_id = window.connect('notify::allocation', this._check_overlap.bind(this));
        this._window_list.set(window, signal_id);
        window.connect('destroy', this._remove_signals.bind(this));
    }

    _remove_signals(window) {
        if (this._window_list.get(window)) {
            window.disconnect(this._window_list.get(window));
            this._window_list.delete(window);
        }
    }

    _window_created(display, meta_window) {
        this._add_signals(meta_window.get_compositor_private());
    }

    get_status() {
        return (this._status == overlap_status.TRUE);
    }

    update_target_dock_size_box(dock_size_box) {
        this.dock_size_box = dock_size_box;
    }

    enable() {
        this.enabled = true;
        this.restacked = global.display.connect_after('restacked', this._check_overlap.bind(this));
        this.focus = this._tracker.connect('notify::focus-app', this._check_overlap.bind(this));
        this.window_created = global.display.connect('window-created', this._window_created.bind(this));
        this.monitors_changed = Main.layoutManager.connect('monitors-changed', this._check_overlap.bind(this));
        this._status = overlap_status.UNDEFINED;
        global.get_window_actors().forEach(function(window) {
            this._add_signals(window);
        }, this);
        this._do_check_overlap();
    }

    disable() {
        if (this.window_created) {
            global.display.disconnect(this.window_created);
            this.window_created = null;
        }
        if (this.restacked) {
            global.display.disconnect(this.restacked);
            this.restacked = null;
        }
        if (this.focus) {
            this._tracker.disconnect(this.focus);
            this.focus = null;
        }
        if (this.monitors_changed) {
            Main.layoutManager.disconnect(this.monitors_changed);
            this.monitors_changed = null;
        }

        for (let window of this._window_list.keys()) {
            this._remove_signals(window);
        }

        this._window_list.clear();
        this.enabled = false;

        if (this._check_overlap_timeout_id > 0) {
            GLib.source_remove(this._check_overlap_timeout_id);
            this._check_overlap_timeout_id = 0;
        }
    }
};

Signals.addSignalMethods(AutoHide.prototype);