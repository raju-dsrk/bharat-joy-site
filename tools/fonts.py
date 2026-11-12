#!/usr/bin/env python3
"""Optional (needs fonttools + brotli): rebuild the Devanagari web font from the Hindi text the site uses.

  python3 tools/fonts.py path/to/NotoSerifDevanagari[wdth,wght].ttf

Reads every Devanagari letter in data/site.data.json and tools/build.mjs, keeps those (plus joiners,
digits and punctuation) with all their shaping rules, and writes public/assets/fonts/NotoSerifDevanagari-deva.woff2.
tests/site.test.mjs reads the woff2's own character map (tests/woff2-cmap.mjs, no dependencies) and fails
when the site uses a Devanagari character the font does not have, so run this again after adding Hindi
text with a new letter. Source font: Google Fonts, Noto Serif Devanagari (OFL).
"""
import io, os, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
COMMON = [0x200C, 0x200D, 0x25CC, 0x0964, 0x0965, 0x20, 0xA0, 0x2D, 0x2E, 0x2C, 0x3A, 0x3F, 0x21, 0x28, 0x29, 0x7C, 0xB7,
          0x2018, 0x2019, 0x201C, 0x201D] + list(range(0x30, 0x3A))


def used_chars():
    chars = set()
    for rel in ('data/site.data.json', 'tools/build.mjs'):
        with open(os.path.join(ROOT, rel), encoding='utf8') as fh:
            chars |= {c for c in fh.read() if 0x0900 <= ord(c) <= 0x097F}
    return sorted(chars)


def main():
    src = sys.argv[1]
    chars = used_chars()
    font = TTFont(src)
    if 'fvar' in font:
        font = instancer.instantiateVariableFont(font, {'wdth': 100, 'wght': 400})
        buf = io.BytesIO(); font.save(buf); buf.seek(0); font = TTFont(buf)
    opt = subset.Options()
    opt.flavor = 'woff2'; opt.layout_features = ['*']; opt.notdef_outline = True
    opt.name_IDs = ['*']; opt.hinting = False; opt.desubroutinize = True
    sub = subset.Subsetter(opt)
    sub.populate(unicodes=[ord(c) for c in chars] + COMMON)
    sub.subset(font)
    font.flavor = 'woff2'
    out = os.path.join(ROOT, 'public/assets/fonts/NotoSerifDevanagari-deva.woff2')
    font.save(out)
    print(out, os.path.getsize(out) // 1024, 'KB,', len(chars), 'letters')


if __name__ == '__main__':
    main()
