"""
Build App Store promo panels from raw device captures.

Re-run after recapturing screenshots. TARGETS lists every shelf size to emit;
App Store Connect validates dimensions exactly, so each shelf gets its own
render (scaling a finished panel would soften the text).
"""
from PIL import Image, ImageDraw, ImageFont
import os

BG, GREEN, WHITE, GREY = (11,11,11), (0,214,143), (245,245,245), (150,152,156)
BOLD = "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf"
REG  = "/usr/share/fonts/truetype/google-fonts/Poppins-Regular.ttf"

# (width, height, output subfolder)
TARGETS = [
    (1284, 2778, "6_7inch"),   # iPhone 14/13/12 Pro Max shelf
    (1242, 2688, "6_5inch"),   # iPhone 11 Pro Max / XS Max shelf
    (1320, 2868, "6_9inch"),   # iPhone 16/17 Pro Max shelf
]

STATUS_CROP_AT_1320 = 150   # status bar height, scaled per target below

PANELS = [
    ("hv-04.png", 0,   "AT A GLANCE",
     "Know what's due\nthe moment\nyou open it",
     "Overdue feedings surface first, so nothing\nquietly goes three weeks without a meal."),
    ("hv-05.png", 0,   "YOUR COLLECTION",
     "One tap from\nfed — without\nleaving the list",
     "Every animal, every taxon, with days-since\nand a Fed button on each row."),
    ("hv-06.png", 0,   "CARE SHEETS",
     "Husbandry that\nadmits what\nisn't known",
     "Snakes, lizards, turtles, tortoises, frogs and\nsalamanders — sourced, not invented."),
    ("hv-02.png", 980, "FEEDER INVENTORY",
     "Know what's in\nthe freezer\nbefore you need it",
     "Frozen stock and live colonies, tracked by\nsize so you reorder before you run out."),
]

def wrapped(d, text, font, x, y, fill, leading):
    for line in text.split("\n"):
        d.text((x,y), line, font=font, fill=fill); y += leading
    return y

for W,H,folder in TARGETS:
    out_dir = os.path.join("final", folder)
    os.makedirs(out_dir, exist_ok=True)
    k = H / 2868.0                      # scale every metric off the 6.9" layout

    for idx,(fname, crop_bottom, eyebrow, headline, sub) in enumerate(PANELS, 1):
        src = Image.open(fname).convert("RGB")
        src = src.crop((0, int(STATUS_CROP_AT_1320*(src.height/2868)), src.width,
                        src.height - int(crop_bottom*(src.height/2868))))

        canvas = Image.new("RGB", (W,H), BG); d = ImageDraw.Draw(canvas)
        f_eyebrow = ImageFont.truetype(BOLD, int(40*k))
        f_head    = ImageFont.truetype(BOLD, int(104*k))
        f_sub     = ImageFont.truetype(REG,  int(42*k))

        x, y = int(90*k), int(150*k)
        d.text((x,y), eyebrow, font=f_eyebrow, fill=GREEN); y += int(78*k)
        y = wrapped(d, headline, f_head, x, y, WHITE, int(116*k)); y += int(26*k)
        y = wrapped(d, sub, f_sub, x, y, GREY, int(58*k))

        top = y + int(70*k)
        avail_w = W - int(180*k)
        shot = src.resize((avail_w, int(src.height * (avail_w/src.width))), Image.LANCZOS)
        mask = Image.new("L", shot.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle([0,0,*shot.size], int(44*k), fill=255)
        canvas.paste(shot, (int(90*k), top), mask)

        out = os.path.join(out_dir, f"{idx:02d}-{fname.replace('.png','')}.png")
        canvas.save(out, "PNG", optimize=True)
    print(f"  {folder}: 4 panels at {W}x{H}")
