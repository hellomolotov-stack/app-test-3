# Лёгкие копии значков: assets/achievements/**.png → thumbs/ (256 px) и md/ (512 px) в WebP.
# Запуск после добавления новых значков: python3 scripts/medal-thumbs.py (уже готовые копии пропускаются).
# Сначала каждый PNG чистится от фона: почти прозрачная дымка и отдельные пиксели-крошки вокруг значка
# (остаются после вырезания фона генератором) становятся полностью прозрачными – значок идёт «без фона».
import os
from PIL import Image, ImageChops, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'achievements')


def clean(image):
    alpha = image.getchannel('A')
    solid = alpha.point(lambda v: 255 if v >= 24 else 0)
    # убираем крошки: сужаем (мелкие пятна исчезают) и расширяем обратно с запасом под мягкий край значка
    core = solid.filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(7))
    keep = core.filter(ImageFilter.MaxFilter(9))
    new_alpha = ImageChops.multiply(alpha, keep)
    new_alpha = new_alpha.point(lambda v: 0 if v < 8 else v)
    if ImageChops.difference(alpha, new_alpha).getbbox() is None:
        return None
    out = image.copy()
    out.putalpha(new_alpha)
    # у полностью прозрачных пикселей обнуляем цвет – иначе при масштабировании по краю проступает ореол
    black = Image.new('RGBA', out.size, (0, 0, 0, 0))
    return Image.composite(out, black, new_alpha.point(lambda v: 255 if v else 0))


for root, _, files in os.walk(ROOT):
    rel_root = os.path.relpath(root, ROOT)
    if rel_root.split(os.sep)[0] in ('thumbs', 'md'):
        continue
    for name in files:
        if not name.endswith('.png'):
            continue
        src = os.path.join(root, name)
        cleaned = clean(Image.open(src).convert('RGBA'))
        if cleaned is not None:
            cleaned.save(src, optimize=True)
            print('очищен фон:', os.path.relpath(src, ROOT))
        rel = os.path.relpath(src, ROOT)[:-4] + '.webp'
        image = None
        for folder, size, quality in (('thumbs', 256, 80), ('md', 512, 84)):
            out = os.path.join(ROOT, folder, rel)
            if os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(src):
                continue
            image = image or Image.open(src).convert('RGBA')
            os.makedirs(os.path.dirname(out), exist_ok=True)
            copy = image.copy()
            copy.thumbnail((size, size), Image.LANCZOS)
            copy.save(out, 'WEBP', quality=quality, method=4, exact=False)
            print(out)
