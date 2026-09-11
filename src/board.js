// Board structure adapted from kaggle_pokepoke_2's player.html; see PROVENANCE.md.
export const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let catalog={};
export function setCatalog(data){catalog=data;}
export function reference(c){return catalog[c.name]?.[0];}
export function cardName(c){return reference(c)?.jp || c.name;}
const el=(tag,cls,text)=>{const d=document.createElement(tag);d.className=cls;if(text!==undefined)d.textContent=text;return d;};
const energyLabels={Grass:'草',Fire:'炎',Water:'水',Lightning:'雷',Psychic:'超',Fighting:'闘',Darkness:'悪',Metal:'鋼'};
export function cardDetail(c){
  const r=reference(c);
  const details=el('div','card-detail');
  details.innerHTML=`<h2>${esc(cardName(c))}</h2><p>${esc(c.name)} · ${esc(c.id)}</p>`;
  if(r){
    const im=el('img','detail-image');im.src=`assets/cards_jp/${encodeURIComponent(r.id)}.jpg`;im.alt=r.jp;im.onerror=()=>im.remove();details.append(im);
    const text=el('div','detail-text');text.innerHTML=`<p class="reference-note">同名カードを照合した参考情報。セット・券面の一致は保証されません。</p>${r.hp?`<p>参考HP ${r.hp}（効果による補正なし）</p>`:''}`;
    for(const [name,description] of [...r.abilities,...r.attacks]){const h=el('h3','',name),p=el('p','',description);text.append(h,p);} details.append(text);
  }else details.append(el('p','','カード辞書にないカードです。ログに記載された名前で表示しています。'));
  if(c.uid){details.append(el('p','',`盤面の個体 #${c.uid} · 累計ダメージ ${c.damage}${c.uncertain?' · 個体の対応は仮置き':''}`));
    details.append(el('p','',`付属カード: ${[...c.energyCards,...c.tools].map(cardName).join(' / ')||'なし'}`));
    details.append(el('p','',`進化元: ${c.prev.map(cardName).join(' → ')||'なし'}`));}
  return details;
}
function plainCard(c,size='',open){
  const d=el('button','card '+size);d.type='button';d.title=`${cardName(c)} (${c.id}) — クリックで詳細`;
  const r=reference(c);
  if(r){const im=new Image();im.onload=()=>{d.style.backgroundImage=`url("${im.src}")`;d.classList.add('has-img');};im.src=`assets/cards_jp/${encodeURIComponent(r.id)}.jpg`;}
  d.append(el('span','nm',cardName(c)));d.onclick=()=>open(c);return d;
}
function monSlot(mon,size,open){
  const w=el('div','monslot'),d=plainCard(mon,size,open);w.append(d);
  if(mon.energyCards.length){const badge=el('span','en');badge.textContent=mon.energyCards.map(c=>energyLabels[c.name.split(' ')[1]]||'特').join(' ');badge.title='付属エネルギーカード '+mon.energyCards.length+'枚（供給エネルギー数とは異なります）';d.append(badge);}
  if(mon.damage)w.append(el('span','damage-badge',`${mon.damage}${mon.damageUncertain?' + ?':''} dmg`));
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
export function renderBoard(body,cur,perspective,open){
  body.replaceChildren();const top=1-perspective,bottom=perspective;
  const f=el('div','field'),frame=el('div','fieldframe');f.append(frame);
  const put=(area,node)=>{node.classList.add('fa');node.style.gridArea=area;f.append(node);};
  for(const [pi,prefix] of [[top,'o'],[bottom,'m']]){
    const p=cur.players[pi];put(prefix+'hand',handRow(p,open));put(prefix+'bench',benchRow(p,open));put(prefix+'panel',panel(cur,pi,open));put(prefix+'prize',prizeCol(p));put(prefix+'name',el('div','fieldname',p.name));
  }
  const center=el('div','center'),ball=el('div','pokeball');ball.innerHTML='<div class="ball-h"></div><div class="ball-core"></div>';center.append(ball);
  const actives=el('div','actives');
  [top,bottom].forEach(pi=>{const wrap=el('div','act');if(cur.players[pi].active.length)cur.players[pi].active.forEach(m=>wrap.append(monSlot(m,'big',open)));else wrap.append(el('div','slot empty-act'));actives.append(wrap);});center.append(actives);
  const stadium=el('div','stadium');stadium.append(el('div','stlabel','スタジアム'));cur.stadium.forEach(c=>stadium.append(plainCard(c,'mini',open)));center.append(stadium);put('center',center);body.append(f);
}
