import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'src', 'agents', 'src', 'renderer');
const target = path.join(root, 'dist', 'agents', 'renderer');

await fs.rm(target, { recursive: true, force: true });
await fs.mkdir(path.dirname(target), { recursive: true });
await fs.cp(source, target, { recursive: true });

console.log(`Copied AI Agent renderer to ${path.relative(root, target)}`);
