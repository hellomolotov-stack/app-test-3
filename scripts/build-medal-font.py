"""Convert the OFL Manrope source to a small Cyrillic Three.js typeface."""
import json
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen

font = instantiateVariableFont(TTFont(sys.argv[1]), {"wght": 600})
glyph_set = font.getGlyphSet()
scale = 1000 / font["head"].unitsPerEm


class OutlinePen(BasePen):
    def __init__(self):
        super().__init__(glyph_set)
        self.parts = []
        self.start = None

    def point(self, point):
        return [str(round(value * scale, 3)) for value in point]

    def _moveTo(self, point):
        self.start = point
        self.parts += ["m", *self.point(point)]

    def _lineTo(self, point):
        self.parts += ["l", *self.point(point)]

    def _qCurveToOne(self, control, end):
        self.parts += ["q", *self.point(end), *self.point(control)]

    def _curveToOne(self, control1, control2, end):
        self.parts += ["b", *self.point(end), *self.point(control1), *self.point(control2)]

    def _closePath(self):
        if self.start is not None:
            self._lineTo(self.start)

    def _endPath(self):
        pass


glyphs = {}
for codepoint, glyph_name in font.getBestCmap().items():
    if not (32 <= codepoint < 127 or 0x400 <= codepoint <= 0x45F or codepoint in [0xB7, 0x2013, 0x2014]):
        continue
    outline = OutlinePen()
    glyph_set[glyph_name].draw(outline)
    bounds = BoundsPen(glyph_set)
    glyph_set[glyph_name].draw(bounds)
    box = bounds.bounds or (0, 0, 0, 0)
    glyphs[chr(codepoint)] = {"ha": round(font["hmtx"][glyph_name][0] * scale, 3),
                            "x_min": round(box[0] * scale, 3), "x_max": round(box[2] * scale, 3),
                            "o": " ".join(outline.parts)}
result = {"glyphs": glyphs, "familyName": "Manrope", "resolution": 1000,
          "ascender": font["hhea"].ascent * scale, "descender": font["hhea"].descent * scale,
          "underlineThickness": 50, "boundingBox": {"yMin": -300, "yMax": 1100},
          "original_font_information": {"license": "SIL Open Font License 1.1", "source": "google/fonts/ofl/manrope"}}
with open(sys.argv[2], "w", encoding="utf-8") as output:
    json.dump(result, output, ensure_ascii=False, separators=(",", ":"))
print(f"Saved {len(glyphs)} glyphs")
