const {test} = require('node:test');
const assert = require('node:assert/strict');
const {original, physicalSlots, createSession, validSession, migrateSession, claimWindow} = require('../src/game.js');

function seeded(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
test('every selection order awards the full inventory, three losses and no duplicate gifts', () => {
  const expected = original.flatMap((gift, i) => gift[2] === 'trick' ? [] : [i]);
  assert.equal(expected.length, 34);
  for (let seed = 1; seed <= 250; seed++) {
    const rng = seeded(seed), session = createSession(rng);
    const days = Array.from({length:40}, (_, i) => i + 1).sort(() => rng() - .5);
    const results = days.map(day => claimWindow(session, day));
    const awarded = results.filter(r => r.kind === 'gift').map(r => r.giftId);
    assert.deepEqual(awarded.sort((a,b) => a-b), expected);
    assert.equal(results.filter(r => r.kind === 'trick').length, 3);
    assert.equal(results.filter(r => r.kind === 'mystery').length, 3);
    assert.equal(Object.keys(session.claims).length, 37);
    assert.ok(validSession(session));
  }
});
test('opened windows cannot be claimed again, including after a reload', () => {
  const session = createSession(seeded(19));
  assert.equal(claimWindow(session, 39).kind, 'gift');
  const saved = JSON.stringify(session);
  for (let i = 0; i < 100; i++) assert.deepEqual(claimWindow(session, 39), {kind:'already-open'});
  assert.equal(JSON.stringify(session), saved);
  const restored = JSON.parse(saved);
  assert.deepEqual(claimWindow(restored, 39), {kind:'already-open'});
  assert.equal(claimWindow(restored, 2).kind, 'gift');
  assert.equal(Object.keys(restored.claims).length, 2);
});
test('a loss consumes only its own window and leaves the next gift for a new pick', () => {
  const session = createSession(seeded(50));
  for (let day = 1; day <= 6; day++) claimWindow(session, day);
  const loss = claimWindow(session, 7);
  assert.equal(loss.kind, 'trick');
  assert.equal(loss.giftId, 6);
  assert.equal(Object.keys(session.claims).length, 7);
  assert.ok(!Object.values(session.claims).includes(7));
  assert.equal(claimWindow(session, 7).kind, 'already-open');
  const restored = JSON.parse(JSON.stringify(session));
  assert.ok(validSession(restored));
  const retry = claimWindow(restored, 31);
  assert.equal(retry.kind, 'gift');
  assert.equal(original[retry.giftId][1], 'Nintendo Switch 2 🔥');
});
test('only physical items move; vouchers, losses and special gifts retain their order', () => {
  for (let seed = 0; seed < 100; seed++) {
    const session = createSession(seeded(seed));
    session.order.forEach((id, slot) => {
      if (physicalSlots.includes(slot)) assert.ok(physicalSlots.includes(id));
      else assert.equal(id, slot);
    });
  }
});
function legacySession(claimCount) {
  return {version:4, order:original.map((_,i)=>i), stillDoors:[10,20,30], sound:true, seenTeases:{},
    claims:Object.fromEntries(Array.from({length:claimCount},(_,i)=>[i+1,i<34?i:null]))};
}
test('upgrading an existing game preserves each awarded prize and does not reissue bundled losses', () => {
  for (let count = 0; count <= 40; count++) {
    const old = legacySession(count);
    const migrated = migrateSession(old);
    assert.ok(validSession(migrated));
    assert.equal(migrated.sound, true);
    const expected = original.flatMap((gift,i) => gift[2] === 'trick' ? [] : [i]);
    const previous = Object.entries(migrated.claims).map(([day, index]) => {
      assert.equal(claimWindow(migrated, Number(day)).kind, 'already-open');
      return migrated.order[index];
    });
    assert.deepEqual(previous, expected.slice(0,Math.min(count,34)));
    const later = [];
    for(let day=1;day<=40;day++) {
      const result=claimWindow(migrated,day);
      if(result.kind==='gift') later.push(result.giftId);
    }
    assert.deepEqual([...previous,...later].sort((a,b)=>a-b),expected);
  }
});
test('saved game validation rejects gaps, duplicate claims and invalid retired events', () => {
  const session = createSession();
  assert.ok(validSession(session));
  assert.equal(validSession(null), false);
  for (const mutate of [
    s => { s.order[0] = 100; }, s => { s.order[1] = s.order[0]; },
    s => { s.claims = {'1': 0, '2': 0}; }, s => { s.claims = {'41': 0}; },
    s => { s.claims = {'1': 2}; }, s => { s.claims = {'1': null}; },
    s => { s.retired = [0]; }, s => { s.retired = [6,6]; }
  ]) {
    const copy = structuredClone(session); mutate(copy); assert.equal(validSession(copy), false);
  }
  assert.throws(() => claimWindow(session, 41), RangeError);
  const old=legacySession(8); old.claims['2']=0;
  assert.equal(migrateSession(old),null);
});
