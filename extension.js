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
const AppFavorites = imports.ui.appFavorites;
const Layout = imports.ui.layout;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const AutoHide = Me.imports.auto_hide;
const DesktopIconsIntegration = Me.imports.desktopIconsIntegration;

const IGNORED_APPS = [ 'com.rastersoft.ding', 'com.desktop.ding' ];

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

    _redisplay() {
        let favorites = AppFavorites.getAppFavorites().getFavoriteMap();

        let running = this._appSystem.get_running();

        let children = this._box.get_children().filter(actor => {
            return actor.child &&
                   actor.child._delegate &&
                   actor.child._delegate.app;
        });
        // Apps currently in the dash
        let oldApps = children.map(actor => actor.child._delegate.app);
        // Apps supposed to be in the dash
        let newApps = [];

        for (let id in favorites)
            newApps.push(favorites[id]);

        for (let i = 0; i < running.length; i++) {
            let app = running[i];
            if (app.get_id() in favorites)
                continue;
            newApps.push(app);
        }

        // Figure out the actual changes to the list of items; we iterate
        // over both the list of items currently in the dash and the list
        // of items expected there, and collect additions and removals.
        // Moves are both an addition and a removal, where the order of
        // the operations depends on whether we encounter the position
        // where the item has been added first or the one from where it
        // was removed.
        // There is an assumption that only one item is moved at a given
        // time; when moving several items at once, everything will still
        // end up at the right position, but there might be additional
        // additions/removals (e.g. it might remove all the launchers
        // and add them back in the new order even if a smaller set of
        // additions and removals is possible).
        // If above assumptions turns out to be a problem, we might need
        // to use a more sophisticated algorithm, e.g. Longest Common
        // Subsequence as used by diff.
        let addedItems = [];
        let removedActors = [];

        let newIndex = 0;
        let oldIndex = 0;
        while (newIndex < newApps.length || oldIndex < oldApps.length) {
            let oldApp = oldApps.length > oldIndex ? oldApps[oldIndex] : null;
            let newApp = newApps.length > newIndex ? newApps[newIndex] : null;

            // No change at oldIndex/newIndex
            if (oldApp == newApp) {
                oldIndex++;
                newIndex++;
                continue;
            }

            // App removed at oldIndex
            if (oldApp && !newApps.includes(oldApp)) {
                removedActors.push(children[oldIndex]);
                oldIndex++;
                continue;
            }

            // App added at newIndex
            if (newApp && !oldApps.includes(newApp)) {
                addedItems.push({
                    app: newApp,
                    item: this._createAppItem(newApp),
                    pos: newIndex,
                });
                newIndex++;
                continue;
            }

            // App moved
            let nextApp = newApps.length > newIndex + 1
                ? newApps[newIndex + 1] : null;
            let insertHere = nextApp && nextApp == oldApp;
            let alreadyRemoved = removedActors.reduce((result, actor) => {
                let removedApp = actor.child._delegate.app;
                return result || removedApp == newApp;
            }, false);

            if (insertHere || alreadyRemoved) {
                let newItem = this._createAppItem(newApp);
                addedItems.push({
                    app: newApp,
                    item: newItem,
                    pos: newIndex + removedActors.length,
                });
                newIndex++;
            } else {
                removedActors.push(children[oldIndex]);
                oldIndex++;
            }
        }

        for (let i = 0; i < addedItems.length; i++) {
            this._box.insert_child_at_index(addedItems[i].item,
                                            addedItems[i].pos);
        }

        for (let i = 0; i < removedActors.length; i++) {
            let item = removedActors[i];

            // Don't animate item removal when the overview is transitioning
            if (!Main.overview.visible || Main.overview.animationInProgress) // this was changed to only show animations outside overview
                item.animateOutAndDestroy();
        }

        this._adjustIconSize();

        // Skip animations on first run when adding the initial set
        // of items, to avoid all items zooming in at once

        let animate = this._shownInitially &&
            (!Main.overview.visible || Main.overview.animationInProgress); // this was changed to only show animations outside overview

        if (!this._shownInitially)
            this._shownInitially = true;

        for (let i = 0; i < addedItems.length; i++)
            addedItems[i].item.show(animate);

        // Update separator
        const nFavorites = Object.keys(favorites).length;
        const nIcons = children.length + addedItems.length - removedActors.length;
        if (nFavorites > 0 && nFavorites < nIcons) {
            if (!this._separator) {
                this._separator = new St.Widget({
                    style_class: 'dash-separator',
                    y_align: Clutter.ActorAlign.CENTER,
                    height: this.iconSize,
                });
                this._box.add_child(this._separator);
            }
            let pos = nFavorites + this._animatingPlaceholdersCount;
            if (this._dragPlaceholder)
                pos++;
            this._box.set_child_at_index(this._separator, pos);
        } else if (this._separator) {
            this._separator.destroy();
            this._separator = null;
        }

        // Workaround for https://bugzilla.gnome.org/show_bug.cgi?id=692744
        // Without it, StBoxLayout may use a stale size cache
        this._box.queue_relayout();
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

        if (settings.get_boolean('always-show')) {
            this.ding.resetMargins();
            this.ding.setMargins(Main.layoutManager.primaryIndex, 0, this.dock.get_height(), 0, 0);
        }

        this._update_hide_override();
        this._border_refresh();

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

    _border_refresh() {
        if (this.border_refreshing || !this.dock.work_area)
            return;

        this.border_refreshing = true;

        if (this._pressure_barrier) {
            this._remove_barrier();

            let x1 = this.dock.work_area.x + Math.round((this.dock.work_area.width - this.dock._dashContainer.width) / 2);
            let x2 = x1 + this.dock._dashContainer.width;
            let y1 = this.dock.work_area.y + this.dock.work_area.height;
            let y2 = y1;
    
            this._bottom_barrier = new Meta.Barrier({
                display: global.display,
                x1: x1,
                x2: x2,
                y1: y1,
                y2: y2,
                directions: Meta.BarrierDirection.NEGATIVE_Y
            });
    
            this._pressure_barrier.addBarrier(this._bottom_barrier);
        } else if (this.screen_border_box) {
            this.screen_border_box.set_size(this.dock._dashContainer.width, SHOW_DOCK_BOX_HEIGHT);
            this.screen_border_box_x = this.dock.work_area.x + Math.round((this.dock.work_area.width - this.dock._dashContainer.width) / 2);
            this.screen_border_box_y = this.dock.work_area.y + this.dock.work_area.height - SHOW_DOCK_BOX_HEIGHT;
            this.screen_border_box.set_position(this.screen_border_box_x, this.screen_border_box_y);    
        }

        this.border_refreshing = false;
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

    _on_border_hover() {
        if (this.dock.visible || (!this._pressure_barrier && !this.screen_border_box))
            return;

        if (this.dock.auto_hide_dock_timeout) {
            GLib.source_remove(this.dock.auto_hide_dock_timeout);
            this.dock.auto_hide_dock_timeout = 0;
        }

        if (!Main.overview.visible && !Main.sessionMode.isLocked) {
            if (this.toggle_dock_hover_timeout)
                return;

            this.toggle_dock_hover_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, settings.get_int('toggle-delay'), () => {
                if (settings.get_boolean('show-in-full-screen') || !global.display.get_focus_window() || !global.display.get_focus_window().is_fullscreen()) {
                    this.dock._show_dock();
                    if (!this.dock._dashContainer.get_hover())
                        this.dock._hide_dock();
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
        else if (window && IGNORED_APPS.includes(window.get_gtk_application_id()) && window.skip_taskbar)
            this.dock.hide_override = false;
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
    }

    _on_overview_hiding() {
        if ((!this.dock.hide_override && !this.dock.window_overlap) || this.dock._dashContainer.get_hover())
            this.dock._show_dock(false);
    }

    _on_pressure_threshold_changed() {
        if (this._pressure_barrier) {
            this._destroy_pressure_barrier();
            this._create_pressure_barrier();
            this._border_refresh();
        }
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

    _remove_barrier() {
        if (!this._bottom_barrier)
            return;
        if (this._pressure_barrier)
            this._pressure_barrier.removeBarrier(this._bottom_barrier);
        this._bottom_barrier.destroy();
        this._bottom_barrier = null;
    }

    _create_pressure_barrier() {
        if (this._pressure_barrier)
            return;

        this._pressure_barrier = new Layout.PressureBarrier(settings.get_int('pressure-threshold'), 1000, Shell.ActionMode.NORMAL);
        this._pressure_barrier.connect('trigger', this._on_border_hover.bind(this));
    }

    _create_screen_border_box() {
        if (this.screen_border_box)
            return;

        this.screen_border_box = new ScreenBorderBox();
        this.screen_border_box.connect('notify::hover', this._on_border_hover.bind(this));
        this.screen_border_box.connect('scroll-event', this.dock._on_dock_scroll.bind(this.dock));
    }

    _destroy_pressure_barrier() {
        this._remove_barrier();
        if (this._pressure_barrier) {
            this._pressure_barrier.destroy();
            this._pressure_barrier = null;
        }
    }

    _destroy_screen_border_box() {
        if (!this.screen_border_box)
            return;

        Main.layoutManager.removeChrome(this.screen_border_box);
        this.screen_border_box.destroy();
        this.screen_border_box = null;
    }

    _create_border() {
        if (global.display.supports_extended_barriers() && settings.get_boolean('use-pressure')) {
            this._destroy_screen_border_box();
            this._create_pressure_barrier();
        } else {
            this._destroy_pressure_barrier();
            this._create_screen_border_box();
        }
        this._border_refresh();
    }

    _create_dock() {
        this.dock = new Dock();

        Main.layoutManager.uiGroup.set_child_below_sibling(this.dock, Main.layoutManager.modalDialogGroup);

        this.auto_hide = new AutoHide.AutoHide();
        this.ding = new DesktopIconsIntegration.DesktopIconsUsableAreaClass();

        this._create_border();
        this._tracker = Shell.WindowTracker.get_default()

        this.dock._box.connect('notify::position', this._border_refresh.bind(this));
        this.dock._box.connect('notify::size', this._border_refresh.bind(this));
        this.dock._background.connect('notify::size', this._update_dock_size_box.bind(this));
        this._dock_refresh();

        this.dock._dashContainer.connect('notify::hover', this.dock._on_dock_hover.bind(this.dock));
        this.dock._dashContainer.connect('scroll-event', this.dock._on_dock_scroll.bind(this.dock));
        this.dock.showAppsButton.connect('button-release-event', () => Main.overview.showApps());

        this.overview_shown = Main.overview.connect('shown', this._on_overview_shown.bind(this));
        this.overview_hiding = Main.overview.connect('hiding', this._on_overview_hiding.bind(this));

        this.monitors_changed = Main.layoutManager.connect('monitors-changed', this._dock_refresh.bind(this));
        this.workareas_changed = global.display.connect_after('workareas-changed', this._dock_refresh.bind(this));
        this.restacked = global.display.connect_after('restacked', this._update_hide_override.bind(this));
        this.focus = this._tracker.connect_after('notify::focus-app', this._update_hide_override.bind(this));
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
        this.use_pressure_setting_changed = settings.connect('changed::use-pressure', this._create_border.bind(this));
        this.threshold_setting_changed = settings.connect('changed::pressure-threshold', this._on_pressure_threshold_changed.bind(this));
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

            this._border_refresh();

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
        if (this.use_pressure_setting_changed) {
            settings.disconnect(this.use_pressure_setting_changed);
            this.use_pressure_setting_changed = null;
        }
        if (this.threshold_setting_changed) {
            settings.disconnect(this.threshold_setting_changed);
            this.threshold_setting_changed = null;
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
        if (this.focus) {
            this._tracker.disconnect(this.focus);
            this.focus = null;
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

        this._destroy_pressure_barrier();
        this._destroy_screen_border_box();

        this.ding.destroy();
        this.ding = null;

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
