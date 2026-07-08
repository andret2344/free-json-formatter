import {mkdir, readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = resolve(root, 'assets/icon.svg');
const outDir = resolve(root, 'icons');
const SIZES = [16, 48, 128];

const svg = await readFile(svgPath);
await mkdir(outDir, {recursive: true});

for (const size of SIZES) {
	const out = resolve(outDir, `icon${size}.png`);
	await sharp(svg, {density: 384})
		.resize(size, size, {fit: 'contain', background: {r: 0, g: 0, b: 0, alpha: 0}})
		.png()
		.toFile(out);
	console.log(`icons/icon${size}.png`);
}
