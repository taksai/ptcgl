import {japaneseName,japaneseMove} from './remote-cards.js';
export function japaneseLog(event,names){
  const t=event.text.replace(/[’‘]/g,"'");
  const actor=names.find(n=>t.startsWith(n+' ')||t.startsWith(n+"'s "))||names.find(n=>t.includes(`to ${n}'s hand`))||names[event.player]||'';
  const cards=[...t.matchAll(/\([\w-]+\) (.*?)(?= to the | in the | on the | to \(| used | was | is now | and played| for \d|\.$|$)/g)].map(m=>japaneseName(m[1]));
  const list=cards.join(' → '),who=actor?actor+'：':'';
  const amount=t.match(/(?:drew|discarded|shuffled) (\d+) cards/)?.[1]||(/\ba card\b/i.test(t)?'1':null);
  switch(event.type){
    case 'setup':return t==='Setup'?'対戦の準備':`${who}最初の手札を${amount||7}枚引く`;
    case 'turn':return `${who}ターン開始`;
    case 'play':return `${who}${list}を${t.includes('Stadium spot')?'スタジアムに出す':t.includes('Active Spot')?'バトル場に出す':t.includes('Bench')?'ベンチに出す':'使う'}`;
    case 'evolve':return `${who}${list}に進化`;
    case 'attach':return `${who}${list}（付ける）`;
    case 'attack':return `${who}${cards[0]||''}の「${japaneseMove(event.move)}」で${event.damage}ダメージ`;
    case 'ability':return `${who}${cards[0]||''}${event.move?'の「'+japaneseMove(event.move)+'」':''}（特性・効果）`;
    case 'counters':return `${who}${cards[0]||''}にダメカン${event.damage/10}個`;
    case 'ko':return `${who}${list}がきぜつ`;
    case 'prize':return `${who}サイドを${event.prizes}枚取る`;
    case 'draw':return `${who}${list||amount+'枚'}を手札に加える`;
    case 'search':return `${who}${list||event.cards.map(c=>japaneseName(c.name)).join('・')}を山札からベンチに出す`;
    case 'shuffle':return `${who}${amount||''}枚を山札に戻す`;
    case 'discard':return `${who}${list||amount+'枚'}をトラッシュする`;
    case 'recover':return `${who}${list}を手札に戻す`;
    case 'retreat':return `${who}${list}がにげる`;
    case 'promote':return `${who}${list}がバトル場へ`;
    case 'coin':return `${who}コインは${t.includes('heads')?'オモテ':'ウラ'}`;
    case 'result':return `${t.match(/(?:^|\. )(.*?) wins\.$/)?.[1]||actor}の勝利${t.includes('conceded')?'（投了）':''}`;
    default:
      if(t.includes('decided to go'))return `${who}${t.includes('second')?'後攻':'先攻'}を選ぶ`;
      if(t.includes('won the coin toss'))return `${who}コインに勝つ`;
      if(t.includes('opening coin flip'))return `${who}最初のコインで${t.includes('heads')?'オモテ':'ウラ'}を選ぶ`;
      if(t.includes('shuffled their deck'))return `${who}山札を切る`;
      if(t.includes('ended their turn'))return `${who}ターン終了`;
      if(t.includes('cards were discarded from'))return `${list}の付属カードをトラッシュ`;
      return `${who}${event.type==='other'?'未対応の行（原文を確認）':'対戦の進行'}`;
  }
}
