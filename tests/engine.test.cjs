const {test} = require('node:test');
const assert = require('node:assert/strict');
const {original, physicalSlots, createSession, packetsFor, validSession, claimWindow} = require('../src/game.js');

function seeded(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
test('all original real prizes survive every shuffle and every window order', () => {
  const expected = original.flatMap((gift, i) => gift[2] === 'trick' ? [] : [i]);
  assert.equal(expected.length, 34);
  for (let seed = 1; seed <= 250; seed++) {
    const rng = seeded(seed), session = createSession(rng);
    const days = Array.from({length:40}, (_, i) => i + 1).sort(() => rng() - .5);
    const awarded = days.map(day => claimWindow(session, day)).filter(Boolean).map(p => p.giftId);
    assert.deepEqual(awarded.sort((a,b) => a-b), expected);
    assert.ok(validSession(session));
  }
});
test('three unmoving leaves still award prizes; appearance never gates the inventory', () => {
  const session = createSession(seeded(8));
  for (const day of session.stillDoors) assert.ok(claimWindow(session, day));
  assert.equal(new Set(Object.values(session.claims)).size, 3);
});
test('reopening a window does not consume or duplicate a prize', () => {
  const session = createSession(seeded(19));
  const first = claimWindow(session, 39);
  for (let i = 0; i < 100; i++) assert.deepEqual(claimWindow(session, 39), first);
  assert.equal(Object.keys(session.claims).length, 1);
  assert.equal(session.claims[2], undefined);
  assert.notDeepEqual(claimWindow(session, 2), first);
});
test('each prank reserves a real prize even if its popup is closed or the page reloads', () => {
  const session = createSession(seeded(50));
  const packets = packetsFor(session.order);
  assert.equal(packets.filter(p => p.tease !== null).length, 3);
  for (let day = 1; day <= packets.length; day++) {
    const packet = claimWindow(session, day);
    if (packet.tease !== null) {
      assert.notEqual(original[packet.giftId][2], 'trick');
      const restored = JSON.parse(JSON.stringify(session));
      assert.ok(validSession(restored));
      assert.deepEqual(claimWindow(restored, day), packet);
    }
  }
});
test('only physical items move; vouchers and special gifts retain their order', () => {
  for (let seed = 0; seed < 100; seed++) {
    const session = createSession(seeded(seed));
    session.order.forEach((id, slot) => {
      if (physicalSlots.includes(slot)) assert.ok(physicalSlots.includes(id));
      else assert.equal(id, slot);
    });
  }
});
test('saved game validation rejects missing, duplicate, out-of-range and inconsistent claims', () => {
  const session = createSession();
  assert.ok(validSession(session));
  assert.equal(validSession(null), false);
  for (const mutate of [
    s => { s.order[0] = 100; }, s => { s.order[1] = s.order[0]; },
    s => { s.stillDoors = [1, 1, 2]; }, s => { s.claims = {'1': 0, '2': 0}; },
    s => { s.claims = {'41': 0}; }, s => { s.claims = {'1': 2}; },
    s => { s.claims = {'1': null}; }, s => { s.seenTeases = {'2': true}; }
  ]) {
    const copy = structuredClone(session); mutate(copy); assert.equal(validSession(copy), false);
  }
  assert.throws(() => claimWindow(session, 41), RangeError);
});
