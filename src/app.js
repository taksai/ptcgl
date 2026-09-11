import {parseLog,summarizeTurns} from './parser.js';
import {esc,setCatalog,cardName,cardDetail,renderBoard} from './board.js';
const $=id=>document.getElementById(id);
let replay=null,cur=0,timer=null,raw='',catalogReady=Promise.resolve();
const typeNames={setup:'セットアップ',turn:'ターン開始',play:'カードを使う',ability:'特性・効果',evolve:'進化',attach:'エネルギー・どうぐ',attack:'ワザ',counters:'ダメカン',ko:'きぜつ',prize:'サイド取得',draw:'手札に加える',search:'山札から場に出す',shuffle:'山札に戻す',discard:'トラッシュ',recover:'回収',retreat:'にげる',promote:'バトル場へ',coin:'コイン',result:'対戦終了',info:'進行',other:'未対応'};
function error(message){$('error').textContent=message;$('error').hidden=!message;}
function stop(){clearTimeout(timer);timer=null;$('play').textContent='再生';}
function start(){
  if(!replay)return;if(timer){stop();return;}
  if(cur===replay.frames.length-1)goto(0);
  $('play').textContent='停止';
  const tick=()=>{if(cur>=replay.frames.length-1){stop();return;}goto(cur+1,false);timer=setTimeout(tick,Number($('speed').value));};
  timer=setTimeout(tick,Number($('speed').value));
}
function openCard(c){$('cardDetail').replaceChildren(cardDetail(c));$('cardDialog').showModal();}
function goto(index,pause=true){if(!replay)return;if(pause)stop();cur=Math.max(0,Math.min(replay.frames.length-1,index));render();}
function render(){
  const fr=replay.frames[cur],e=fr.event;
  renderBoard($('boardBody'),fr.current,Number($('perspective').value),openCard);
  $('turnLabel').textContent=e.turn?`TURN ${e.turn} · ${replay.names[fr.current.yourIndex]}`:'SETUP';
  $('slider').value=cur;$('stepLabel').textContent=`${cur+1} / ${replay.frames.length}`;
  $('prev').disabled=$('first').disabled=cur===0;$('next').disabled=$('last').disabled=cur===replay.frames.length-1;
  $('lineLabel').textContent=`原文 ${e.line}行目`;$('eventLabel').textContent=typeNames[e.type]||e.type;$('rawEvent').textContent=e.raw;
  $('eventWarning').replaceChildren(...fr.warnings.map(w=>{const p=document.createElement('p');p.textContent='⚠ '+w.message;return p;}));
  $('jsonState').textContent=JSON.stringify(fr.current,null,2);
  document.querySelectorAll('.event-row.current').forEach(n=>n.classList.remove('current'));
  const row=$('timeline').querySelector(`[data-frame="${cur}"]`);
  if(row){row.classList.add('current');const container=$('timeline');if(row.offsetTop<container.scrollTop || row.offsetTop+row.offsetHeight>container.scrollTop+container.clientHeight)container.scrollTop=row.offsetTop-container.clientHeight/2;}
}
function renderTimeline(){
  const query=$('search').value.toLowerCase(),kind=$('kind').value,fragment=document.createDocumentFragment();let count=0;
  replay.frames.forEach((fr,i)=>{
    const e=fr.event;
    if(query&&!e.raw.toLowerCase().includes(query))return;
    if(kind==='warning'?!fr.warnings.length:kind!=='all'&&kind!==e.type)return;
    const button=document.createElement('button');button.className='event-row'+(e.type==='turn'?' turn-row':'')+(fr.warnings.length?' flagged':'')+(i===cur?' current':'');button.dataset.frame=i;
    button.innerHTML=`<span class="event-meta">${e.line}行 · ${esc(typeNames[e.type])}${fr.warnings.length?' · ⚠':''}</span>${esc(e.text)}`;button.onclick=()=>goto(i);fragment.append(button);count++;
  });
  if(!count){const p=document.createElement('p');p.className='fine-print';p.textContent='一致する行動はありません。';fragment.append(p);}
  $('timeline').replaceChildren(fragment);$('eventCount').textContent=`${count}件`;
}
function jumpTo(index){$('search').value='';$('kind').value='all';renderTimeline();goto(index);}
function renderAnalysis(){
  const final=replay.frames.at(-1).current;
  $('stats').innerHTML=final.players.map(p=>`<section class="stat-player"><h3>${esc(p.name)}${p.name===replay.winner?' · WIN':''}</h3><div class="stat-grid"><div><b>${p.stats.prizes}</b><span>取得サイド</span></div><div><b>${p.stats.damage}</b><span>ワザダメージ</span></div><div><b>${p.stats.knockouts}</b><span>きぜつ獲得</span></div></div><div class="stat-extra">残りサイド ${p.prizeCount??'?'} · ダメカン ${p.stats.counters}<br>コイン 表 ${p.stats.heads} / 裏 ${p.stats.tails}</div></section>`).join('');
  const turns=summarizeTurns(replay),max=Math.max(1,...turns.map(t=>t.damage));
  $('turns').replaceChildren(...turns.map(t=>{const b=document.createElement('button');b.className='turn-row-btn';b.innerHTML=`<span>${esc(replay.names[t.player])} · ${t.number}ターン</span><span>${t.damage} dmg / サイド ${t.prizes}</span><span class="damage-track"><span class="damage-fill" style="width:${t.damage/max*100}%"></span></span>`;b.onclick=()=>jumpTo(t.frame);return b;}));
  const usage=[...replay.usage].sort((a,b)=>(b.plays+b.abilities+b.attacks)-(a.plays+a.abilities+a.attacks));
  $('usage').innerHTML='<table class="usage-table"><thead><tr><th>カード / 使用者</th><th>使用</th><th>特性</th><th>ワザ</th></tr></thead><tbody>'+usage.map(c=>`<tr><td>${esc(cardName(c))}<br><span class="fine-print">${esc(replay.names[c.player])}</span></td><td>${c.plays}</td><td>${c.abilities}</td><td>${c.attacks}</td></tr>`).join('')+'</tbody></table>';
  $('warnings').querySelector('summary').textContent=`要確認 ${replay.warnings.length}件（不明な個体・原文の矛盾）`;
  $('warningList').replaceChildren(...replay.warnings.map(w=>{const b=document.createElement('button');b.className='warning-link';b.textContent=`${w.line}行: ${w.message}`;b.onclick=()=>jumpTo(w.frame);return b;}));
}
async function load(text){
  stop();error('');
  try{
    await catalogReady;
    const parsed=parseLog(text); // Keep an existing valid review when a new input is invalid.
    replay=parsed;raw=text;cur=0;
    $('workspace').hidden=false;$('empty').hidden=true;$('inputPane').hidden=true;$('closeInput').hidden=false;
    $('matchTitle').textContent=replay.names.join('  vs  ');
    const unsupported=replay.warnings.filter(w=>w.kind==='unsupported').length;
    $('matchMeta').textContent=`${replay.winner?'勝者 '+replay.winner:'勝敗未記録'} · ${replay.turns.length}ターン · ${replay.frames.length}行動 · 未対応 ${unsupported}行 · 要確認 ${replay.warnings.length}件`;
    $('perspective').innerHTML=replay.names.map((n,i)=>`<option value="${i}">${esc(n)}</option>`).join('');$('perspective').value=replay.perspective;
    $('slider').max=replay.frames.length-1;renderTimeline();renderAnalysis();render();
  }catch(e){error(e.message||'ログを読み込めませんでした。');}
}
$('analyze').onclick=()=>load($('logInput').value);
$('openInput').onclick=()=>{$('inputPane').hidden=false;$('logInput').focus();};
$('closeInput').onclick=()=>{$('inputPane').hidden=true;};
$('sample').onclick=async()=>{try{let res=await fetch('examples/sample.txt');if(!res.ok)res=await fetch('examples/demo.txt');if(!res.ok)throw Error('サンプルを読み込めませんでした。');const text=await res.text();$('logInput').value=text;await load(text);}catch(e){error(e.message);}};
$('file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>500000)throw Error('ログは500 KB以内で読み込んでください。');const text=await file.text();$('logInput').value=text;await load(text);}catch(e){error(e.message);}finally{e.target.value='';}};
$('perspective').onchange=()=>render();$('slider').oninput=e=>goto(Number(e.target.value));
$('first').onclick=()=>goto(0);$('last').onclick=()=>goto(replay.frames.length-1);$('prev').onclick=()=>goto(cur-1);$('next').onclick=()=>goto(cur+1);$('play').onclick=start;
$('search').oninput=()=>{if(replay)renderTimeline();};$('kind').onchange=()=>{if(replay)renderTimeline();};
$('closeCard').onclick=()=>$('cardDialog').close();$('cardDialog').addEventListener('click',e=>{if(e.target===$('cardDialog'))$('cardDialog').close();});
$('download').onclick=()=>{const blob=new Blob([JSON.stringify({...replay,raw},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ptcgl-analysis.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
document.addEventListener('keydown',e=>{if(!replay||e.target.closest('input,textarea,select,button,summary,[contenteditable]')||$('cardDialog').open)return;if(e.key==='ArrowLeft'){e.preventDefault();goto(cur-1);}if(e.key==='ArrowRight'){e.preventDefault();goto(cur+1);}if(e.code==='Space'){e.preventDefault();start();}});
catalogReady=fetch('assets/catalog.json').then(r=>r.ok?r.json():null).then(data=>{if(data)setCatalog(data);}).catch(()=>{});
if(new URLSearchParams(location.search).get('sample')==='1')$('sample').click();
