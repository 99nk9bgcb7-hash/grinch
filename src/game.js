(() => {
  'use strict';

  // Keep the supplied gift inventory, including duplicates. Only physical-item slots shuffle.
  const original = [
    ['🍽️','Ambiente','voucher'], ['🎧','AirPods 5','physical'],
    ['🔋','Alza','voucher'], ['☕','Nespresso De’Longhi','physical'],
    ['🧖‍♀️','SPA','spa'], ['🍟','Tefal Easy Fry & Grill','physical'],
    ['😈','Гринч стащил подарок!','trick'], ['🎮','Nintendo Switch 2 🔥','super'],
    ['💅','Sephora','beauty'], ['🦷','Oral-B iO Series 6','physical'],
    ['💶','MONEY','special'], ['🧳','American Tourister Airconic','physical'],
    ['🛍️','Shopping','voucher'], ['🟧','SURPRISE 🔥','super'],
    ['🍽️','Ambiente','voucher'], ['🧹','Dyson V8 Cyclone 2026 🔥','super'],
    ['🔋','Alza','voucher'], ['🧖‍♀️','SPA','spa'],
    ['😈','Гринч стащил подарок!','trick'], ['🔥','Tefal OptiGrill+','physical'],
    ['🍽️','Michelin Restaurant 🔥','super'], ['🛍️','Shopping','voucher'],
    ['🌬️','Mini fan Dyson','physical'], ['🧖‍♀️','SPA','spa'],
    ['🎟️','Rituals','voucher'], ['🟧','SURPRISE 🔥','super'],
    ['💅','Sephora','beauty'], ['😈','Рассмеши Гринча','trick'],
    ['🍽️','Ambiente','voucher'], ['🛍️','Shopping','voucher'],
    ['🎧','AirPods 5','physical'], ['🧖‍♀️','SPA','spa'],
    ['📱','iPhone 18 Pro 🔥🔥','super'], ['💅','Sephora','beauty'],
    ['🛍️','Shopping','voucher'], ['🍽️','Ambiente','voucher'],
    ['📱','iPad 11 🔥🔥','super']
  ];
  const KEY = 'grinchmas.calendar.v4';
  const VERSION = 4;
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
      version: VERSION, order,
      // These leaves never swing, but every window can still receive a prize.
      stillDoors: shuffled(Array.from({length: 40}, (_, i) => i + 1), rng).slice(0, 3),
      claims: {}, seenTeases: {}, sound: false
    };
  }
  function packetsFor(order) {
    const packets = [];
    let tease = null;
    for (const giftId of order) {
      if (original[giftId][2] === 'trick') { tease = giftId; continue; }
      packets.push({giftId, tease});
      tease = null;
    }
    return packets;
  }
  function validSession(value) {
    if (!value || value.version !== VERSION || typeof value.sound !== 'boolean') return false;
    if (!Array.isArray(value.order) || value.order.length !== original.length || new Set(value.order).size !== original.length) return false;
    if (value.order.some((id, slot) => !Number.isInteger(id) || id < 0 || id >= original.length || (physicalSlots.includes(slot) ? !physicalSlots.includes(id) : id !== slot))) return false;
    if (!Array.isArray(value.stillDoors) || value.stillDoors.length !== 3 || new Set(value.stillDoors).size !== 3 || value.stillDoors.some(n => !Number.isInteger(n) || n < 1 || n > 40)) return false;
    if (!value.claims || Array.isArray(value.claims) || typeof value.claims !== 'object' || !value.seenTeases || typeof value.seenTeases !== 'object' || Array.isArray(value.seenTeases)) return false;
    if (Object.keys(value.claims).some(day => !/^(?:[1-9]|[1-3][0-9]|40)$/.test(day))) return false;
    const assigned = Object.values(value.claims).filter(n => n !== null);
    const packetCount = packetsFor(value.order).length;
    if (assigned.some(n => !Number.isInteger(n) || n < 0 || n >= packetCount) || new Set(assigned).size !== assigned.length) return false;
    assigned.sort((a, b) => a - b);
    if (assigned.some((n, i) => n !== i)) return false;
    if (Object.values(value.claims).includes(null) && assigned.length !== packetCount) return false;
    return Object.entries(value.seenTeases).every(([day, seen]) => Object.hasOwn(value.claims, day) && seen === true);
  }
  function claimWindow(session, day) {
    if (!Number.isInteger(day) || day < 1 || day > 40) throw new RangeError('Invalid window');
    const packets = packetsFor(session.order);
    if (!Object.hasOwn(session.claims, day)) {
      const next = Object.values(session.claims).filter(n => n !== null).length;
      session.claims[day] = next < packets.length ? next : null;
    }
    const index = session.claims[day];
    return index === null ? null : packets[index];
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {original, physicalSlots, createSession, packetsFor, validSession, claimWindow};
  }
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const scene = $('home'), calendar = $('calendar'), overlay = $('overlay'), popup = $('popup');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let state, memoryOnly = false, busy = false, openingTimer = null, activeDoor = null, returnFocus = null, nextAction = null;
  let audioContext = null;
  const descriptions = {
    'Ambiente': [0, 'Ужин без компромиссов', 'На ужин — ты. В меню — всё, кроме моего терпения.', 'Столик на моё имя'],
    'AirPods 5': [1, 'Режим: не беспокоить', 'Чтобы не слышать «ну что, как дела?». Одобрено Гринчем.', 'Включаю свой вайб'],
    'Alza': [2, 'Техника на твоей стороне', 'Купи что-нибудь умное. В этой компании должен быть хоть кто-то.', 'Добавляю в корзину'],
    'Nespresso De’Longhi': [3, 'Утро станет добрее. Может быть.', 'Пока нет кофе — я злой. После кофе — злой, но бодрый.', 'Мне двойной, пожалуйста'],
    'SPA': [4, 'Do not disturb, darling', 'Лицо — в огурцах. Дела — в игноре. Вот это я понимаю: планы.', 'Ухожу в халат'],
    'Tefal Easy Fry & Grill': [5, 'Хрустящий аргумент', 'Картошка будет горячей. Ответы бывшим — холодными.', 'Хрусти, не грусти'],
    'Nintendo Switch 2': [7, 'Player one, это ты', 'Спасай принцессу. Меня от людей уже не спасти.', 'Ушёл спасать мир'],
    'Sephora': [8, 'Grinch glam club', 'Характер не исправим. Зато хайлайтер подберём.', 'Красота — страшная сила'],
    'Oral-B iO Series 6': [9, 'Улыбка с подвохом', 'Улыбайся шире. Пусть думают, что ты добрый.', 'Ослеплю всех'],
    'MONEY': [10, 'Очень убедительный подарок', 'Счастье не купить. Но чек я бы всё-таки сохранил.', 'Такая зелень мне нравится'],
    'American Tourister Airconic': [11, 'Багаж хорошего настроения', 'Собирай вещи. Особенно если в планах — подальше от всех.', 'Такси в аэропорт!'],
    'Shopping': [12, 'Retail therapy, baby', '«Мне ничего не нужно» — отличное начало шопинга.', 'Беру. И это тоже.'],
    'SURPRISE': [13, 'Секрет даже от Санты', 'Я сам упаковывал. Что внутри — уже забыл. Интрига!', 'Обожаю подозрительные коробки'],
    'Dyson V8 Cyclone 2026': [14, 'Пыль, у тебя проблемы', 'Собирает пыль. И остатки желания убираться вручную.', 'Порядок без переговоров'],
    'Tefal OptiGrill+': [5, 'Прожарка от Гринча', 'Жарь стейки. Не нервы. Последнее оставь мне.', 'Мне medium grinch'],
    'Michelin Restaurant': [0, 'Очень высокая кухня', 'Веди себя прилично. Хотя бы между подачами.', 'Дресс-код: великолепие'],
    'Mini fan Dyson': [2, 'Cool по всем параметрам', 'Холодный взгляд — мой. Свежий ветер — твой.', 'Слишком cool для суеты'],
    'Rituals': [4, 'Твой личный ритуал', 'Зажги свечу. Выключи суету. Всех остальных — в беззвучный.', 'Меня сегодня нет'],
    'iPhone 18 Pro': [15, 'Алло, это роскошь', 'Для фото ёлки, еды и лица «я этого заслуживаю».', 'Сначала селфи со мной'],
    'iPad 11': [15, 'Масштаб твоих планов', 'Большой экран для маленьких «ещё одну серию».', 'Ещё одну. Последнюю.']
  };
  const artLabels = [
    'Гринч в смокинге за праздничным ужином', 'Гринч с белыми беспроводными наушниками',
    'Гринч с гаджетами и маленьким вентилятором', 'Гринч пьёт эспрессо у кофемашины',
    'Гринч в розовом халате и тюрбане, с огурцами на глазах, свечами и бокалом',
    'Гринч-повар с картошкой фри и грилем', 'Хитрый Гринч обнимает украденный подарок',
    'Гринч играет на портативной игровой консоли', 'Гринч с косметикой в розовых очках',
    'Гринч чистит зубы электрической щёткой', 'Гринч держит веер денежных купюр',
    'Гринч с бирюзовым чемоданом и посадочным талоном', 'Гринч несёт розовые пакеты с покупками',
    'Гринч открывает сияющую подарочную коробку', 'Гринч убирается беспроводным пылесосом',
    'Гринч с оранжевым телефоном и планшетом'
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
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return validSession(parsed) ? parsed : null;
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
      door.className = 'door ' + style.split(' ')[0] + (style.includes('gold-bauble') ? ' gold-bauble' : '');
      door.id = 'door-' + day;
      door.setAttribute('aria-label', 'Окошко ' + day);
      let decor = symbol('snow', 'snowcap') + '<span class="hinge"></span><span class="hinge lower"></span>';
      if (style.includes('ribbon')) decor += '<span class="ribbon-band"></span>';
      if (style.includes('wreath')) decor += '<span class="wreath"></span>';
      if (style.includes('bow')) decor += symbol('bow', 'door-bow');
      if (style.includes('holly')) decor += symbol('holly', 'holly');
      if (style.includes('bauble')) decor += '<span class="bauble"></span>';
      if (style.includes('star')) decor += '<span class="star-decor">✶</span>';
      if (style.includes('neon')) decor += '<span class="neon-heart">♡</span>';
      if (style.includes('heart')) decor += '<span class="star-decor">♡</span>';
      if (style.includes('cane')) decor += '<span class="candy-cane"></span>';
      door.innerHTML = '<span class="door-frame" aria-hidden="true"></span><span class="door-leaf" aria-hidden="true">' + decor + '<span class="number">' + day + '</span><span class="knob"></span></span>';
      door.addEventListener('click', () => openDoor(day));
      calendar.append(door);
    }
  }
  function cleanName(name) { return name.replace(/\s*🔥/gu, '').trim(); }
  function giftDetails(giftId) {
    const [icon, rawName, type] = original[giftId];
    const name = cleanName(rawName);
    const [art, tag, caption, button] = descriptions[name];
    return {icon, title: name, type: type === 'special' ? 'super' : type, art, tag, caption, button};
  }
  function chime() {
    if (!state.sound) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audioContext ||= new Audio();
      audioContext.resume().catch(() => {});
      [659.25, 830.61, 987.77].forEach((hz, i) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const start = audioContext.currentTime + i * .11;
        oscillator.type = 'sine'; oscillator.frequency.value = hz;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(.075, start + .012);
        gain.gain.exponentialRampToValueAtTime(.001, start + .7);
        oscillator.connect(gain); gain.connect(audioContext.destination);
        oscillator.start(start); oscillator.stop(start + .72);
      });
    } catch { /* Audio is an optional enhancement. */ }
  }
  function showPopup(details, action = closePopup) {
    if (overlay.hidden) returnFocus ||= document.activeElement;
    popup.className = 'popup ' + (details.type || '') + (details.title.length > 16 ? ' long-title' : '');
    $('popupTitle').textContent = details.title;
    $('popupTag').textContent = details.tag;
    $('popupText').textContent = details.caption;
    $('popupIcon').textContent = details.icon;
    $('popupArt').style.backgroundPosition = `${(details.art % 4) * 100 / 3}% ${Math.floor(details.art / 4) * 100 / 3}%`;
    $('popupArt').setAttribute('aria-label', artLabels[details.art]);
    $('okay').textContent = details.button;
    $('restart').hidden = !details.allowRestart;
    nextAction = action;
    overlay.hidden = false;
    scene.inert = true;
    document.body.style.overflow = 'hidden';
    popup.focus({preventScroll: true});
  }
  function showGift(packet) { showPopup(giftDetails(packet.giftId)); }
  function showTease(packet, day) {
    // The real gift was reserved atomically with this prank. Closing or reloading cannot lose it.
    const laugh = packet.tease === 27;
    showPopup({art: 6, icon: '😈', type: 'trick', tag: 'Гринч опять за своё',
      title: laugh ? 'Ну-ка, рассмеши меня!' : 'Я стащил твой подарок!',
      caption: laugh ? 'Ладно, твоё лицо уже справилось. Держи подарок, пока я снова не стал вредным.' : 'Потом вспомнил, что доставка обратно платная. Так уж и быть — забирай.',
      button: laugh ? 'Ха-ха. А теперь подарок!' : 'Верни, зелёный!'
    }, async () => {
      await atomic(() => { refreshState(); state.seenTeases[day] = true; save(); });
      showGift(packet);
      chime();
    });
  }
  function showNote() {
    showPopup({art: 6, icon: '💌', type: 'info', tag: 'Лично. Ворчливо. С любовью.', title: 'Только никому не говори…',
      caption: 'Кажется, мне нравится дарить подарки. Ужасно неудобное чувство. Обнимаю. Но это между нами.', button: 'Твой секрет со мной'});
  }
  async function openDoor(day) {
    if (busy || !overlay.hidden) return;
    busy = true;
    activeDoor = $('door-' + day);
    returnFocus = activeDoor;
    let packet;
    try {
      await atomic(() => { refreshState(); packet = claimWindow(state, day); save(); });
    } catch {
      packet = claimWindow(state, day); save();
    }
    activeDoor.classList.add(state.stillDoors.includes(day) ? 'summoning' : 'revealing');
    chime();
    openingTimer = setTimeout(() => {
      openingTimer = null;
      if (!packet) showNote();
      else if (packet.tease !== null && !state.seenTeases[day]) showTease(packet, day);
      else showGift(packet);
    }, reducedMotion.matches ? 0 : 430);
  }
  function closePopup() {
    if (openingTimer !== null) { clearTimeout(openingTimer); openingTimer = null; }
    overlay.hidden = true;
    scene.inert = false;
    document.body.style.overflow = '';
    if (activeDoor) activeDoor.classList.remove('revealing', 'summoning');
    activeDoor = null; busy = false; nextAction = null;
    if (returnFocus && returnFocus.isConnected) returnFocus.focus({preventScroll: true});
    returnFocus = null;
  }
  function showHowTo() {
    if (busy) return;
    showPopup({art: 13, icon: '🎁', type: 'info', tag: 'Правила? Ну почти.', title: 'Тыкай. Удивляйся. Сияй.',
      caption: 'Выбирай любое окошко. Дверцы любят секреты, а Гринч — эффектные появления. Если он шалит, жми розовую кнопку: подарок он всё равно отдаст.',
      button: 'Ладно, зелёный, поехали', allowRestart: true});
  }
  function confirmRestart() {
    showPopup({art: 6, icon: '🎀', type: 'info', tag: 'Начистоту, с чистого листа', title: 'Перепрячем подарки?',
      caption: 'Начнётся новая игра: история подарков в этом браузере сотрётся. Если просто передумал — нажми крестик.', button: 'Да, начать заново'
    }, async () => {
      await atomic(() => { const sound = state.sound; state = createSession(); state.sound = sound; save(); });
      closePopup();
    });
  }
  function updateSoundButton() {
    $('soundToggle').setAttribute('aria-pressed', String(state.sound));
    $('soundToggle').setAttribute('aria-label', state.sound ? 'Выключить звук' : 'Включить звук');
  }

  renderDoors(); updateSoundButton();
  $('okay').addEventListener('click', () => { if (nextAction) nextAction(); });
  $('close').addEventListener('click', closePopup);
  $('howTo').addEventListener('click', showHowTo);
  $('grinchNote').addEventListener('click', () => { if (!busy) showNote(); });
  $('loveNote').addEventListener('click', () => { if (!busy) showNote(); });
  $('restart').addEventListener('click', confirmRestart);
  $('soundToggle').addEventListener('click', async () => {
    await atomic(() => { refreshState(); state.sound = !state.sound; save(); });
    updateSoundButton(); chime();
  });
  // On small screens the active navigation link also provides the instructions.
  document.querySelector('.nav-active').addEventListener('click', event => {
    if (matchMedia('(max-width:600px)').matches) { event.preventDefault(); showHowTo(); }
  });
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
    if (event.key === KEY) { refreshState(); updateSoundButton(); }
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
