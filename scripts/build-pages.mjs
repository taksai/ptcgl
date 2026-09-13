import {createHash} from 'node:crypto';
import {mkdir,rm,readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),out=new URL('../dist/',import.meta.url);
await rm(out,{recursive:true,force:true});
for(const dir of ['src','examples','assets','data'])await mkdir(new URL(dir+'/',out),{recursive:true});
// Explicit public allowlist: never copy user logs, reference card data, or artwork.
const files=['src/app.js','src/app.css','src/board.js','src/board.css','src/parser.js','src/local-assets.js','src/remote-cards.js','src/japanese-log.js','data/japanese-index.json','examples/demo.txt'];
const sources=await Promise.all(files.map(file=>readFile(new URL(file,root),'utf8')));
const version=createHash('sha256').update(sources.join('\0')).digest('hex').slice(0,12);
for(const [i,file] of files.entries()){
  // Version every module dependency so a mobile browser cannot mix deployments.
  const content=file.endsWith('.js')?sources[i].replace(/from (['"])(\.[^'"]+\.js)\1/g,(_,quote,path)=>`from ${quote}${path}?v=${version}${quote}`):sources[i];
  await writeFile(new URL(file,out),content);
}
const html=await readFile(new URL('index.html',root),'utf8');
await writeFile(new URL('index.html',out),html.replace('<head>','<head>\n<meta name="ptcgl-published" content="true">').replace(/(src|href)="(src\/[^"]+)"/g,(_,attr,path)=>`${attr}="${path}?v=${version}"`));
await writeFile(new URL('assets/catalog.json',out),'{}');
await writeFile(new URL('.nojekyll',out),'');
console.log('Built public app in dist/ (no private logs or reference images).');
