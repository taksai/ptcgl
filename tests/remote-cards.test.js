import test from 'node:test';import assert from 'node:assert/strict';
import {remoteCardId,japaneseImageBase,matchesJapanese,createJapaneseResolver,setJapaneseIndex,japaneseName} from '../src/remote-cards.js';
import {japaneseLog} from '../src/japanese-log.js';
const en={name:'Dreepy',category:'Pokemon',hp:70,stage:'Basic',retreat:1,attacks:[{cost:['Colorless'],damage:10}]};
const ja={...en,name:'ドラメシヤ',id:'SV6-079',image:'https://assets.tcgdex.net/ja/SV/SV6/079'};
const dictionary={names:{Dreepy:'ドラメシヤ'},moves:{Hit:'たいあたり'},cards:{ドラメシヤ:[{id:'SV6-079',image:ja.image}]}};
test('PTCGL IDs map to region-specific English card IDs without leaking arbitrary text',()=>{
 assert.equal(remoteCardId('sv6_130'),'sv06-130');assert.equal(remoteCardId('sv6-5_61'),'sv06.5-061');assert.equal(remoteCardId('me1_8'),'me01-008');assert.equal(remoteCardId('sv10_167_ph'),'sv10-167');assert.equal(remoteCardId('mee_2'),'mee-002');
 for(const id of ['demo_1','../../secret','https://example.com','user message'])assert.equal(remoteCardId(id),null);
});
test('Japanese artwork requires matching HP, attacks, and stage',()=>{
 assert.equal(matchesJapanese(en,ja,'ドラメシヤ'),true);
 for(const change of [{hp:60},{stage:'Stage1'},{attacks:[{cost:['Fire'],damage:10}]},{attacks:[{cost:['Colorless'],damage:20}]},{name:'別のポケモン'}])assert.equal(matchesJapanese(en,{...ja,...change},'ドラメシヤ'),false);
});
test('only Japanese TCGdex asset URLs are accepted',()=>{
 assert.equal(japaneseImageBase(ja),ja.image);
 for(const image of ['https://evil.example/ja/1','http://assets.tcgdex.net/ja/a','https://assets.tcgdex.net/en/sv/sv06/130','https://user@assets.tcgdex.net/ja/a'])assert.equal(japaneseImageBase({...ja,image}),null);
 assert.equal(japaneseImageBase({id:'M1S-005'}),'https://assets.tcgdex.net/ja/M/M1S/005');
});
test('resolver shares requests and transmits only card IDs to the allowlisted API',async()=>{
 setJapaneseIndex(dictionary);const calls=[];
 const resolver=createJapaneseResolver(async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>url.includes('/en/')?en:ja};});
 async function first(){for await(const card of resolver({id:'sv6_128',name:'Dreepy'}))return card;}
 const [a,b]=await Promise.all([first(),first()]);assert.equal(a.id,ja.id);assert.equal(b.name,'ドラメシヤ');assert.equal(calls.length,2);
 assert.ok(calls.every(c=>/^https:\/\/api.tcgdex.net\/v2\/(en|ja)\/cards\/[A-Za-z0-9.-]+$/.test(c.url)&&c.options.credentials==='omit'&&c.options.referrerPolicy==='no-referrer'));
});
test('API name mismatches never display the wrong Japanese Pokemon',async()=>{
 setJapaneseIndex(dictionary);const resolver=createJapaneseResolver(async()=>({ok:true,json:async()=>({...en,name:'Other'})}));let count=0;
 for await(const card of resolver({id:'sv6_128',name:'Dreepy'}))count++;
 assert.equal(count,0);
});
test('network failures and unknown IDs fall back without breaking playback',async()=>{
 const resolver=createJapaneseResolver(async()=>{throw Error('offline');});
 for(const id of ['sv6_128','invalid']){const result=[];for await(const item of resolver({id,name:'Dreepy'}))result.push(item);assert.deepEqual(result,[]);}
});
test('Japanese log summaries keep usernames and display translated cards and moves',()=>{
 setJapaneseIndex(dictionary);assert.equal(japaneseName('Dreepy'),'ドラメシヤ');
 assert.equal(japaneseLog({type:'attack',player:0,text:"Player A's (sv6_128) Dreepy used Hit on Player B's (sv6_128) Dreepy for 10 damage.",move:'Hit',damage:10},['Player A','Player B']),'Player A：ドラメシヤの「たいあたり」で10ダメージ');
});
