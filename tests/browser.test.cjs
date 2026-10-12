const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const {original, createSession} = require('../src/game.js');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const KEY = 'grinchmas.calendar.v5';
const LEGACY_KEY = 'grinchmas.calendar.v4';
const clean = name => name.replace(/\s*🔥/gu, '').trim();
let browser;
const server = http.createServer((req, res) => {res.setHeader('Content-Type', 'text/html; charset=utf-8');res.end(html);});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({executablePath, headless: true, args: ['--no-sandbox']});
  const context = await browser.newContext({viewport: {width:1672, height:941}, reducedMotion:'reduce'});
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const errors = [], network = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', req => {if (/^https?:/.test(req.url())) network.push(req.url());});
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.ok(!/[А-Яа-яЁё]/u.test(html), 'The complete standalone calendar must be in English.');
  assert.equal(await page.locator('.door').count(), 40);
  assert.equal(await page.locator('#close, #howTo, #grinchNote, #soundToggle, #loveNote, .popup-close').count(), 0);
  assert.equal(await page.locator('.header button').count(), 1);
  assert.equal(await page.locator('#restart').innerText(), 'Restart');
  const session = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  const observed = [];
  let tricks = 0;
  for (let day = 1; day <= 40; day++) {
    await page.locator('#door-' + day).click();
    await page.locator('#overlay').waitFor({state:'visible'});
    const isTrick = await page.locator('#popup').evaluate(el => el.classList.contains('trick'));
    const title = await page.locator('#popupTitle').innerText();
    assert.equal(await page.locator('#popupWindow').innerText(), 'WINDOW ' + String(day).padStart(2, '0'));
    assert.equal(await page.locator('#popup button:visible').count(), 1);
    if (day <= original.length) {
      const gift = original[session.order[day - 1]];
      assert.equal(title, clean(gift[1]));
      assert.equal(await page.locator('#door-' + day).isDisabled(), true);
      assert.ok(await page.locator('#door-' + day).evaluate(el => el.classList.contains('opened')));
      if (isTrick) tricks++;
      else observed.push(title);
    }
    assert.ok((await page.locator('#popupArt').getAttribute('aria-label')).includes('Grinch'));
    assert.ok(await page.locator('#popupArt').evaluate(el => getComputedStyle(el).backgroundImage.startsWith('url("data:image/png')));
    assert.ok(await page.locator('#popup').evaluate(el => {
      const copy = el.querySelector('.popup-copy'), button = el.querySelector('.popup-button');
      return copy.offsetTop + copy.offsetHeight < button.offsetTop;
    }));
    const beforeClose = await page.evaluate(key => localStorage.getItem(key), KEY);
    if (isTrick) {
      assert.ok(!/another|try again|next window|still out there/i.test(await page.locator('#popup').innerText()), 'Losing popups must not announce an extra pick.');
      await page.locator('#okay').click();
    } else await page.keyboard.press('Escape');
    await page.locator('#overlay').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), beforeClose, 'Closing a loss must not reserve another prize.');
    assert.equal(await page.evaluate(() => document.activeElement.disabled), false);
    if (day === 8) await page.screenshot({path:'/tmp/grinch-opened-desktop.png'});
  }
  assert.equal(tricks, 3);
  assert.equal(observed.length, 34);
  assert.equal(await page.locator('.door.opened:disabled').count(), 37);
  assert.equal(await page.locator('.door:not(.opened):not(:disabled)').count(), 3);
  assert.equal(await page.locator('[role="progressbar"], .counter, .sealed').count(), 0);
  console.log('PASS: all prizes and losses; opened doors remain open and disabled; losses require a new pick; English throughout.');

  const saved = await page.evaluate(key => localStorage.getItem(key), KEY);
  await page.reload();
  assert.equal(await page.locator('.door.opened:disabled').count(), 37);
  assert.equal(await page.locator('#door-5 .opened-gift').innerText(), 'SPA');
  await page.locator('#door-5').evaluate(button => button.click());
  assert.equal(await page.locator('#overlay').isVisible(), false);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), saved);
  await page.locator('#door-38').click();
  await page.locator('#overlay').waitFor({state:'visible'});
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'okay');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'okay');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'okay');
  assert.equal(await page.locator('#home').evaluate(el => el.inert), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#home').evaluate(el => el.inert), false);
  console.log('PASS: opened state survives reload; disabled windows cannot reopen; keyboard and focus work.');

  await page.locator('#restart').click();
  assert.equal(await page.locator('#popupWindow').isVisible(), false);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'okay');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'cancelRestart');
  await page.locator('#cancelRestart').click();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), saved);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'restart');
  await page.locator('#restart').click();
  await page.locator('#okay').click();
  await page.locator('#overlay').waitFor({state:'hidden'});
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).claims, KEY), {});
  assert.equal(await page.locator('.door.opened, .door:disabled').count(), 0);
  await page.locator('#door-29').click();
  await page.locator('#overlay').waitFor({state:'visible'});
  assert.equal(await page.locator('#popupTitle').innerText(), 'Ambiente');
  assert.equal(await page.locator('#popupWindow').innerText(), 'WINDOW 29', 'Show the picked window, not the gift queue position.');
  await page.locator('#okay').click();
  console.log('PASS: only a confirmed new game closes and re-enables the windows.');

  const demo = createSession(() => .5);
  demo.order = original.map((_, i) => i);
  const viewportList = [{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:1440,height:900},{width:1672,height:941},{width:844,height:390}];
  for (const viewport of viewportList) {
    await page.setViewportSize(viewport);
    await page.evaluate(({key,demo}) => localStorage.setItem(key,JSON.stringify(demo)), {key:KEY,demo});
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), JSON.stringify(viewport));
    assert.equal(await page.locator('#restart').isVisible(), true);
    for (const day of [6, 29]) {
      assert.ok(await page.locator('#door-' + day).evaluate(el => {
        const door = el.getBoundingClientRect(), cane = el.querySelector('svg.candy-cane').getBoundingClientRect();
        return cane.left > door.left && cane.right < door.right && cane.top > door.top && cane.bottom < door.bottom;
      }), `Candy cane inside window ${day} at ${viewport.width}px`);
    }
    if (viewport.width === 1672) await page.screenshot({path:'/tmp/grinch-revised-calendar.png'});
    for (let day = 1; day <= original.length; day++) {
      await page.locator('#door-' + day).click();
      await page.locator('#overlay').waitFor({state:'visible'});
      assert.ok(await page.locator('#popup').evaluate(el => {
        const copy = el.querySelector('.popup-copy'), button = el.querySelector('.popup-button');
        return copy.offsetTop + copy.offsetHeight <= button.offsetTop && button.scrollWidth <= button.clientWidth + 2;
      }), `Popup layout: ${viewport.width}px, day ${day}`);
      if ([1, 3, 5, 21, 23, 25].includes(day)) {
        const expected = {1:['amber','holly',true],3:['ice','stars',true],5:['rose','bow',true],21:['gold','bow',false],23:['mint','ornament',false],25:['amber','ornament',true]}[day];
        assert.equal(await page.locator('#popup').evaluate((el, theme) => el.classList.contains('theme-' + theme), expected[0]), true);
        assert.equal(await page.locator('#popupDecoration').getAttribute('href'), expected[1] === 'holly' ? '#holly' : '#decor-' + expected[1]);
        assert.equal(await page.locator('#popupArt').evaluate(el => el.classList.contains('revised-art')), expected[2]);
        if (viewport.width === 1672 || viewport.width === 390) await page.screenshot({path:`/tmp/grinch-revised-${viewport.width}-${day}.png`});
      }
      if (viewport.width === 390 && day === 7) await page.screenshot({path:'/tmp/grinch-english-loss-mobile.png'});
      await page.locator('#okay').click();
      if (viewport.width === 390 && day === 8) await page.screenshot({path:'/tmp/grinch-opened-mobile.png',fullPage:true});
    }
  }
  console.log('PASS: every English gift and loss popup fits mobile, tablet, desktop and landscape layouts.');

  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(({key,demo}) => localStorage.setItem(key,JSON.stringify(demo)), {key:KEY,demo});
  await page.reload();
  const page2 = await context.newPage();
  await page2.goto(url);
  await Promise.all([page.locator('#door-1').evaluate(el=>el.click()),page2.locator('#door-1').evaluate(el=>el.click())]);
  await Promise.all([page,page2].map(p=>p.waitForFunction(()=>document.getElementById('door-1').disabled)));
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).claims, KEY), {'1':0});
  const openDialogs = Number(await page.locator('#overlay').isVisible()) + Number(await page2.locator('#overlay').isVisible());
  assert.equal(openDialogs,1);
  for(const p of [page,page2]) if(await p.locator('#overlay').isVisible()) await p.keyboard.press('Escape');
  await page.locator('#door-2').click();
  await page.locator('#overlay').waitFor({state:'visible'});
  await page2.waitForFunction(()=>document.getElementById('door-2').disabled);
  assert.equal(await page2.locator('#door-2').getAttribute('aria-label'), await page.locator('#door-2').getAttribute('aria-label'));
  await page2.close(); await page.keyboard.press('Escape');
  console.log('PASS: simultaneous picks of the same door award once; other tabs update their opened windows.');

  const old={version:4,order:original.map((_,i)=>i),claims:Object.fromEntries(Array.from({length:8},(_,i)=>[i+1,i])),stillDoors:[5,20,32],seenTeases:{},sound:false};
  const migrationContext=await browser.newContext({reducedMotion:'reduce'});
  await migrationContext.addInitScript(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:LEGACY_KEY,state:old});
  const migrationPage=await migrationContext.newPage();
  await migrationPage.goto(url);
  assert.equal(await migrationPage.locator('.door.opened:disabled').count(),8);
  assert.equal(await migrationPage.locator('#door-7 .opened-gift').innerText(),'Nintendo Switch 2');
  const migrated=await migrationPage.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
  assert.deepEqual(migrated.retired,[6]);
  await migrationPage.locator('#door-9').click();
  await migrationPage.locator('#overlay').waitFor({state:'visible'});
  assert.equal(await migrationPage.locator('#popupTitle').innerText(),'Oral-B iO Series 6');
  console.log('PASS: old games migrate without resetting already awarded gifts.');

  const initialRequests = network.length;
  await context.setOffline(true);
  await page.setContent(html, {waitUntil:'load'});
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#door-5').click();
  await page.locator('#overlay').waitFor({state:'visible'});
  assert.equal(network.length, initialRequests);
  assert.ok(await page.locator('#home').evaluate(el => getComputedStyle(el).backgroundImage.startsWith('url("data:image/png')));
  console.log('PASS: standalone HTML works without external asset requests.');

  const privateContext = await browser.newContext({reducedMotion:'reduce'});
  await privateContext.addInitScript(() => Object.defineProperty(window, 'localStorage', {get() {throw new DOMException('Storage disabled', 'SecurityError');}}));
  const privatePage = await privateContext.newPage();
  await privatePage.goto(url);
  await privatePage.locator('#door-1').click();
  await privatePage.locator('#overlay').waitFor({state:'visible'});
  assert.equal(await privatePage.locator('#popupTitle').innerText(), 'Ambiente');
  assert.equal(await privatePage.locator('#storageNotice').isVisible(), true);
  await privatePage.locator('#okay').click();
  assert.equal(await privatePage.locator('#door-1').isDisabled(),true);
  console.log('PASS: storage-disabled browsers keep opened windows for the current tab and explain the limitation.');
  assert.deepEqual(errors, []);
  console.log('PASS: no JavaScript errors.');
})().catch(error => {console.error(error);process.exitCode=1;}).finally(async () => {if(browser)await browser.close();server.close();});
