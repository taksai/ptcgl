import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseLog,summarizeTurns} from '../src/parser.js';
const sample=readFileSync(new URL('../examples/demo.txt',import.meta.url),'utf8');
const setup=`Setup\nA drew 7 cards for the opening hand.\nB drew 7 cards for the opening hand.\nA played (basic_1) Starter to the Active Spot.\nB played (basic_2) Other to the Active Spot.\nA's Turn\n`;
function custom(actions){return parseLog(setup+actions+"\nB's Turn\n");}
test('fictional demo parses the prize race and attack damage',()=>{
 const r=parseLog(sample),final=r.frames.at(-1).current;
 assert.equal(r.winner,'Player A');assert.equal(r.turns.length,4);
 assert.deepEqual(final.players.map(p=>p.stats.damage),[30,120]);
 assert.deepEqual(final.players.map(p=>p.prizeCount),[6,5]);
 assert.equal(r.warnings.length,0);
 assert.deepEqual(summarizeTurns(r).map(t=>t.damage),[0,20,30,100]);
});
test('CRLF and curly quotes preserve the demo result',()=>{
 const r=parseLog(sample.replace(/\n/g,'\r\n').replace(/'s Turn/g,'’s Turn'));
 assert.equal(r.frames.length,parseLog(sample).frames.length);assert.equal(r.winner,'Player A');
});
test('revealed hand cards and hidden opponent information are tracked separately',()=>{
 const r=parseLog(sample),initial=r.frames.find(f=>f.event.text==='Player A played (sv6_128) Dreepy to the Active Spot.').current;
 assert.equal(initial.players[0].hand.length,0);assert.equal(initial.players[0].handCount,6);
 assert.equal(initial.players[1].hand.length,6);assert.equal(initial.players[1].deckCount,47);
});
test('snapshot changes cannot mutate earlier replay positions',()=>{
 const r=parseLog(sample),before=JSON.stringify(r.frames[5]);
 r.frames.at(-1).current.players[0].hand.length=0;
 assert.equal(JSON.stringify(r.frames[5]),before);
});
test('the anonymous self-owner damage-counter bug is reported, never silently corrected',()=>{
  const r=custom("A put 6 damage counters on A's (basic_2) Other.");
  assert.equal(r.frames.at(-1).current.players[1].active[0].damage,0);assert.ok(r.warnings.some(w=>w.kind==='contradiction'));
});
test('duplicate cards get stable identities and explicit ambiguity flags',()=>{
  const r=custom('A played (dup_1) Twin to the Bench.\nA played (dup_1) Twin to the Bench.\nA attached (mee_2) Basic Fire Energy to (dup_1) Twin on the Bench.');
  const bench=r.frames.at(-1).current.players[0].bench;assert.notEqual(bench[0].uid,bench[1].uid);assert.ok(bench.every(m=>m.uncertain));
});
test('direct bench search never counts cards as hand draws',()=>{
  const r=custom('A drew 2 cards and played them to the Bench.\n • (foo_1) One, (foo_2) Two');
  const p=r.frames.at(-1).current.players[0];assert.equal(p.handCount,6);assert.equal(p.bench.length,2);assert.equal(p.deckCount,45);
});
test('evolution keeps damage, energy, and previous cards',()=>{
  const r=custom("A attached (mee_2) Basic Fire Energy to (basic_1) Starter in the Active Spot.\nB's (basic_2) Other used Hit on A’s (basic_1) Starter for 20 damage.\nA evolved (basic_1) Starter to (evo_1) Evolved in the Active Spot.");
  const mon=r.frames.at(-1).current.players[0].active[0];assert.equal(mon.damage,20);assert.equal(mon.energyCards.length,1);assert.equal(mon.prev[0].name,'Starter');
});
test('KO detail lines use explicitly revealed attachments and never double-count',()=>{
  const r=custom("A attached (mee_2) Basic Fire Energy to (basic_1) Starter in the Active Spot.\nA's (basic_1) Starter was Knocked Out!\n- 1 cards were discarded from A's (basic_1) Starter.\n • (mee_2) Basic Fire Energy");
  const p=r.frames.at(-1).current.players[0];assert.equal(p.active.length,0);assert.equal(p.discard.length,2);
});
test('unknown lines remain visible with line-number warnings',()=>{
  const r=custom('Something new happened.');const w=r.warnings.find(w=>w.kind==='unsupported');assert.ok(w);assert.equal(r.frames[w.frame].event.line,w.line);
});
test('partial logs use unknown totals, not invented 60-card starting state',()=>{
  const r=parseLog("A's Turn\nA drew a card.\nB's Turn\nB drew a card.");const p=r.frames.at(-1).current.players[0];
  assert.equal(r.completeSetup,false);assert.equal(p.handCount,null);assert.equal(p.deckCount,null);assert.equal(p.prizeCount,null);
});
test('empty, malformed, huge, and concatenated matches are rejected',()=>{
  for(const text of ['', 'unrelated text', 'x'.repeat(500001), sample+"\nThird's Turn", sample+'\n'+sample])assert.throws(()=>parseLog(text));
});
