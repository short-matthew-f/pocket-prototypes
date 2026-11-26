#!/usr/bin/env python3
"""Import Koschei's Tower art + sound from the Media Helper's drop and rebuild assets/manifest.js.
  ../.venv/bin/python koschei-tower/assets/import.py <drop>/deliveries/pocket-prototypes/koschei-tower/assets
Images: trimmed to the subject and padded square, kept as PNG with no resampling (they are true pixel art; the game
samples them nearest-neighbour at the size it needs). Sounds: copied as-is (short mono WAVs)."""
import hashlib, json, os, shutil, sys
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
def main(src):
    for name in sorted(os.listdir(os.path.join(src, 'img'))):
        if not name.endswith('.png'): continue
        im = Image.open(os.path.join(src, 'img', name)).convert('RGBA')
        bb = im.getbbox(); im = im.crop(bb) if bb else im
        s = max(im.size); out = Image.new('RGBA', (s, s), (0, 0, 0, 0))
        # bottom-align creatures so they stand on the floor of their box
        out.paste(im, ((s - im.width) // 2, s - im.height)); out.save(os.path.join(HERE, 'img', name), optimize=True)
    for name in sorted(os.listdir(os.path.join(src, 'sfx'))):
        if name.endswith(('.wav', '.mp3', '.ogg')): shutil.copy(os.path.join(src, 'sfx', name), os.path.join(HERE, 'sfx', name))
    manifest()
def manifest():
    m = {'img': {}, 'sfx': {}}
    for kind in ('img', 'sfx'):
        for name in sorted(os.listdir(os.path.join(HERE, kind))):
            p = os.path.join(HERE, kind, name); h = hashlib.sha1(open(p, 'rb').read()).hexdigest()[:8]
            m[kind][os.path.splitext(name)[0]] = f'assets/{kind}/{name}?h={h}'
    open(os.path.join(HERE, 'manifest.js'), 'w').write('window.PP_ASSETS = ' + json.dumps(m, indent=1) + ';\n')
    print(len(m['img']), 'images,', len(m['sfx']), 'sounds')
if __name__ == '__main__': main(sys.argv[1]) if len(sys.argv) > 1 else manifest()
