import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

export const MEDAL_LIME = '#D9FD19';
const baseMetal = (color, roughness = .25) => new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness, clearcoat: .5, clearcoatRoughness: .18 });
const enamel = color => new THREE.MeshPhysicalMaterial({ color, metalness: .12, roughness: .2, clearcoat: 1, clearcoatRoughness: .09 });

function outline() {
    const s = new THREE.Shape();
    s.moveTo(-.9, -.63);
    s.bezierCurveTo(-1.1, -.43, -.94, -.02, -.84, .24);
    s.bezierCurveTo(-.76, .58, -.39, 1.08, -.08, 1.11);
    s.bezierCurveTo(.2, 1.23, .55, .76, .78, .39);
    s.bezierCurveTo(.92, .13, 1.12, -.4, .93, -.66);
    s.bezierCurveTo(.82, -.98, .39, -1.19, 0, -1.18);
    s.bezierCurveTo(-.42, -1.2, -.84, -.96, -.9, -.63);
    return s;
}

function solid(shape, depth, material, z, name, bevel = .025, curveSegments = 12) {
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, steps: 1, curveSegments, bevelEnabled: true,
        bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = z;
    mesh.name = name;
    return mesh;
}

function polygon(points) {
    const s = new THREE.Shape();
    const mid = (a, b) => [(a[0]+b[0])/2, (a[1]+b[1])/2];
    s.moveTo(...mid(points.at(-1), points[0]));
    points.forEach((p, i) => {
        const before = points[(i+points.length-1)%points.length];
        const after = points[(i+1)%points.length];
        s.lineTo(p[0]+(before[0]-p[0])*.13, p[1]+(before[1]-p[1])*.13);
        s.quadraticCurveTo(...p, p[0]+(after[0]-p[0])*.13, p[1]+(after[1]-p[1])*.13);
    });
    s.closePath();
    return s;
}

function tube(points, material, radius, name) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 8, false), material);
    mesh.name = name;
    return mesh;
}

export function lineText(font, text, size, material, width = 1.55) {
    const measured = [...text].reduce((sum, c) => sum + (font.data.glyphs[c]?.ha || 400) / font.data.resolution, 0);
    const fitted = Math.min(size, width / Math.max(measured, .01));
    const geometry = new TextGeometry(text, { font, size: fitted, depth: .004, curveSegments: 5,
        bevelEnabled: true, bevelThickness: .001, bevelSize: .001, bevelSegments: 1 });
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    geometry.translate(-(bounds.max.x + bounds.min.x) / 2, 0, 0);
    return new THREE.Mesh(geometry, material);
}

function arcText(font, text, material) {
    const root = new THREE.Group();
    root.name = 'front-inscription-rigid-glyphs';
    const advance = [...text].map(c => (font.data.glyphs[c]?.ha || 400) / font.data.resolution);
    const total = advance.reduce((a, b) => a + b, 0);
    const size = Math.min(.147, 1.83 / total);
    const radius = .985;
    let cursor = -total * size / 2;
    [...text].forEach((c, index) => {
        const width = advance[index] * size;
        const angle = (cursor + width / 2) / radius;
        if (c !== ' ') {
            const letter = lineText(font, c, size, material, 10);
            letter.position.set(radius * Math.sin(angle), -.075 - radius * Math.cos(angle), .139);
            letter.rotation.z = angle;
            letter.name = `inscription-glyph-${index}`;
            root.add(letter);
        }
        cursor += width;
    });
    return root;
}

export function createSpiderMedal(font, title = 'залез в пещеру пауков') {
    const group = new THREE.Group();
    group.name = 'club-spider-cave-medal-v1';
    group.userData = { kind: 'spider-cave', version: 1, lime: MEDAL_LIME, inscription: title };
    const violet = baseMetal('#8b39d8', .27), silver = baseMetal('#e5e2e0', .21);
    const dark = enamel('#171326'), white = enamel('#ffffff');
    const body = solid(outline(), .22, violet, -.13, 'metal-body-and-integrated-contour', .035);
    group.add(body);
    const interior = new THREE.Shape();
    interior.moveTo(-.65, -.54);
    interior.bezierCurveTo(-.71, -.25, -.45, .55, -.05, .79);
    interior.bezierCurveTo(.26, .74, .66, -.17, .66, -.54);
    interior.bezierCurveTo(.32, -.79, -.36, -.78, -.65, -.54);
    group.add(solid(interior, .035, dark, .095, 'recessed-cave-enamel', .02));
    const interiorRim = interior.getSpacedPoints(100).map(p => [p.x, p.y, .158]);
    group.add(tube(interiorRim, silver, .018, 'polished-inner-cave-rim'));
    const rocks = [
        [[-.91,-.43],[-.86,.00],[-.63,.03],[-.59,-.40],[-.72,-.58]],
        [[-.85,.08],[-.69,.46],[-.45,.40],[-.56,.08]],
        [[-.65,.53],[-.30,.97],[-.07,.87],[-.36,.46]],
        [[-.21,1.03],[.04,1.08],[.35,.86],[.10,.66],[-.08,.84]],
        [[.40,.78],[.67,.43],[.51,.22],[.25,.58]],
        [[.72,.34],[.90,-.03],[.67,-.14],[.56,.16]],
        [[.92,-.13],[.97,-.47],[.74,-.65],[.66,-.25]],
    ];
    rocks.forEach((points, index) => {
        const border = solid(polygon(points), .055, silver, .105, `silver-rock-divider-${index}`, .018, 4);
        const cx = points.reduce((n, p) => n + p[0], 0) / points.length;
        const cy = points.reduce((n, p) => n + p[1], 0) / points.length;
        const inset = points.map(([x, y]) => [cx + (x-cx)*.88, cy + (y-cy)*.88]);
        const fill = solid(polygon(inset), .033, enamel(index % 3 === 0 ? '#373347' : index % 2 ? '#5c2aaf' : '#7d40cc'), .164, `enamel-rock-${index}`, .014, 4);
        group.add(border, fill);
    });
    const center = [0, -.015, .22];
    const angles = Array.from({ length: 8 }, (_, i) => i * Math.PI / 4);
    angles.forEach((a, i) => group.add(tube([center, [.29*Math.sin(a), -.015+.29*Math.cos(a), .205],
        [.56*Math.sin(a), -.015+.56*Math.cos(a), .19]], silver, .011, `web-spoke-${i}`)));
    [.23, .43].forEach((r, ring) => angles.forEach((a, i) => {
        const b = a + Math.PI/4;
        group.add(tube([[r*Math.sin(a), -.015+r*Math.cos(a), .222],
            [(r-.032)*Math.sin((a+b)/2), -.015+(r-.032)*Math.cos((a+b)/2), .218],
            [r*Math.sin(b), -.015+r*Math.cos(b), .222]], silver, .009, `web-ring-${ring}-${i}`));
    }));
    const abdomen = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), enamel(MEDAL_LIME));
    abdomen.scale.set(.107, .143, .075); abdomen.position.set(0, .015, .29); abdomen.name = 'spider-abdomen-brand-lime';
    const head = new THREE.Mesh(new THREE.SphereGeometry(.073, 24, 16), silver);
    head.position.set(0, -.16, .29); head.name = 'spider-head';
    group.add(abdomen, head);
    [-1, 1].forEach(side => {
        for (let i = 0; i < 4; i++) {
            const y = .055 - i*.059;
            group.add(tube([[side*.07,y,.27],[side*(.16+i*.016),y+.07-i*.022,.30],
                [side*(.23+i*.013),y-.01-i*.035,.27]], silver, .014, `spider-leg-${side}-${i}`));
        }
        const eye = new THREE.Mesh(new THREE.SphereGeometry(.014, 12, 8), enamel('#171326'));
        eye.position.set(side*.027, -.146, .356); group.add(eye);
    });
    group.add(arcText(font, title, white));
    return group;
}

export function createPersonalBack(font, name, date) {
    const back = new THREE.Group();
    back.name = 'personal-engraving'; back.rotation.y = Math.PI; back.position.z = -.169;
    const material = new THREE.MeshPhysicalMaterial({ color: '#f5f1f7', metalness: .25, roughness: .35 });
    const lines = name.length > 17 && name.includes(' ') ? [name.split(' ').slice(0, -1).join(' '), name.split(' ').at(-1)] : [name];
    lines.forEach((value, i) => { const text = lineText(font, value, .19, material, 1.45); text.position.y = .32 - i*.25; back.add(text); });
    const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('.') : date;
    const text = lineText(font, dateLabel, .12, material, 1.35); text.position.y = -.15 - (lines.length-1)*.25;
    back.add(text);
    return back;
}
