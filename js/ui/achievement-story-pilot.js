const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const images = new Map();
function image(src) {
    if (!images.has(src)) images.set(src, new Promise((resolve, reject) => {
        const img = new Image();
        const timer = setTimeout(() => reject(new Error('image timeout')), 6000);
        img.onload = () => { clearTimeout(timer); resolve(img); };
        img.onerror = () => { clearTimeout(timer); reject(new Error('image unavailable')); };
        img.src = src;
    }).catch(e => { images.delete(src); throw e; }));
    return images.get(src);
}
const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
function text(ctx, value, y, size, weight = 700, color = '#fff') {
    ctx.fillStyle = color; ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillText(value, 540, y, 960);
}
function circle(ctx, x, y, size, fill) {
    ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
}
export async function drawPilotAchievementStory(award, collection, context) {
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    const unique = [...new Map([award, ...collection].map(a => [a.id, a])).values()];
    const miniatures = unique.slice(0, 6), people = (context.people || []).slice(0, 8);
    const [sky, logo, medal, minis, portraits] = await Promise.all([
        image('/assets/stories/badge-sky-v1.jpg'), image('/assets/stories/badge-logo-v1.png'), image(award.medal.imageUrl),
        Promise.all(miniatures.map(a => image(a.medal.imageUrl).catch(() => null))),
        Promise.all(people.map(p => p.image ? image(p.image).catch(() => null) : null)),
    ]);
    ctx.fillStyle = '#519ABF'; ctx.fillRect(0, 0, 1080, 1920);
    const scale = Math.max(1080 / sky.width, 1920 / sky.height), w = sky.width * scale, h = sky.height * scale;
    ctx.save(); ctx.filter = 'blur(6px)'; ctx.drawImage(sky, (1080-w)/2, (1920-h)/2, w, h); ctx.restore();
    ctx.fillStyle = 'rgba(13,71,101,.15)'; ctx.fillRect(0, 0, 1080, 1920);
    ctx.drawImage(logo, 280.8, 211.2, 518.4, 518.4 * logo.height / logo.width);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    text(ctx, 'новый значок', 470.4, 102, 800);
    const label = 'в коллекцию ', count = '+' + unique.length;
    ctx.font = `400 48px ${FONT}`; const lw = ctx.measureText(label).width;
    ctx.font = `800 48px ${FONT}`; const cw = ctx.measureText(count).width;
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = `400 48px ${FONT}`; ctx.fillText(label, 540-(lw+cw)/2, 604.8);
    ctx.fillStyle = '#D9FD19'; ctx.font = `800 48px ${FONT}`; ctx.fillText(count, 540-(lw+cw)/2+lw, 604.8);
    const more = unique.length - minis.length, cells = minis.length + (more > 0 ? 1 : 0), start = (1080-(cells*99+(cells-1)*15))/2;
    minis.forEach((img, i) => { if (img) ctx.drawImage(img, start+i*114, 681.6, 99, 99); });
    if (more > 0) { const x=start+minis.length*114; circle(ctx,x,689,84,'rgba(255,255,255,.2)');ctx.textAlign='center';ctx.font=`700 28px ${FONT}`;ctx.fillStyle='#fff';ctx.fillText('+'+more,x+42,716); }
    ctx.save(); ctx.shadowColor='rgba(26,72,94,.26)';ctx.shadowBlur=45;ctx.shadowOffsetY=39;
    ctx.drawImage(medal,280.8,864,518.4,518.4); ctx.restore();
    if (award.kind === 'route' && award.grant?.count > 1) {
        const value='×'+award.grant.count;ctx.font=`800 45px ${FONT}`;const width=ctx.measureText(value).width+60;
        ctx.fillStyle='#D9FD19';ctx.beginPath();ctx.roundRect(799.2-width,1070,width,78,39);ctx.fill();
        ctx.fillStyle='#141800';ctx.textAlign='center';ctx.fillText(value,799.2-width/2,1082);
    }
    if (people.length) {
        ctx.font=`400 36px ${FONT}`;const labelWidth=ctx.measureText('вместе с').width, facesWidth=87+(people.length-1)*72;
        const x=(1080-labelWidth-33-facesWidth)/2, y=1478.4;
        ctx.textAlign='left';ctx.fillStyle='#fff';ctx.fillText('вместе с',x,y+25);
        people.forEach((p,i)=>{
            const fx=x+labelWidth+33+i*72;circle(ctx,fx,y,87,'#73ADC9');ctx.save();ctx.beginPath();ctx.arc(fx+43.5,y+43.5,37.5,0,Math.PI*2);ctx.clip();
            const photo=portraits[i];
            if(photo){const s=Math.max(75/photo.width,75/photo.height);ctx.drawImage(photo,fx+43.5-photo.width*s/2,y+43.5-photo.height*s/2,photo.width*s,photo.height*s);}
            else{ctx.fillStyle=i%2?'#757D5D':'#326980';ctx.fillRect(fx+6,y+6,75,75);ctx.textAlign='center';ctx.font=`700 29px ${FONT}`;ctx.fillStyle='#fff';ctx.fillText(String(p.name||'?').trim().split(/\s+/).map(v=>v[0]).slice(0,2).join('').toUpperCase(),fx+43.5,y+26);}
            ctx.restore();
        });
    }
    ctx.textAlign='center';
    const title = String(context.title || award.title || '');
    let size=69;ctx.font=`800 ${size}px ${FONT}`;
    while(size>32 && ctx.measureText(title).width>960){size--;ctx.font=`800 ${size}px ${FONT}`;}
    text(ctx,title,1612.8,size,800);
    const date=context.date || award.grant?.date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date||'')) text(ctx,`${+date.slice(8)} ${months[+date.slice(5,7)-1]} ${date.slice(0,4)}`,1708.8,36,400);
    text(ctx,'@yaltahiking',1785.6,42,700,'#D9FD19');
    return canvas;
}
