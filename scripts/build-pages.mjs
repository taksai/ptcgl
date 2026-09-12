import {mkdir,rm,copyFile,readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),out=new URL('../dist/',import.meta.url);
await rm(out,{recursive:true,force:true});
for(const dir of ['src','examples','assets','data'])await mkdir(new URL(dir+'/',out),{recursive:true});
// Explicit public allowlist: never copy user logs, reference card data, or artwork.
for(const file of ['src/app.js','src/app.css','src/board.js','src/board.css','src/parser.js','src/local-assets.js','src/remote-cards.js','src/japanese-log.js','data/japanese-index.json','examples/demo.txt'])await copyFile(new URL(file,root),new URL(file,out));
const html=await readFile(new URL('index.html',root),'utf8');
await writeFile(new URL('index.html',out),html.replace('<head>','<head>\n<meta name="ptcgl-published" content="true">'));
await writeFile(new URL('assets/catalog.json',out),'{}');
await writeFile(new URL('.nojekyll',out),'');
console.log('Built public app in dist/ (no private logs or reference images).');
