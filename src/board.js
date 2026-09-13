import {japaneseName,resolveJapaneseCard} from './remote-cards.js';
// Board structure adapted from kaggle_pokepoke_2's player.html; see PROVENANCE.md.
export const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let catalog=new Map(),localImages=null;
const imageUrls=new Map();
export function setLocalImages(files){
  for(const url of imageUrls.values())URL.revokeObjectURL(url);
  imageUrls.clear();localImages=files;
}
function imageUrl(r){
  if(!localImages)return `assets/cards_jp/${encodeURIComponent(r.id)}.jpg`;
  if(!localImages.has(r.id))return null;
  if(!imageUrls.has(r.id))imageUrls.set(r.id,URL.createObjectURL(localImages.get(r.id)));
  return imageUrls.get(r.id);
}
const basicEnergyTypes={Grass:'G',Fire:'R',Water:'W',Lightning:'L',Psychic:'P',Fighting:'F',Darkness:'D',Metal:'M'};
function normalizedName(name){
  return name.replace(/[’‘]/g,"'").trim().replace(/^Basic (Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal) Energy$/,(_,type)=>`Basic {${basicEnergyTypes[type]}} Energy`);
}
export function setCatalog(data){catalog=new Map(Object.entries(data).map(([name,cards])=>[normalizedName(name),cards]));}
export function reference(c){return catalog.get(normalizedName(c.name))?.[0];}
export function cardName(c){return reference(c)?.jp || japaneseName(c.name);}
const el=(tag,cls,text)=>{const d=document.createElement(tag);d.className=cls;if(text!==undefined)d.textContent=text;return d;};
const energyLabels={Grass:'草',Fire:'炎',Water:'水',Lightning:'雷',Psychic:'超',Fighting:'闘',Darkness:'悪',Metal:'鋼'};
const artworkCache=new Map();
export function resetArtwork(){artworkCache.clear();}
function verifyImage(url){return new Promise(resolve=>{const im=new Image();im.referrerPolicy='no-referrer';const timer=setTimeout(()=>resolve(false),7000);im.onload=()=>{clearTimeout(timer);resolve(true);};im.onerror=()=>{clearTimeout(timer);resolve(false);};im.src=url;});}
async function artwork(c){
  const local=reference(c),localUrl=local&&imageUrl(local);
  const key=(localUrl||'remote')+'|'+c.id+'|'+c.name;
  if(!artworkCache.has(key))artworkCache.set(key,(async()=>{
    if(localUrl&&await verifyImage(localUrl))return {low:localUrl,high:localUrl,label:'手元の日本語参考券面'};
    for await(const remote of resolveJapaneseCard(c)){
      const low=remote.image+'/low.webp';
      if(await verifyImage(low))return {...remote,low,high:remote.image+'/high.webp'};
    }
    return null;
  })());
  return artworkCache.get(key);
}
export function cardDetail(c){
  const r=reference(c),details=el('div','card-detail');
  details.innerHTML=`<h2>${esc(cardName(c))}</h2><p>${esc(c.name)} · ${esc(c.id)}</p>`;
  const imageBox=el('div','detail-artwork'),caption=el('p','reference-note','日本語画像を読み込み中…');details.append(imageBox,caption);
  artwork(c).then(art=>{
    if(!art){caption.textContent='日本語画像を取得できませんでした。カード名とログの情報で表示しています。';return;}
    const im=el('img','detail-image');im.referrerPolicy='no-referrer';im.alt=cardName(c);im.onerror=()=>{im.onerror=null;im.src=art.low;};im.src=art.high;imageBox.append(im);caption.textContent=art.label;
    if(!r&&art.data){
      const text=el('div','detail-text');
      if(art.data.hp)text.append(el('p','',`参考HP ${art.data.hp}`));
      for(const a of [...(art.data.abilities||[]),...(art.data.attacks||[])]){text.append(el('h3','',a.name),el('p','',a.effect||''));}details.append(text);
    }
  }).catch(()=>{caption.textContent='日本語画像を取得できませんでした。';});
  if(r){
    const text=el('div','detail-text');text.innerHTML=`<p class="reference-note">同名カードの参考情報。セット・券面の一致は保証されません。</p>${r.hp?`<p>参考HP ${r.hp}</p>`:''}`;
    for(const [name,description] of [...r.abilities,...r.attacks])text.append(el('h3','',name),el('p','',description));details.append(text);
  }
  if(c.uid){details.append(el('p','',`盤面の個体 #${c.uid} · 累計ダメージ ${c.damage}${c.uncertain?' · 個体の対応は仮置き':''}`));
    details.append(el('p','',`付属カード: ${[...c.energyCards,...c.tools].map(cardName).join(' / ')||'なし'}`));
    details.append(el('p','',`進化元: ${c.prev.map(cardName).join(' → ')||'なし'}`));}
  return details;
}
function plainCard(c,size='',open){
  const d=el('button','card '+size);d.type='button';d.title=`${cardName(c)} (${c.id}) — タップで拡大`;d.dataset.cardId=c.id;d.dataset.imageState='loading';
  artwork(c).then(art=>{if(art){d.style.backgroundImage=`url("${art.low}")`;d.classList.add('has-img');d.dataset.imageState='loaded';d.title+=` · ${art.label}`;}else d.dataset.imageState='unavailable';}).catch(()=>{d.dataset.imageState='unavailable';});
  d.append(el('span','nm',cardName(c)));d.onclick=()=>open(c);return d;
}
function monSlot(mon,size,open){
  const w=el('div','monslot'),d=plainCard(mon,size,open);w.append(d);
  if(mon.energyCards.length){const badge=el('span','en');badge.textContent=mon.energyCards.map(c=>energyLabels[c.name.split(' ')[1]]||'特').join(' ');badge.title='付属エネルギーカード '+mon.energyCards.length+'枚（供給エネルギー数とは異なります）';d.append(badge);}
  if(mon.damage)w.append(el('span','damage-badge',`${mon.damage}${mon.damageUncertain?' + ?':''} ダメージ`));
  if(mon.uncertain)w.append(el('span','uncertain-badge','?'));
  return w;
}
function benchRow(p,open){
  const row=el('div','bench');
  for(let i=0;i<Math.max(5,p.bench.length);i++){const slot=el('div','slot'+(p.bench[i]?' filled':''));if(p.bench[i])slot.append(monSlot(p.bench[i],'',open));row.append(slot);}return row;
}
function handRow(p,open){
  const row=el('div','hand');row.append(el('span','hand-label',`手札 ${p.handCount??'?'}枚`));p.hand.forEach(c=>row.append(plainCard(c,'mini',open)));
  const unknown=p.handCount===null?null:Math.max(0,p.handCount-p.hand.length);
  if(unknown || unknown===null)row.append(el('div','hidden-hand',unknown===null?'非公開・枚数不明':`非公開 ${unknown}枚`));return row;
}
function prizeCol(p){
  const col=el('div','prize');col.append(el('div','prize-label',`残りサイド ${p.prizeCount??'?'}`));
  for(let i=0;i<Math.min(12,p.prizeCount||0);i++)col.append(el('div','card mini back'));return col;
}
function panel(cur,pi,open){
  const p=cur.players[pi],d=el('div','panel'+(cur.yourIndex===pi?' turn':''));
  d.append(el('div','pname',p.name),el('div','porder',cur.firstPlayer===null?'先後不明':cur.firstPlayer===pi?'先攻':'後攻'),el('div','pnum',`山札 ${p.deckCount??'?'}`));
  const trash=el('details','discard-details'),summary=el('summary','',`トラッシュ ${p.discard.length}（記録分）`),list=el('div','discard-list');
  p.discard.forEach(c=>list.append(plainCard(c,'mini',open)));trash.append(summary,list);d.append(trash);
  if(cur.yourIndex===pi)d.append(el('div','pturn','● 現在の手番'));return d;
}
let boardResize=null;
export function renderBoard(body,cur,perspective,open){
  boardResize?.disconnect();
  body.replaceChildren();const top=1-perspective,bottom=perspective;
  const f=el('div','field'),frame=el('div','fieldframe');f.append(frame);
  const put=(area,node)=>{node.classList.add('fa');node.style.gridArea=area;f.append(node);};
  for(const [pi,prefix] of [[top,'o'],[bottom,'m']]){
    const p=cur.players[pi];put(prefix+'hand',handRow(p,open));put(prefix+'bench',benchRow(p,open));put(prefix+'panel',panel(cur,pi,open));put(prefix+'prize',prizeCol(p));put(prefix+'name',el('div','fieldname',p.name));
  }
  const center=el('div','center'),ball=el('div','pokeball');ball.innerHTML='<div class="ball-h"></div><div class="ball-core"></div>';center.append(ball);
  const actives=el('div','actives');
  [top,bottom].forEach(pi=>{const wrap=el('div','act');if(cur.players[pi].active.length)cur.players[pi].active.forEach(m=>wrap.append(monSlot(m,'big',open)));else wrap.append(el('div','slot empty-act'));actives.append(wrap);});center.append(actives);
  const stadium=el('div','stadium');stadium.append(el('div','stlabel','スタジアム'));cur.stadium.forEach(c=>stadium.append(plainCard(c,'mini',open)));center.append(stadium);put('center',center);
  const viewport=el('div','field-viewport');viewport.append(f);body.append(viewport);
  const fit=()=>{
    const narrow=window.matchMedia('(max-width:760px)').matches;
    f.style.width=narrow?'550px':'';
    const scale=narrow?Math.min(1,viewport.clientWidth/550):1;
    f.style.transform=scale<1?`scale(${scale})`:'';f.style.transformOrigin='top left';
    viewport.style.height=scale<1?`${f.offsetHeight*scale}px`:'';
  };
  requestAnimationFrame(fit);
  if(window.ResizeObserver){boardResize=new ResizeObserver(fit);boardResize.observe(body);}

}
