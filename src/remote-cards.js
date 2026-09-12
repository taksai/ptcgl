// Card IDs go to the public TCGdex API; battle text and player names never do.
let dictionary={names:{},moves:{},cards:{}};
export const normalize=name=>String(name??'').normalize('NFKC').replace(/[’‘]/g,"'").replace(/[【】]/g,'').trim();
export function setJapaneseIndex(data){dictionary=data;}
export function japaneseName(name){return dictionary.names[normalize(name)]||name;}
export function japaneseMove(name){return dictionary.moves[normalize(name)]||name;}
export function remoteCardId(id){
  const m=String(id).match(/^(sv|me|swsh)(\d+)(?:-(5)([bw])?)?_(\d+)(?:_[a-z]+)?$/i);
  if(m){const family=m[1].toLowerCase();return `${family}${family==='swsh'?Number(m[2]):m[2].padStart(2,'0')}${m[3]?'.5'+(m[4]||''):''}-${m[5].padStart(family==='swsh'?1:3,'0')}`;}
  const s=String(id).match(/^(mee|sve|svp|mep)_(\d+)(?:_[a-z]+)?$/i);
  return s?`${s[1].toLowerCase()}-${s[2].padStart(3,'0')}`:null;
}
const cleanName=name=>normalize(name).replace(/^Basic /,'').toLowerCase();
export function matchesJapanese(en,ja,name){
  if(!en||!ja||normalize(ja.name).replace(/\s/g,'')!==normalize(name).replace(/\s/g,'')||en.category!==ja.category)return false;
  if(en.category!=='Pokemon')return true;
  const attacks=c=>(c.attacks||[]).map(a=>({cost:[...(a.cost||[])].sort(),damage:String(a.damage??'')}));
  return en.hp===ja.hp&&en.stage===ja.stage&&en.retreat===ja.retreat&&JSON.stringify(attacks(en))===JSON.stringify(attacks(ja));
}
export function japaneseImageBase(card){
  if(typeof card.image==='string'){
    try{const url=new URL(card.image);if(url.protocol==='https:'&&url.hostname==='assets.tcgdex.net'&&url.pathname.startsWith('/ja/')&&!url.search&&!url.hash&&!url.username&&!url.password)return url.href;}catch{}
    return null;
  }
  // Some Japanese records omit image even though their documented CDN asset exists.
  const m=String(card.id).match(/^((?:SV|SM|S|M)[A-Za-z0-9-]*)-(\d+)$/);
  if(!m)return null;
  const family=m[1].startsWith('SV')?'SV':m[1].startsWith('SM')?'SM':m[1].startsWith('S')?'S':'M';
  return `https://assets.tcgdex.net/ja/${family}/${m[1]}/${m[2]}`;
}
const preferredSets={sv5:['SV5K','SV5M'],sv6:['SV6'],'sv6-5':['SV6a'],sv7:['SV7'],sv8:['SV8'],'sv8-5':['SV8a'],sv9:['SV9'],sv10:['SV10'],me1:['M1L','M1S'],me2:['M2'],me3:['M3']};
export function createJapaneseResolver(fetcher=globalThis.fetch){
  const cache=new Map(),queue=[];let active=0;
  function pump(){while(active<6&&queue.length){const {task,resolve}=queue.shift();active++;Promise.resolve().then(task).catch(()=>null).then(resolve).finally(()=>{active--;pump();});}}
  function request(lang,id){
    const key=lang+'/'+id;
    if(!cache.has(key))cache.set(key,new Promise(resolve=>{queue.push({resolve,task:async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
      try{const r=await fetcher(`https://api.tcgdex.net/v2/${lang}/cards/${encodeURIComponent(id)}`,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});return r.ok?await r.json():null;}finally{clearTimeout(timer);}
    }});pump();}));
    return cache.get(key);
  }
  return async function* resolve(card){
    const id=remoteCardId(card.id);if(!id)return;
    const en=await request('en',id);
    if(!en||cleanName(en.name)!==cleanName(card.name))return;
    const name=japaneseName(card.name),candidates=dictionary.cards[normalize(name).replace(/\s/g,'')]||[];
    const sets=preferredSets[String(card.id).split('_')[0]]||[];
    const rank=c=>sets.some(s=>c.id.startsWith(s+'-'))?0:c.image?1:2;
    const ordered=[...candidates].sort((a,b)=>rank(a)-rank(b));
    // Limit failed lookups for unsupported printings. No unrelated-name fallback.
    for(const brief of ordered.slice(0,18)){
      const ja=await request('ja',brief.id);
      if(!matchesJapanese(en,ja,name))continue;
      const image=japaneseImageBase(ja);
      if(image)yield {image,id:ja.id,name:ja.name,data:ja,label:'日本語参考券面 · TCGdex（HP・ワザ構成を照合）'};
    }
  };
}
export const resolveJapaneseCard=createJapaneseResolver();
