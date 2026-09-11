// Read files into the current browser only. No upload or persistence.
export async function readLocalAssets(files){
  const list=Array.from(files);
  const catalogFile=list.find(file=>file.name==='catalog.json');
  if(!catalogFile)throw Error('catalog.json と cards_jp が入った assets フォルダを選択してください。');
  if(catalogFile.size>5000000)throw Error('カード辞書が大きすぎます。');
  const catalog=JSON.parse(await catalogFile.text());
  if(!catalog||typeof catalog!=='object'||Array.isArray(catalog))throw Error('カード辞書の形式が違います。');
  const pairList=value=>Array.isArray(value)&&value.every(pair=>Array.isArray(pair)&&pair.length===2&&pair.every(s=>typeof s==='string'));
  for(const rows of Object.values(catalog)){
    if(!Array.isArray(rows)||!rows.length||rows.some(r=>!r||typeof r.id!=='string'||!/^\d+$/.test(r.id)||typeof r.name!=='string'||typeof r.jp!=='string'||!Number.isFinite(r.hp)||!pairList(r.attacks)||!pairList(r.abilities)))throw Error('カード辞書の形式が違います。');
  }
  const images=new Map();
  for(const file of list){
    const m=(file.webkitRelativePath||file.name).match(/(?:^|\/)cards_jp\/(\d+)\.(jpg|png)$/i);
    if(m)images.set(m[1],file);
  }
  if(!images.size)throw Error('cards_jp 内にカード画像が見つかりませんでした。');
  return {catalog,images};
}
