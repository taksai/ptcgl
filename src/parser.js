// PTCGL text -> immutable event snapshots. No game engine or external requests.
const clone = value => structuredClone(value);
const norm = text => text.replace(/[’‘]/g, "'").replace(/\r/g, '');
const C = '\\(([\\w-]+)\\) (.+?)';
const rx = pattern => new RegExp('^' + pattern + '$');
const ref = (id, name) => ({ id, name: name.replace(/\.$/, '').trim() });
const same = (a,b) => a?.id === b?.id;
export function cardsIn(text) {
  return [...text.matchAll(/\(([\w-]+)\) (.*?)(?=,\s*\([\w-]+\)|$)/g)].map(m => ref(m[1], m[2]));
}
function eventsFrom(text) {
  const events = [];
  text.split('\n').forEach((raw, i) => {
    const clean = norm(raw).trim();
    if (!clean) return;
    if (/^(•|-?\s*(Damage breakdown:|\d+ drawn cards\.))/.test(clean)) {
      if (events.length) { events.at(-1).raw += '\n' + raw; if (clean.startsWith('•')) events.at(-1).cards.push(...cardsIn(clean.slice(1).trim())); }
      return;
    }
    events.push({ line:i+1, text:clean.replace(/^-\s*/, ''), raw, cards:[], effect:clean.startsWith('-'), type:'other' });
  });
  return events;
}
export function parseLog(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('PTCGLの対戦ログを貼り付けてください。');
  if (text.length > 500000) throw new Error('ログは500 KB以内で読み込んでください。');
  const events = eventsFrom(text);
  if (events.filter(e=>e.text==='Setup').length > 1 || events.some((e,i)=>/ wins\.$/.test(e.text) && events.slice(i+1).some(next=>/'s Turn$/.test(next.text)))) throw new Error('1対戦分のログだけを貼り付けてください。');
  const names = [...new Set(events.flatMap(e => {
    const m = e.text.match(/^(.*?)'s Turn$/) || e.text.match(/^(.*?) drew 7 cards for the opening hand\.$/);
    return m ? [m[1]] : [];
  }))];
  if (names.length !== 2) throw new Error('2人分の「プレイヤー名\'s Turn」がある1対戦分の英語ログを貼り付けてください。');
  const completeSetup = events.some(e => e.text === 'Setup') && names.every(n => events.some(e => e.text === `${n} drew 7 cards for the opening hand.`));
  const players = names.map(name => ({name, active:[], bench:[], hand:[], handCount:completeSetup?0:null, deckCount:completeSetup?54:null,
    prizeCount:completeSetup?6:null, discard:[], stats:{damage:0, counters:0, attacks:0, knockouts:0, prizes:0, draws:0, attachments:0, heads:0, tails:0}, turn:0}));
  const state = {players, stadium:[], firstPlayer:null, yourIndex:null, turn:0, turnActionCount:0, winner:null};
  const warnings = [], frames = [], turns = [], usage = new Map();
  let serial = 0, event, frameIndex = 0, lastRetreated = null, lastEffect = null, pendingKO = null;
  const pi = name => names.indexOf(name);
  const warn = (message, kind='uncertain') => {
    const w = {line:event?.line || 1, frame:frameIndex, message, kind};
    if (!warnings.some(x => x.line === w.line && x.message === message)) warnings.push(w);
  };
  if (!completeSetup) warn('セットアップがないため、手札・山札・残りサイドの総数は不明です。');
  const count = (p,key,delta) => {
    if (p[key] === null) return;
    p[key] += delta;
    if (p[key] < 0) { warn(`${p.name}の${key}がログと矛盾したため、枚数を不明にしました。`); p[key] = null; }
  };
  const takeHand = (p, cards=[], n=cards.length) => {
    for (const c of cards) {
      const index = p.hand.findIndex(x => same(x,c));
      if (index >= 0) p.hand.splice(index,1);
      else if (p.handCount !== null && p.handCount <= p.hand.length) {
        warn(`${p.name}の手札に${c.name}を確認できないため、既知の手札内容をリセットしました。`);
        p.hand = [];
      }
    }
    count(p,'handCount',-n);
    // Unknown removals make the identities of the remaining hand uncertain.
    if (n > cards.length) p.hand = [];
    if (p.handCount !== null && p.hand.length > p.handCount) p.hand = [];
  };
  const addHand = (p,cards,n=cards.length) => { p.hand.push(...clone(cards)); count(p,'handCount',n); };
  const newMon = c => ({...clone(c), uid:++serial, damage:0, energyCards:[], tools:[], prev:[], uncertain:false});
  const locate = (owner,c,zone,preferred) => {
    if (owner < 0) return null;
    const p = players[owner];
    let candidates = (zone==='active' ? p.active : zone==='bench' ? p.bench : [...p.active,...p.bench]).filter(x=>same(x,c));
    if (!candidates.length) { warn(`${p.name}の${zone || '場'}に${c.name}を確認できません。盤面への反映を保留しました。`); return null; }
    if (candidates.length > 1) {
      candidates.forEach(x=>x.uncertain=true);
      warn(`${p.name}の${c.name}が複数あります。個体の対応は仮置きです（ダメージ・エネルギー・進化先は要確認）。`);
      if (preferred) candidates = [...candidates].sort((a,b)=>preferred(b)-preferred(a));
    }
    return candidates[0];
  };
  const removeMon = (p,mon) => { p.active=p.active.filter(x=>x.uid!==mon.uid); p.bench=p.bench.filter(x=>x.uid!==mon.uid); };
  const use = (owner,c,kind) => {
    if (owner<0) return;
    const key=owner+'|'+c.id;
    if (!usage.has(key)) usage.set(key,{player:owner,...c,plays:0,abilities:0,attacks:0});
    usage.get(key)[kind]++;
  };
  for (event of events) {
    frameIndex=frames.length;
    const t=event.text;
    const owner=names.findIndex(n => t.startsWith(n+' ') || t.startsWith(n+"'s "));
    const p=players[owner];
    let m;
    if (t==='Setup') event.type='setup';
    else if ((m=t.match(/^(.*?)'s Turn$/))) {
      state.yourIndex=pi(m[1]); state.turn++; state.turnActionCount=0; players[state.yourIndex].turn++;
      if (state.firstPlayer===null) state.firstPlayer=state.yourIndex;
      event.type='turn'; turns.push({frame:frameIndex,player:state.yourIndex,number:players[state.yourIndex].turn,global:state.turn});
      lastEffect=null; lastRetreated=null;
    }
    else if (/chose (heads|tails) for the opening coin flip\.|won the coin toss\.|ended their turn\.|shuffled their deck\.$/.test(t)) event.type='info';
    else if ((m=t.match(/^(.*?) decided to go (first|second)\.$/))) { state.firstPlayer=m[2]==='first'?pi(m[1]):1-pi(m[1]); event.type='info'; }
    else if ((m=t.match(rx('(.*?) played '+C+' to the (Bench|Active Spot|Stadium spot)\\.')))) {
      const c=ref(m[2],m[3]); event.type='play'; takeHand(p,[c]); use(owner,c,'plays');
      if (m[4]==='Stadium spot') state.stadium=[{...c,owner}];
      else p[m[4]==='Bench'?'bench':'active'].push(newMon(c));
      lastEffect={owner,card:c,board:false};
    }
    else if ((m=t.match(rx('(.*?) evolved '+C+' to '+C+' (in the Active Spot|on the Bench)\\.')))) {
      const from=ref(m[2],m[3]), to=ref(m[4],m[5]), mon=locate(owner,from,m[6].startsWith('in')?'active':'bench');
      takeHand(p,[to]); if (mon) { mon.prev.push(ref(mon.id,mon.name)); mon.id=to.id; mon.name=to.name; }
      event.type='evolve'; use(owner,to,'plays');
    }
    else if ((m=t.match(rx('(.*?) attached '+C+' to '+C+' (on the Bench|in the Active Spot)\\.')))) {
      const energy=ref(m[2],m[3]), target=ref(m[4],m[5]);
      const mon=locate(owner,target,m[6].startsWith('on')?'bench':'active',x=>-x.energyCards.length);
      takeHand(p,[energy]); if(mon) (/Energy/.test(energy.name)?mon.energyCards:mon.tools).push(energy);
      event.type='attach'; if(/Energy/.test(energy.name)) p.stats.attachments++;
    }
    else if ((m=t.match(rx('(.*?) retreated '+C+' to the Bench\\.')))) {
      const mon=locate(owner,ref(m[2],m[3]),'active'); if(mon) {removeMon(p,mon);p.bench.push(mon);lastRetreated=mon.uid;} event.type='retreat';
    }
    else if ((m=t.match(rx("(.*?)'s "+C+' is now in the Active Spot\\.')))) {
      const mon=locate(owner,ref(m[2],m[3]),'bench',x=>x.uid===lastRetreated?-1:1);
      if(mon) {const previous=[...p.active];removeMon(p,mon);p.bench.push(...previous);p.active=[mon];} event.type='promote';lastRetreated=null;
    }
    else if ((m=t.match(rx("(.*?)'s "+C+" used (.*?) on (.*?)'s "+C+' for (\\d+) damage\\.')))) {
      const attacker=ref(m[2],m[3]), target=ref(m[6],m[7]), damage=Number(m[8]), targetPi=pi(m[5]);
      const mon=locate(targetPi,target,'active'); if(mon) mon.damage+=damage;
      p.stats.damage+=damage;p.stats.attacks++;event.type='attack';event.damage=damage;event.move=m[4];event.target=targetPi;use(owner,attacker,'attacks');
      lastEffect={owner,card:attacker,board:true};
    }
    else if ((m=t.match(rx("(.*?)'s "+C+' used (.*?)\\.')))) {
      const c=ref(m[2],m[3]);event.type='ability';event.move=m[4];use(owner,c,'abilities');lastEffect={owner,card:c,board:true};
    }
    else if ((m=t.match(rx("(.*?)'s "+C+' was Knocked Out!')))) {
      const c=ref(m[2],m[3]);const mon=locate(owner,c);
      if(mon) {removeMon(p,mon);const attached=[...mon.prev,...mon.energyCards,...mon.tools];pendingKO={owner,attached,start:p.discard.length+1};p.discard.push(ref(mon.id,mon.name),...attached);}
      event.type='ko';players[1-owner].stats.knockouts++;
    }
    else if ((m=t.match(/^(.*?) took (a|\d+) Prize cards?\.$/))) {
      const n=m[2]==='a'?1:Number(m[2]);count(p,'prizeCount',-n);p.stats.prizes+=n;event.type='prize';event.prizes=n;
      // Separate following "added to hand" lines record the hand transfer.
    }
    else if ((m=t.match(rx(C+" was added to (.*?)'s hand\\.")))) {addHand(players[pi(m[3])],[ref(m[1],m[2])]);event.type='draw';}
    else if ((m=t.match(/^A card was added to (.*?)'s hand\.$/))) {addHand(players[pi(m[1])],[],1);event.type='draw';}
    else if ((m=t.match(/^(.*?) drew (a card|\d+ cards)( for the opening hand)?\.$/))) {
      const n=m[2]==='a card'?1:Number.parseInt(m[2]);addHand(p,event.cards,n);count(p,'deckCount',-n);p.stats.draws+=n;event.type=m[3]?'setup':'draw';
    }
    else if ((m=t.match(/^(.*?) drew (\d+) cards and played them to the Bench\.$/))) {
      const n=Number(m[2]);p.bench.push(...event.cards.map(newMon));count(p,'deckCount',-n);event.type='search';p.stats.draws+=n;
      if(event.cards.length!==n) warn('ベンチに出したカードの内訳が不足しています。');
    }
    else if ((m=t.match(rx('(.*?) drew '+C+'( and played it to the Bench)?\\.')))) {
      const c=ref(m[2],m[3]);if(m[4])p.bench.push(newMon(c));else addHand(p,[c]);count(p,'deckCount',-1);p.stats.draws++;event.type=m[4]?'search':'draw';
    }
    else if ((m=t.match(/^(.*?) shuffled (\d+) cards into their deck\.$/))) {
      const n=Number(m[2]);const boardMon=lastEffect?.owner===owner && lastEffect.board ? [...p.active,...p.bench].find(x=>same(x,lastEffect.card) && event.cards.some(c=>same(c,x))) : null;
      if(boardMon) removeMon(p,boardMon);else takeHand(p,event.cards,n);
      count(p,'deckCount',n);event.type='shuffle';
    }
    else if ((m=t.match(/^(.*?) discarded (\d+) cards\.$/))) {
      takeHand(p,event.cards,Number(m[2]));p.discard.push(...clone(event.cards));event.type='discard';
    }
    else if ((m=t.match(rx('(.*?) discarded '+C+'\\.')))) {
      const c=ref(m[2],m[3]);
      // Stadium replacement is already rendered at the play event; this line is its discard record.
      if(!state.stadium.some(x=>same(x,c)) && /Stadium spot\./.test(events[frameIndex-1]?.text || '')) p.discard.push(c);
      else if(state.stadium.some(x=>same(x,c))) {state.stadium=[];p.discard.push(c);}
      else {takeHand(p,[c]);p.discard.push(c);} event.type='discard';
    }
    else if ((m=t.match(rx(C+" was discarded from (.*?)'s "+C+'\\.')))) {
      const energy=ref(m[1],m[2]), who=pi(m[3]), target=ref(m[4],m[5]);
      const mon=locate(who,target,null,x=>x.energyCards.some(c=>same(c,energy))?1:0);
      if(mon){let i=mon.energyCards.findIndex(c=>same(c,energy));if(i>=0)mon.energyCards.splice(i,1);else warn(`${target.name}の付属カード${energy.name}を確認できません。`);}
      if(who>=0)players[who].discard.push(energy);event.type='discard';
    }
    else if (/^\d+ cards were discarded from /.test(t)) {
      // Prefer explicitly revealed knockout attachments over a provisional instance assignment.
      if(pendingKO && event.cards.length) {
        const target=players[pendingKO.owner];
        const signature=cards=>cards.map(c=>c.id).sort().join('|');
        if(signature(pendingKO.attached)!==signature(event.cards)) warn('きぜつ時の付属カードが仮置きした個体と一致しません。トラッシュは原文の内訳を優先しました。残る同名個体の付属カードは要確認です。');
        target.discard.splice(pendingKO.start,pendingKO.attached.length,...clone(event.cards));
      }
      pendingKO=null;event.type='info';
    }
    else if ((m=t.match(rx("(.*?) moved (.*?)'s "+C+' to their hand\\.')))) {
      const c=ref(m[3],m[4]), source=players[pi(m[2])];
      if(source){const i=source.discard.findIndex(x=>same(x,c));if(i>=0)source.discard.splice(i,1);else warn(`${c.name}の戻し元をトラッシュに確認できません。`);}
      addHand(p,[c]);event.type='recover';
    }
    else if ((m=t.match(rx("(.*?) put (\\d+) damage counters on (.*?)'s "+C+'\\.')))) {
      const n=Number(m[2]), who=pi(m[3]), c=ref(m[4],m[5]);
      const exists=who>=0 && [...players[who].active,...players[who].bench].some(x=>same(x,c));
      if(!exists) {players.flatMap(p=>[...p.active,...p.bench]).filter(x=>same(x,c)).forEach(x=>x.damageUncertain=true);warn(`原文の対象「${m[3]}の${c.name}」が場にいません。所有者の食い違いがあるため、${n}個のダメカンは盤面に反映していません。`,'contradiction');}
      else {const mon=locate(who,c);if(mon)mon.damage+=n*10;}
      p.stats.counters+=n*10;event.type='counters';event.damage=n*10;
    }
    else if ((m=t.match(/^(.*?) flipped a coin and it landed on (heads|tails)\.$/))) {p.stats[m[2]]++;event.type='coin';}
    else if ((m=t.match(rx('(.*?) played '+C+'\\.')))) {
      const c=ref(m[2],m[3]), board=[...p.active,...p.bench].some(x=>same(x,c));
      if(board){event.type='ability';use(owner,c,'abilities');}
      else {takeHand(p,[c]);p.discard.push(c);event.type='play';use(owner,c,'plays');}
      lastEffect={owner,card:c,board};
    }
    else if (/ was activated\.$/.test(t)) event.type='ability';
    else if ((m=t.match(/^(?:You conceded\. |.*? conceded\. )?(.*?) wins\.$/))) {state.winner=m[1];event.type='result';}
    else {warn('未対応の行です。原文を確認してください: '+t,'unsupported');}
    event.player=owner>=0?owner:state.yourIndex;
    event.turn=state.turn;
    if(event.type!=='turn')state.turnActionCount++;
    frames.push({event:clone(event),current:clone(state),warnings:warnings.filter(x=>x.frame===frameIndex)});
  }
  const perspective=events.find(e=>e.type==='setup'&&e.cards.length&&e.text.includes('opening hand'));
  return {version:1,names,perspective:perspective?pi(perspective.text.split(' drew ')[0]):0,frames,turns,warnings,usage:[...usage.values()],winner:state.winner,completeSetup};
}

export function summarizeTurns(replay) {
  return replay.turns.map((turn,index) => {
    const end=(replay.turns[index+1]?.frame ?? replay.frames.length)-1;
    const before=turn.frame?replay.frames[turn.frame-1].current.players[turn.player].stats:{};
    const after=replay.frames[end].current.players[turn.player].stats;
    return {...turn,end,damage:after.damage-(before.damage||0),prizes:after.prizes-(before.prizes||0),draws:after.draws-(before.draws||0),attacks:after.attacks-(before.attacks||0)};
  });
}
