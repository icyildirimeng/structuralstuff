# Rebuild prelim-sizer/index.html from src/: python3 build.py
import os
d = os.path.dirname(os.path.abspath(__file__))
src = lambda f: open(os.path.join(d, 'src', f), encoding='utf-8').read()
page = src('page.html').replace('/*SHAPES*/', src('wshapes.js')).replace('/*ENGINE*/', src('engine.js')).replace('/*UI*/', src('ui.js'))
head, rest = page.split('</style>', 1)
html = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="description" content="Preliminary structural member sizing: RC/PT slabs and beams, steel and composite beams, '
        'columns, shear walls, transfer girders. ACI 318-19, AISC 360-22, ASCE 7-22.">\n'
        + head + '</style>\n</head>\n<body>\n' + rest + '\n</body>\n</html>\n')
open(os.path.join(d, 'index.html'), 'w', encoding='utf-8').write(html)
print('index.html', len(html), 'bytes')
