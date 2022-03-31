# Dock from Dash

A simple dock that does use native GNOME Shell dash

GNOME Shell 40+ extension

https://extensions.gnome.org/extension/4703/dock-from-dash/

## How to install the extension

This extension includes an installer that simplifies all the process. You only
need to have installed in your system the programs: meson, ninja and gettext.
To install it, just:

    1. Open a terminal where you downloaded the extension
    2. type './local_install.sh'

## Building with meson (useful for packagers)

If you want to build the extension manually using meson (for example, to install
it system-wide or to package it), just do:

    meson --prefix=$HOME/.local/ --localedir=share/gnome-shell/extensions/ding@rastersoft.com/locale .build
    ninja -C .build install

You can change the prefix to _/usr_ or _/usr/local_ and remove the _localedir_.

## Translating into a new language

If you want to add a new language, first you have to edit the file po/LINGUAS and
add there the code for the new language that you want to use.

Now just follow the process in "updating the current translations"

## Updating the current translations

Follow these steps:

    1. Open a terminal where you downloaded the extension
    2. type 'meson .build'
    3. type 'ninja -C .build dock-from-dash-update-po
    4. open the .po file corresponding to your language with an editor

Although any text editor will work, I strongly recommend to use an editor oriented
to translate .po files, like 'gtranslator', because it greatly simplifies the job.
