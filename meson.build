project('dock-from-dash',
  version: '99.0',
  license: 'GPL3'
)

gnome = import ('gnome')
i18n = import('i18n')

prefix = get_option('prefix')
datadir = join_paths (prefix, get_option('datadir'))
extensions_dir = join_paths(prefix, 'share', 'gnome-shell', 'extensions', 'dock-from-dash@fthx')
schema_dir = join_paths(extensions_dir, 'schemas')

install_data([
    'extension.js',
    'metadata.json',
    'prefs.js'
  ],
  install_dir: extensions_dir
)

subdir(
  'po'
)
subdir(
  'schemas'
)

meson.add_install_script('meson_post_install.py')
