from PIL import Image, ImageDraw, ImageFont

def icon(size, path):
    img = Image.new("RGB", (size, size), (5, 7, 13))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            r = int(0 + 255 * t); g = int(180 - 140 * t); b = int(255 - 190 * t)
            if y > size * 0.78 or y < size * 0.22:
                px[x, y] = (r, g, b)
    d = ImageDraw.Draw(img)
    try:
        f = ImageFont.truetype("impact.ttf", int(size * 0.5))
    except Exception:
        f = ImageFont.load_default()
    txt = "BM"
    w = d.textlength(txt, font=f)
    d.text(((size - w) / 2, size * 0.2), txt, font=f, fill=(242, 246, 255))
    img.save(path)

icon(192, "icon-192.png")
icon(512, "icon-512.png")
