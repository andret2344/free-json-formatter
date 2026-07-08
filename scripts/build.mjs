import {existsSync} from 'node:fs';
import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build, context} from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(root, 'dist');

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const targetArg = args.find((a) => a.startsWith('--target='));
const targets = targetArg ? [targetArg.split('=')[1]] : ['chromium', 'firefox'];

const GECKO_ID = 'free-json-formatter@andret2344';

/** Produce a per-browser manifest. Firefox (Gecko) needs an explicit extension id. */
function manifestFor(target, base) {
	const m = structuredClone(base);
	if (target === 'firefox') {
		m.browser_specific_settings = {
			gecko: {
				id: GECKO_ID,
				strict_min_version: '115.0',
				// AMO requires an explicit data-collection declaration; this extension collects nothing.
				data_collection_permissions: {
					required: ['none']
				}
			}
		};
	}
	return m;
}

const STATIC_FILES = ['content.css', 'popup.html', 'popup.css'];

async function copyStatic(target, outdir, baseManifest) {
	await writeFile(
		resolve(outdir, 'manifest.json'),
		`${JSON.stringify(manifestFor(target, baseManifest), null, 2)}\n`
	);
	for (const file of STATIC_FILES) {
		await cp(resolve(root, 'src', file), resolve(outdir, file));
	}
	const icons = resolve(root, 'icons');
	if (existsSync(icons)) {
		await cp(icons, resolve(outdir, 'icons'), {recursive: true});
	}
}

function esbuildOptions(outdir) {
	return {
		entryPoints: [resolve(root, 'src/content.ts'), resolve(root, 'src/popup.ts')],
		bundle: true,
		format: 'iife',
		target: 'es2020',
		outdir,
		entryNames: '[name]',
		logLevel: 'info'
	};
}

async function buildTarget(target, baseManifest) {
	const outdir = resolve(distRoot, target);
	await mkdir(outdir, {recursive: true});
	await copyStatic(target, outdir, baseManifest);
	const options = esbuildOptions(outdir);
	if (watch) {
		const ctx = await context(options);
		await ctx.watch();
		console.log(`watching ${target}…`);
	} else {
		await build(options);
		console.log(`built -> dist/${target}/`);
	}
}

await rm(distRoot, {recursive: true, force: true});
const baseManifest = JSON.parse(await readFile(resolve(root, 'src/manifest.json'), 'utf8'));
for (const target of targets) {
	await buildTarget(target, baseManifest);
}
