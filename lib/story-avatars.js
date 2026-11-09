const cache = new Map();
async function readImage(response) {
    const type = (response.headers.get('content-type') || '').split(';')[0];
    if (!response.ok || !['image/jpeg','image/png','image/webp'].includes(type)) return '';
    if (Number(response.headers.get('content-length')) > 320000) return '';
    const reader = response.body?.getReader();
    if (!reader) return '';
    const chunks = []; let size = 0;
    for (;;) {
        const {done,value} = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 320000) { await reader.cancel(); return ''; }
        chunks.push(Buffer.from(value));
    }
    return size ? `data:${type};base64,${Buffer.concat(chunks).toString('base64')}` : '';
}
async function telegramUserpic(src, fetcher) {
    if (!/^https:\/\/t\.me\/i\/userpic\/\d{1,4}\/[a-zA-Z0-9_.-]+$/.test(src || '')) return '';
    let url = src;
    const deadline = Date.now() + 5000;
    for (let i=0;i<3;i++) {
        const r = await fetcher(url, {redirect:'manual',signal:AbortSignal.timeout(Math.max(1,deadline-Date.now()))});
        if (![301,302,303,307,308].includes(r.status)) return readImage(r);
        const location = r.headers.get('location');
        if (!location) return '';
        const next = new URL(location,url);
        if (next.protocol !== 'https:' || next.port || next.username || next.password || !/^cdn\d+\.telesco\.pe$/.test(next.hostname) || !next.pathname.startsWith('/file/')) return '';
        url = next.href;
    }
    return '';
}
async function storyAvatar(id, src, token, fetcher = fetch) {
    const key = `${id}:${src || ''}`, saved = cache.get(key);
    if (saved && saved.until > Date.now()) return saved.image;
    let image = '';
    try { image = await telegramUserpic(src,fetcher); } catch { /* пробуем фото, доступное боту */ }
    if (!image && token && /^[1-9]\d{0,15}$/.test(id)) {
        try {
            const call = async (method,body) => {
                const r = await fetcher(`https://api.telegram.org/bot${token}/${method}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(3000)});
                const j = r.ok ? await r.json() : null;
                return j?.ok ? j.result : null;
            };
            const chat = await call('getChat',{chat_id:id});
            const fileId = chat?.photo?.small_file_id;
            const file = fileId ? await call('getFile',{file_id:fileId}) : null;
            if (/^photos\/[a-zA-Z0-9_.-]+$/.test(file?.file_path || '')) {
                image = await readImage(await fetcher(`https://api.telegram.org/file/bot${token}/${file.file_path}`,{redirect:'error',signal:AbortSignal.timeout(3000)}));
            }
        } catch { /* закрытые и недоступные аватары заменяются инициалами */ }
    }
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(key,{image,until:Date.now()+(image?15*60000:60000)});
    return image;
}
module.exports = {storyAvatar,telegramUserpic};
