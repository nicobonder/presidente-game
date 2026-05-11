#!/usr/bin/env python3
"""
Make a single-color background (sampled from corners) transparent for PNGs in a folder.

Usage: python scripts/remove_png_bg.py [path]
Defaults to frontend/src/Assets

This script overwrites files in-place but first writes a backup with suffix .bak
"""
from PIL import Image
import sys
import os

def sample_bg_color(im):
    w,h = im.size
    corners = [im.getpixel((0,0)), im.getpixel((w-1,0)), im.getpixel((0,h-1)), im.getpixel((w-1,h-1))]
    # choose the most common color among corners
    from collections import Counter
    cnt = Counter(corners)
    return cnt.most_common(1)[0][0]

def close(c1, c2, thresh=30):
    return sum(abs(a-b) for a,b in zip(c1,c2)) <= thresh

def process(path):
    print('Processing folder', path)
    for name in os.listdir(path):
        if not name.lower().endswith('.png'): continue
        fp = os.path.join(path, name)
        print(' -', name)
        im = Image.open(fp).convert('RGBA')
        bg = sample_bg_color(im)
        px = im.load()
        w,h = im.size
        changed = False
        for y in range(h):
            for x in range(w):
                r,g,b,a = px[x,y]
                if a == 0: continue
                if close((r,g,b), bg):
                    px[x,y] = (r,g,b,0)
                    changed = True
        if changed:
            bak = fp + '.bak'
            if not os.path.exists(bak):
                os.rename(fp, bak)
                im.save(fp)
                print('   -> background removed, backup saved as', os.path.basename(bak))
            else:
                # overwrite directly
                im.save(fp)
                print('   -> background removed (overwrote)')
        else:
            print('   -> no pixels matched background; skipped')

if __name__ == '__main__':
    dest = sys.argv[1] if len(sys.argv) > 1 else 'frontend/src/Assets'
    if not os.path.isdir(dest):
        print('Folder not found:', dest); sys.exit(2)
    try:
        process(dest)
    except Exception as e:
        print('Error:', e); raise
