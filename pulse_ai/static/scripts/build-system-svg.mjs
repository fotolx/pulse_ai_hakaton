import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));

async function main() {
  const source2Path = path.join(root, 'img/map/system-okrug-2.svg');
  const source1Path = path.join(root, 'img/map/system-okrug.svg');

  const content2 = await readFile(source2Path, 'utf8');
  const content1 = await readFile(source1Path, 'utf8');

  // Извлекаем бейджи из исходного файла (строка 9 и строки 12-13)
  const lines1 = content1.split(/\r?\n/);
  const badge2Path = lines1[8]; // line 9 (0-indexed 8)
  const badge1Rect = lines1[11]; // line 12 (0-indexed 11)
  const badge1Path = lines1[12]; // line 13 (0-indexed 12)

  // Вставляем их со сдвигом -54.5 перед закрывающим тегом </svg>
  const badgesSvg = `  <g transform="translate(-54.5 0)" aria-hidden="true">
    ${badge1Rect}
    ${badge1Path}
  </g>
  <g transform="translate(-54.5 0)" aria-hidden="true">
    ${badge2Path}
  </g>
</svg>`;

  const updatedContent = content2.replace('</svg>', badgesSvg);

  await writeFile(source1Path, updatedContent, 'utf8');
  console.log('Successfully updated system-okrug.svg');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
