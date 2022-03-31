#!/bin/bash

rm -rf ~/.local/share/gnome-shell/extensions/dock-from-dash@fthx/*
rm -rf .build
mkdir .build
meson --prefix=$HOME/.local/ --localedir=share/gnome-shell/extensions/dock-from-dash@fthx/locale .build
ninja -C .build install
rm -rf .build
