# Лёгкие копии значков: assets/achievements/**.png → thumbs/ (256 px) и md/ (512 px) в WebP.
# Запуск после добавления новых значков: python3 scripts/medal-thumbs.py (уже готовые копии пропускаются).
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'achievements')
for root, _, files in os.walk(ROOT):
    rel_root = os.path.relpath(root, ROOT)
    if rel_root.split(os.sep)[0] in ('thumbs', 'md'):
        continue
    for name in files:
        if not name.endswith('.png'):
            continue
        src = os.path.join(root, name)
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
            copy.save(out, 'WEBP', quality=quality, method=4)
            print(out)
