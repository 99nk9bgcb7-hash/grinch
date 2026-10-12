(() => {
  'use strict';

  // Keep the supplied gift inventory, including duplicates. Only physical-item slots shuffle.
  const original = [
    ['🍽️','Ambiente','voucher'], ['🎧','AirPods 5','physical'],
    ['🔋','Alza','voucher'], ['☕','Nespresso De’Longhi','physical'],
    ['🧖‍♀️','SPA','spa'], ['🍟','Tefal Easy Fry & Grill','physical'],
    ['😈','YOU LOSE!','trick'], ['🎮','Nintendo Switch 2 🔥','super'],
    ['🧴','Sephora','beauty'], ['🦷','Oral-B iO Series 6','physical'],
    ['💶','MONEY','special'], ['🧳','American Tourister Airconic','physical'],
    ['🛍️','Shopping','voucher'], ['🟧','SURPRISE 🔥','super'],
    ['🍽️','Ambiente','voucher'], ['🧹','Dyson V8 Cyclone 2026 🔥','super'],
    ['🔋','Alza','voucher'], ['🧖‍♀️','SPA','spa'],
    ['😈','YOU LOSE!','trick'], ['🔥','Tefal OptiGrill+','physical'],
    ['🍽️','Michelin Restaurant 🔥','super'], ['🛍️','Shopping','voucher'],
    ['🌬️','Mini fan Dyson','physical'], ['🧖‍♀️','SPA','spa'],
    ['🎟️','Rituals','voucher'], ['🟧','SURPRISE 🔥','super'],
    ['🧴','Sephora','beauty'], ['😈','MAKE ME LAUGH!','trick'],
    ['🍽️','Ambiente','voucher'], ['🛍️','Shopping','voucher'],
    ['🎧','AirPods 5','physical'], ['🧖‍♀️','SPA','spa'],
    ['📱','iPhone 18 Pro 🔥🔥','super'], ['🧴','Sephora','beauty'],
    ['🛍️','Shopping','voucher'], ['🍽️','Ambiente','voucher'],
    ['📱','iPad 11 🔥🔥','super']
  ];
  const KEY = 'grinchmas.calendar.v5';
  const LEGACY_KEY = 'grinchmas.calendar.v4';
  const VERSION = 5;
  const physicalSlots = original.map((gift, i) => gift[2] === 'physical' ? i : -1).filter(i => i >= 0);
  function shuffled(items, rng = Math.random) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function createSession(rng = Math.random) {
    const order = original.map((_, i) => i);
    const physical = shuffled(physicalSlots, rng);
    physicalSlots.forEach((slot, i) => { order[slot] = physical[i]; });
    return {
      version: VERSION, order, claims: {}, retired: [], sound: false
    };
  }
  // Version 4 bundled each prank with the following gift. Used only to migrate saved games.
  function legacyPackets(order) {
    const packets = [];
    let tease = null;
    for (const giftId of order) {
      if (original[giftId][2] === 'trick') { tease = giftId; continue; }
      packets.push({giftId, tease});
      tease = null;
    }
    return packets;
  }
  function validOrder(value) {
    if (!value || typeof value.sound !== 'boolean') return false;
    if (!Array.isArray(value.order) || value.order.length !== original.length || new Set(value.order).size !== original.length) return false;
    if (value.order.some((id, slot) => !Number.isInteger(id) || id < 0 || id >= original.length || (physicalSlots.includes(slot) ? !physicalSlots.includes(id) : id !== slot))) return false;
    if (!value.claims || Array.isArray(value.claims) || typeof value.claims !== 'object') return false;
    return !Object.keys(value.claims).some(day => !/^(?:[1-9]|[1-3][0-9]|40)$/.test(day));
  }
  function validLegacy(value) {
    if (!validOrder(value) || value.version !== 4) return false;
    if (!Array.isArray(value.stillDoors) || value.stillDoors.length !== 3 || new Set(value.stillDoors).size !== 3 || value.stillDoors.some(n => !Number.isInteger(n) || n < 1 || n > 40)) return false;
    if (!value.seenTeases || typeof value.seenTeases !== 'object' || Array.isArray(value.seenTeases)) return false;
    const assigned = Object.values(value.claims).filter(n => n !== null);
    const packetCount = legacyPackets(value.order).length;
    if (assigned.some(n => !Number.isInteger(n) || n < 0 || n >= packetCount) || new Set(assigned).size !== assigned.length) return false;
    assigned.sort((a, b) => a - b);
    if (assigned.some((n, i) => n !== i)) return false;
    if (Object.values(value.claims).includes(null) && assigned.length !== packetCount) return false;
    return Object.entries(value.seenTeases).every(([day, seen]) => Object.hasOwn(value.claims, day) && seen === true);
  }
  function validSession(value) {
    if (!validOrder(value) || value.version !== VERSION || !Array.isArray(value.retired)) return false;
    if (value.retired.some(index => !Number.isInteger(index) || index < 0 || index >= original.length || original[value.order[index]][2] !== 'trick')) return false;
    const consumed = [...Object.values(value.claims), ...value.retired];
    if (consumed.some(index => !Number.isInteger(index) || index < 0 || index >= original.length) || new Set(consumed).size !== consumed.length) return false;
    return consumed.sort((a, b) => a - b).every((index, i) => index === i);
  }
  function migrateSession(value) {
    if (validSession(value)) return value;
    if (!validLegacy(value)) return null;
    const session = {version: VERSION, order: value.order.slice(), claims: {}, retired: [], sound: value.sound};
    const packets = legacyPackets(value.order);
    for (const [day, index] of Object.entries(value.claims)) {
      if (index === null) continue; // A letter was not a prize or an opened window.
      const packet = packets[index];
      session.claims[day] = value.order.indexOf(packet.giftId);
      if (packet.tease !== null) session.retired.push(value.order.indexOf(packet.tease));
    }
    return validSession(session) ? session : null;
  }
  function claimWindow(session, day) {
    if (!Number.isInteger(day) || day < 1 || day > 40) throw new RangeError('Invalid window');
    if (Object.hasOwn(session.claims, day)) return {kind: 'already-open'};
    const next = Object.keys(session.claims).length + session.retired.length;
    // The final unassigned windows stay closed; no prize is hidden behind them.
    if (next >= session.order.length) return {kind: 'mystery'};
    session.claims[day] = next;
    const giftId = session.order[next];
    return {kind: original[giftId][2] === 'trick' ? 'trick' : 'gift', giftId};
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {original, physicalSlots, createSession, validSession, migrateSession, claimWindow};
  }
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const scene = $('home'), calendar = $('calendar'), overlay = $('overlay'), popup = $('popup');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let state, memoryOnly = false, busy = false, openingTimer = null, activeDoor = null, returnFocus = null, nextAction = null;
  const descriptions = {
    'Ambiente': [18, 'Pasta first. People later.', 'A cosy table. A full plate. My social battery can wait.', 'Save me the corner table'],
    'AirPods 5': [1, 'Do not disturb: upgraded', 'For tuning out small talk. And people. Mostly people.', 'Less chatter. More music.'],
    'Alza': [17, 'A very smart move', 'Buy something smart. Someone around here should be.', 'Add to cart. Obviously.'],
    'Nespresso De’Longhi': [3, 'Espresso your inner Grinch', 'Before coffee: grumpy. After coffee: grumpy, but faster.', 'Make mine a double'],
    'SPA': [16, 'Do not disturb, darling', 'Cucumbers on. Responsibilities off. Finally, a proper plan.', 'Robes before responsibilities'],
    'Tefal Easy Fry & Grill': [5, 'Hot fries. Cold replies.', 'Keep your fries crispy and your replies to your ex ice-cold.', 'Crispy is a personality'],
    'Nintendo Switch 2': [7, 'Player one: you', 'Go save the princess. Nobody can save me from small talk.', 'Reality can wait'],
    'Sephora': [8, 'Good taste. Bad attitude.', 'A little luxury. A lot of attitude. Some things never change.', 'Excellent taste. Obviously.'],
    'Oral-B iO Series 6': [9, 'A suspiciously good smile', 'Smile wider. Let them think you are the nice one.', 'Dazzle, then disappear'],
    'MONEY': [10, 'An extremely convincing gift', 'Money cannot buy happiness. Still, keep the receipt.', 'My favourite shade of green'],
    'American Tourister Airconic': [11, 'Emotional baggage sold separately', 'Pack your bags. Preferably for somewhere with fewer people.', 'One ticket out of here'],
    'Shopping': [12, 'Retail therapy, Grinch style', '“I do not need anything” is how every great shopping trip begins.', 'This. And this. And that.'],
    'SURPRISE': [13, 'Even Santa has no idea', 'I wrapped it myself. Forgot what is inside. Very exclusive.', 'Suspicious boxes? Love them.'],
    'Dyson V8 Cyclone 2026': [14, 'Dust, your days are numbered', 'Picks up dust. And the last of your excuses for not cleaning.', 'Clean floor. Dirty look.'],
    'Tefal OptiGrill+': [5, 'A proper Grinch roasting', 'Grill the steaks. Leave roasting people to me.', 'Make mine medium Grinch'],
    'Michelin Restaurant': [0, 'Excellent taste. Questionable manners.', 'Try to behave. At least between courses.', 'Dress code: magnificent'],
    'Mini fan Dyson': [2, 'Too cool for the nonsense', 'The cold stare is mine. The cool breeze is yours.', 'Cool, calm, unavailable'],
    'Rituals': [19, 'Your very own quiet luxury', 'Light a candle. Silence the chaos. Put everyone else on mute.', 'Unavailable. Blissfully.'],
    'iPhone 18 Pro': [15, 'Hello, is this luxury?', 'For pictures of the tree, your dinner, and your “I deserve this” face.', 'First, a selfie with me'],
    'iPad 11': [15, 'Big screen. Tiny commitments.', 'A bigger screen for your very small “just one more episode”.', 'One more. The last one.']
  };
  const popupStyles = {
    'Ambiente': ['amber', 'holly'], 'AirPods 5': ['ice', 'bow'],
    'Alza': ['ice', 'stars'], 'Nespresso De’Longhi': ['copper', 'holly'],
    'SPA': ['rose', 'bow'], 'Tefal Easy Fry & Grill': ['copper', 'ornament'],
    'Nintendo Switch 2': ['mint', 'stars'], 'Sephora': ['gold', 'ornament'],
    'Oral-B iO Series 6': ['ice', 'stars'], 'MONEY': ['mint', 'ornament'],
    'American Tourister Airconic': ['ice', 'ornament'], 'Shopping': ['amber', 'bow'],
    'SURPRISE': ['gold', 'stars'], 'Dyson V8 Cyclone 2026': ['mint', 'stars'],
    'Tefal OptiGrill+': ['copper', 'holly'], 'Michelin Restaurant': ['gold', 'bow'],
    'Mini fan Dyson': ['mint', 'ornament'], 'Rituals': ['amber', 'ornament'],
    'iPhone 18 Pro': ['copper', 'bow'], 'iPad 11': ['ice', 'stars']
  };
  const artLabels = [
    'The Grinch in a tuxedo enjoying a festive dinner', 'The Grinch wearing white wireless earbuds',
    'The Grinch holding gadgets and a small electric fan', 'The Grinch drinking espresso beside a coffee machine',
    'The Grinch in a pink spa robe and towel, with cucumber slices, candles and champagne',
    'The Grinch as a chef with fries and a grill', 'A mischievous Grinch hugging a stolen Christmas gift',
    'The Grinch playing a handheld games console', 'The Grinch with makeup and pink sunglasses',
    'The Grinch brushing his teeth with an electric toothbrush', 'The Grinch holding a fan of banknotes',
    'The Grinch with a turquoise suitcase and a boarding pass', 'The Grinch carrying pink shopping bags',
    'The Grinch opening a glowing gift box', 'The Grinch cleaning with a cordless vacuum',
    'The Grinch holding an orange phone and a tablet',
    'The Grinch relaxing in a pink spa robe, holding champagne in one hand beside candles',
    'The Grinch in a teal hoodie holding a laptop and a wireless mouse',
    'The Grinch enjoying pasta at a cosy bistro table',
    'The Grinch in a cream robe holding an amber candle beside a reed diffuser'
  ];
  const looks = [
    'green heart','cream ribbon bow','green bauble','cream holly','green bow','green cane','cream star','red neon','green holly','red star',
    'cream holly bow','green bow bauble gold-bauble','leopard','red bow','cream star','green holly','red bow','cream wreath','green bow','cream ribbon',
    'green bow','cream ribbon','green star','red bauble','green holly','cream bow','green star','red bow','green cane','cream star',
    'cream bow','green bauble gold-bauble','cream bow','green star','red wreath','green bow','cream bow','green holly','red neon','green star'
  ];

  function readStored() {
    if (memoryOnly) return null;
    try {
      const raw = localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY);
      if (!raw) return null;
      return migrateSession(JSON.parse(raw));
    } catch {
      memoryOnly = true;
      $('storageNotice').hidden = false;
      return null;
    }
  }
  function save() {
    if (memoryOnly) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch { memoryOnly = true; $('storageNotice').hidden = false; }
  }
  function refreshState() { state = readStored() || state; }
  function atomic(callback) {
    if (navigator.locks && !memoryOnly) return navigator.locks.request(KEY, callback);
    return Promise.resolve(callback());
  }
  state = readStored() || createSession();
  save();

  function symbol(name, className) {
    return `<svg class="${className}" aria-hidden="true"><use href="#${name}"/></svg>`;
  }
  function renderDoors() {
    for (let day = 1; day <= 40; day++) {
      const style = looks[day - 1];
      const door = document.createElement('button');
      door.type = 'button';
      door.className = 'door ' + style.split(' ')[0] + (style.includes('gold-bauble') ? ' gold-bauble' : '') + (style.includes('cane') ? ' has-candy' : '');
      door.id = 'door-' + day;
      door.setAttribute('aria-label', 'Open window ' + day);
      let decor = symbol('snow', 'snowcap') + '<span class="hinge"></span><span class="hinge lower"></span>';
      if (style.includes('ribbon')) decor += '<span class="ribbon-band"></span>';
      if (style.includes('wreath')) decor += '<span class="wreath"></span>';
      if (style.includes('bow')) decor += symbol('bow', 'door-bow');
      if (style.includes('holly')) decor += symbol('holly', 'holly');
      if (style.includes('bauble')) decor += '<span class="bauble"></span>';
      if (style.includes('star')) decor += '<span class="star-decor">✶</span>';
      if (style.includes('neon')) decor += '<span class="neon-heart">♡</span>';
      if (style.includes('heart')) decor += '<span class="star-decor">♡</span>';
      if (style.includes('cane')) decor += symbol('candy-cane', 'candy-cane');
      door.innerHTML = '<span class="door-frame" aria-hidden="true"></span><span class="door-leaf" aria-hidden="true">' + decor + '<span class="number">' + day + '</span><span class="knob"></span></span>';
      door.addEventListener('click', () => openDoor(day));
      calendar.append(door);
    }
  }
  function renderOpenedWindows() {
    for (let day = 1; day <= 40; day++) {
      const door = $('door-' + day);
      const opened = Object.hasOwn(state.claims, day);
      door.classList.toggle('opened', opened);
      door.disabled = opened;
      const back = door.querySelector('.door-frame');
      back.replaceChildren();
      door.classList.remove('trick-reveal');
      if (!opened) { door.setAttribute('aria-label', 'Open window ' + day); continue; }
      const [icon, name, type] = original[state.order[state.claims[day]]];
      door.classList.toggle('trick-reveal', type === 'trick');
      door.setAttribute('aria-label', `Window ${day}: ${cleanName(name)}. Already opened.`);
      for (const [className, text] of [
        ['opened-number', String(day)],
        ['opened-icon', icon],
        ['opened-gift', type === 'trick' ? 'GRINCHED!' : cleanName(name)]
      ]) {
        const span = document.createElement('span');
        span.className = className;
        span.textContent = text;
        back.append(span);
      }
    }
  }
  function cleanName(name) { return name.replace(/\s*🔥/gu, '').trim(); }
  function giftDetails(giftId) {
    const [icon, rawName, type] = original[giftId];
    const name = cleanName(rawName);
    const [art, tag, caption, button] = descriptions[name];
    const [theme, decoration] = popupStyles[name];
    return {icon, title: name, type: type === 'special' ? 'super' : type, art, tag, caption, button, theme, decoration};
  }
  function showPopup(details, action = closePopup, windowNumber = null) {
    if (overlay.hidden) returnFocus ||= document.activeElement;
    const theme = details.theme || 'gold', decoration = details.decoration || 'stars';
    popup.className = `popup ${details.type || ''} theme-${theme} decoration-${decoration}` + (details.title.length > 16 ? ' long-title' : '');
    $('popupDecoration').setAttribute('href', decoration === 'holly' ? '#holly' : '#decor-' + decoration);
    $('doodleLeft').textContent = theme === 'rose' ? '♡' : '✧';
    $('doodleRight').textContent = theme === 'rose' ? '♡' : theme === 'ice' ? '❄' : '✦';
    $('popupWindow').hidden = windowNumber === null;
    $('popupWindow').textContent = windowNumber === null ? '' : 'WINDOW ' + String(windowNumber).padStart(2, '0');
    $('popupTitle').textContent = details.title;
    $('popupTag').textContent = details.tag;
    $('popupText').textContent = details.caption;
    $('popupIcon').textContent = details.icon;
    const revised = details.art >= 16, artIndex = revised ? details.art - 16 : details.art, columns = revised ? 2 : 4;
    const phonePortrait = details.title === 'iPhone 18 Pro';
    $('popupArt').classList.toggle('revised-art', revised);
    $('popupArt').classList.toggle('iphone-portrait', phonePortrait);
    $('popupArt').style.backgroundPosition = `${(artIndex % columns) * 100 / (columns - 1)}% ${Math.floor(artIndex / columns) * 100 / (columns - 1)}%`;
    $('popupArt').setAttribute('aria-label', phonePortrait ? 'The Grinch in a Santa hat holding an orange iPhone' : artLabels[details.art]);
    $('okay').textContent = details.button;
    $('cancelRestart').hidden = !details.allowCancel;
    nextAction = action;
    overlay.hidden = false;
    scene.inert = true;
    document.body.style.overflow = 'hidden';
    popup.focus({preventScroll: true});
  }
  function showGift(result, day) { showPopup(giftDetails(result.giftId), closePopup, day); }
  function showTrick(result, day) {
    const laugh = result.giftId === 27;
    showPopup({art: 6, icon: '😈', type: 'trick', theme: 'copper', decoration: 'holly', tag: 'The Grinch strikes again',
      title: original[result.giftId][1],
      caption: laugh ? 'Tell your worst joke. I could use a laugh. My standards are low. My eyebrows are not.' : 'I stole this one. Shocking, I know. Consider it a masterclass in festive mischief.',
      button: laugh ? 'Tough crowd.' : 'So very Grinch of you'
    }, closePopup, day);
  }
  function showNote(day) {
    showPopup({art: 6, icon: '💌', type: 'info', tag: 'Personally. Grumpily. With love.', title: 'Do not tell anyone…',
      caption: 'I think I like giving presents. A deeply inconvenient feeling. Sending hugs. But keep that between us.', button: 'Your secret is safe'}, closePopup, day);
  }
  async function openDoor(day) {
    if (busy || !overlay.hidden) return;
    busy = true;
    activeDoor = $('door-' + day);
    returnFocus = activeDoor;
    let result;
    try {
      await atomic(() => { refreshState(); result = claimWindow(state, day); save(); });
    } catch {
      result = claimWindow(state, day); save();
    }
    renderOpenedWindows();
    if (result.kind === 'already-open') { closePopup(); return; }
    activeDoor.classList.add(result.kind === 'mystery' ? 'summoning' : 'revealing');
    openingTimer = setTimeout(() => {
      openingTimer = null;
      if (result.kind === 'mystery') showNote(day);
      else if (result.kind === 'trick') showTrick(result, day);
      else showGift(result, day);
    }, reducedMotion.matches ? 0 : 430);
  }
  function closePopup() {
    if (openingTimer !== null) { clearTimeout(openingTimer); openingTimer = null; }
    overlay.hidden = true;
    scene.inert = false;
    document.body.style.overflow = '';
    if (activeDoor) activeDoor.classList.remove('revealing', 'summoning');
    renderOpenedWindows();
    activeDoor = null; busy = false; nextAction = null;
    if (returnFocus && returnFocus.isConnected) {
      let target = returnFocus;
      if (target.disabled) {
        const day = Number(target.id.replace('door-', ''));
        const available = [...calendar.querySelectorAll('.door:not(:disabled)')];
        target = available.find(door => Number(door.id.replace('door-', '')) > day) || available[0] || calendar;
      }
      target.focus({preventScroll: true});
    }
    returnFocus = null;
  }
  function confirmRestart() {
    if (busy || !overlay.hidden) return;
    showPopup({art: 6, icon: '🎁', type: 'info', tag: 'A fresh start. Same attitude.', title: 'Hide the gifts again?',
      caption: 'Start a fresh game and close every window on this device. Your current game will be cleared.', button: 'Restart calendar', allowCancel: true
    }, async () => {
      await atomic(() => { state = createSession(); save(); });
      closePopup();
    });
  }

  renderDoors(); renderOpenedWindows();
  $('okay').addEventListener('click', () => { if (nextAction) nextAction(); });
  $('cancelRestart').addEventListener('click', closePopup);
  $('restart').addEventListener('click', confirmRestart);
  overlay.addEventListener('click', event => { if (event.target === overlay) closePopup(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && (!overlay.hidden || openingTimer !== null)) { event.preventDefault(); closePopup(); return; }
    if (overlay.hidden || event.key !== 'Tab') return;
    const focusable = [...popup.querySelectorAll('button')].filter(button => !button.hidden && !button.disabled);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === popup)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === popup)) { event.preventDefault(); first.focus(); }
  });
  window.addEventListener('storage', event => {
    if (event.key === KEY) { refreshState(); renderOpenedWindows(); }
  });
  if (!reducedMotion.matches) {
    for (let i = 0; i < 23; i++) {
      const flake = document.createElement('i');
      flake.className = 'flake';
      flake.style.cssText = `left:${Math.random()*100}%;width:${2+Math.random()*3}px;height:${2+Math.random()*3}px;--duration:${11+Math.random()*13}s;--delay:${-Math.random()*24}s;--drift:${Math.random()*100-50}px;--opacity:${.2+Math.random()*.45}`;
      $('snowfall').append(flake);
    }
  }
})();
