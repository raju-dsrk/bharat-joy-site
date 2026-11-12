#!/usr/bin/env python3
"""Optional helper (needs Pillow): turn a source PNG into the web files the site uses.

  python3 tools/images.py icon  path/to/icon-512.png   ludo-icon
      -> public/assets/img/icons/ludo-icon-96.webp, -192.webp, -512.jpg (512 JPG is for OG/social cards)
  python3 tools/images.py shot  path/to/screen.png     ludo-home
      -> public/assets/img/shots/ludo-home.webp (480 px wide, phone frame size x2)
  python3 tools/images.py band  path/to/crop.png       band-ludo
      -> public/assets/img/band/band-ludo.webp (max 800 px wide)

Then point the game's record in data/site.data.json at the new base name and run `node tools/build.mjs`.
"""
import sys, os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'img')


def save_webp(im, path, q=82):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'WEBP', quality=q, method=6)
    print(path, os.path.getsize(path) // 1024, 'KB', im.size)


def main():
    kind, src, name = sys.argv[1:4]
    im = Image.open(src).convert('RGBA')
    if kind == 'icon':
        for s in (96, 192):
            save_webp(im.resize((s, s), Image.LANCZOS), f'{ROOT}/icons/{name}-{s}.webp', 88)
        p = f'{ROOT}/icons/{name}-512.jpg'
        bg = Image.new('RGB', im.size, (243, 230, 200))
        bg.paste(im, mask=im.split()[3])
        bg.resize((512, 512), Image.LANCZOS).save(p, quality=86, optimize=True, progressive=True)
        print(p, os.path.getsize(p) // 1024, 'KB')
    elif kind == 'shot':
        w = 480
        h = round(im.height * w / im.width)
        save_webp(im.convert('RGB').resize((w, h), Image.LANCZOS), f'{ROOT}/shots/{name}.webp', 80)
    elif kind == 'band':
        w = min(800, im.width)
        h = round(im.height * w / im.width)
        save_webp(im.convert('RGB').resize((w, h), Image.LANCZOS), f'{ROOT}/band/{name}.webp', 80)
    else:
        sys.exit('kind must be icon, shot or band')


if __name__ == '__main__':
    main()
