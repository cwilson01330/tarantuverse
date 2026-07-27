"""
Google Play phone screenshots (1080x1920).

Play's rules differ from Apple's in one way that matters: the longest side may
be at most TWICE the shortest. Our iOS panels are 1284x2778 (2.16:1) and would
be rejected, so Play gets its own 16:9 composition rather than a resize —
the copy block is tighter and the device shot is scaled to suit.

Also: 24-bit PNG, no alpha channel. We compose on an opaque RGB canvas.
"""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1080, 1920
BG, GREEN, WHITE, GREY = (11,11,11), (0,214,143), (245,245,245), (150,152,156)
BOLD = "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf"
REG  = "/usr/share/fonts/truetype/google-fonts/Poppins-Regular.ttf"

PANELS = [
    ("hv-04.png", 0,   "AT A GLANCE",
     "Know what's due\nthe moment you open it",
     "Overdue feedings surface first."),
    ("hv-05.png", 0,   "YOUR COLLECTION",
     "One tap from fed —\nwithout leaving the list",
     "Every animal, with days-since on each row."),
    ("hv-06.png", 0,   "CARE SHEETS",
     "Husbandry that admits\nwhat isn't known",
     "Snakes, lizards, turtles, tortoises, frogs, salamanders."),
    ("hv-02.png", 980, "FEEDER INVENTORY",
     "Know what's in the freezer\nbefore you need it",
     "Frozen stock and live colonies, tracked by size."),
]

out_dir = "final/play_phone"
os.makedirs(out_dir, exist_ok=True)

for idx,(fname, crop_bottom, eyebrow, headline, sub) in enumerate(PANELS, 1):
    src = Image.open(fname).convert("RGB")
    sh = src.height
    src = src.crop((0, int(150*(sh/2868)), src.width, sh - int(crop_bottom*(sh/2868))))

    canvas = Image.new("RGB", (W,H), BG)      # RGB => no alpha channel
    d = ImageDraw.Draw(canvas)

    f_eyebrow = ImageFont.truetype(BOLD, 28)
    f_head    = ImageFont.truetype(BOLD, 62)
    f_sub     = ImageFont.truetype(REG,  30)

    x, y = 64, 76
    d.text((x,y), eyebrow, font=f_eyebrow, fill=GREEN); y += 54
    for line in headline.split("\n"):
        d.text((x,y), line, font=f_head, fill=WHITE); y += 74
    y += 12
    for line in sub.split("\n"):
        d.text((x,y), line, font=f_sub, fill=GREY); y += 42

    top = y + 44
    avail_w = W - 128
    shot = src.resize((avail_w, int(src.height*(avail_w/src.width))), Image.LANCZOS)
    mask = Image.new("L", shot.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0,0,*shot.size], 32, fill=255)
    canvas.paste(shot, (64, top), mask)

    canvas.save(os.path.join(out_dir, f"{idx:02d}-{fname.replace('.png','')}.png"),
                "PNG", optimize=True)

print(f"  4 panels at {W}x{H} -> {out_dir}")
