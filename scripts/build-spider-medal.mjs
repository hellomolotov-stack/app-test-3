import fs from 'node:fs/promises';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createSpiderMedal } from '../js/medals/model.js';

globalThis.FileReader = class {
    async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend?.(); }
    async readAsDataURL(blob) { this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onloadend?.(); }
};
const font = new FontLoader().parse(JSON.parse(await fs.readFile('assets/achievements/manrope-cyrillic.json', 'utf8')));
const model = createSpiderMedal(font);
const glb = await new GLTFExporter().parseAsync(model, { binary: true, onlyVisible: true });
await fs.writeFile('assets/achievements/spider-cave-v1.glb', Buffer.from(glb));
console.log(`Exported real medal geometry: ${Math.round(glb.byteLength/1024)} KB`);
