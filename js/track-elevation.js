const ELEVATION_TIMEOUT = 2000;

export async function loadTrackElevations(pick) {
    const controller = new AbortController();
    let timer;
    const result = await Promise.race([
        fetch(`https://api.open-meteo.com/v1/elevation?latitude=${pick.map(p => p[0].toFixed(5)).join(',')}&longitude=${pick.map(p => p[1].toFixed(5)).join(',')}`, { signal: controller.signal })
            .then(r => r.ok ? r.json() : null).catch(() => null),
        new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve(null); }, ELEVATION_TIMEOUT); })
    ]).finally(() => clearTimeout(timer));
    const els = result?.elevation;
    // Не склеиваем точки через пропуски: иначе набор высоты получится недостоверным.
    return Array.isArray(els) && els.length === pick.length && els.every(Number.isFinite) ? els : null;
}
