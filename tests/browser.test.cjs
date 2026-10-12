const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const {original, createSession, packetsFor} = require('../src/game.js');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const KEY = 'grinchmas.calendar.v4';
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
  assert.equal(await page.locator('.door').count(), 40);
  const pristine = await page.locator('#calendar').innerHTML();
  const session = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  const packets = packetsFor(session.order);
  const observed = [];
  let tricks = 0;
  for (let day = 1; day <= 40; day++) {
    await page.locator('#door-' + day).click();
    await page.locator('#overlay').waitFor({state:'visible'});
    if (await page.locator('#popup').evaluate(el => el.classList.contains('trick'))) {
      tricks++;
      await page.locator('#okay').click();
      await page.waitForFunction(() => !document.getElementById('popup').classList.contains('trick'));
    }
    const title = await page.locator('#popupTitle').innerText();
    if (day <= packets.length) {
      assert.equal(title, clean(original[packets[day - 1].giftId][1]));
      observed.push(title);
    }
    assert.ok((await page.locator('#popupArt').getAttribute('aria-label')).includes('Гринч'));
    assert.ok(await page.locator('#popupArt').evaluate(el => getComputedStyle(el).backgroundImage.startsWith('url("data:image/png')));
    assert.ok(await page.locator('#popup').evaluate(el => {
      const copy = el.querySelector('.popup-copy'), button = el.querySelector('.popup-button');
      return copy.offsetTop + copy.offsetHeight < button.offsetTop;
    }));
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'door-' + day);
  }
  assert.equal(tricks, 3);
  assert.equal(observed.length, 34);
  assert.equal(await page.locator('#calendar').innerHTML(), pristine);
  assert.equal(await page.locator('[role="progressbar"], .sealed, .opened, [aria-disabled="true"]').count(), 0);
  console.log('PASS: all 40 windows, 34 gifts and 3 pranks; Grinch in every popup, no permanent reveal markers.');

  const saved = await page.evaluate(key => localStorage.getItem(key), KEY);
  await page.reload();
  await page.locator('#door-5').click();
  await page.locator('#overlay').waitFor({state:'visible'});
  assert.equal(await page.locator('#popupTitle').innerText(), 'SPA');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), saved);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'close');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'okay');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'close');
  assert.equal(await page.locator('#home').evaluate(el => el.inert), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#home').evaluate(el => el.inert), false);
  console.log('PASS: reload preserves gifts; focus is trapped and restored; Escape closes the dialog.');

  await page.locator('#howTo').click();
  await page.locator('#restart').click();
  await page.locator('#close').click();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), saved);
  await page.locator('#howTo').click();
  await page.locator('#restart').click();
  await page.locator('#okay').click();
  await page.locator('#overlay').waitFor({state:'hidden'});
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).claims, KEY), {});
  console.log('PASS: resetting requires confirmation; cancelling preserves the game.');

  // Seed a known, unshuffled session to inspect the longest titles at each viewport.
  const demo = createSession(() => .5);
  demo.order = original.map((_, i) => i);
  const viewportList = [{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:1440,height:900},{width:1672,height:941},{width:844,height:390}];
  for (const viewport of viewportList) {
    await page.setViewportSize(viewport);
    await page.evaluate(({key,demo}) => localStorage.setItem(key,JSON.stringify(demo)), {key:KEY,demo});
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), JSON.stringify(viewport));
    for (let day = 1; day <= 12; day++) {
      await page.locator('#door-' + day).click();
      await page.locator('#overlay').waitFor({state:'visible'});
      if (await page.locator('#popup').evaluate(el => el.classList.contains('trick'))) {
        await page.locator('#okay').click();
        await page.waitForFunction(() => !document.getElementById('popup').classList.contains('trick'));
      }
      assert.ok(await page.locator('#popup').evaluate(el => {
        const copy = el.querySelector('.popup-copy'), button = el.querySelector('.popup-button');
        return copy.offsetTop + copy.offsetHeight <= button.offsetTop && button.scrollWidth <= button.clientWidth + 2;
      }), `Popup layout: ${viewport.width}px, day ${day}`);
      await page.locator('#okay').click();
    }
  }
  console.log('PASS: mobile, tablet, desktop and landscape layouts; all tested titles fit above the button.');

  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(({key,demo}) => localStorage.setItem(key,JSON.stringify(demo)), {key:KEY,demo});
  await page.reload();
  const page2 = await context.newPage();
  await page2.goto(url);
  await Promise.all([page.locator('#door-1').click(),page2.locator('#door-2').click()]);
  await Promise.all([page.locator('#overlay').waitFor({state:'visible'}),page2.locator('#overlay').waitFor({state:'visible'})]);
  const claims = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).claims, KEY);
  assert.deepEqual(Object.values(claims).sort(), [0,1]);
  await page2.close(); await page.keyboard.press('Escape');
  console.log('PASS: two tabs reserve distinct prizes under concurrent clicks.');

  const initialRequests = network.length;
  await context.setOffline(true);
  // Re-render the standalone HTML with the network unavailable. All art and fonts are embedded.
  await page.setContent(html, {waitUntil:'load'});
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#door-5').click();
  await page.locator('#overlay').waitFor({state:'visible'});
  assert.equal(network.length, initialRequests);
  assert.ok(await page.locator('#home').evaluate(el => getComputedStyle(el).backgroundImage.startsWith('url("data:image/png')));
  console.log('PASS: self-contained HTML renders and works offline with no external asset requests.');

  const privateContext = await browser.newContext({reducedMotion:'reduce'});
  await privateContext.addInitScript(() => Object.defineProperty(window, 'localStorage', {get() {throw new DOMException('Storage disabled', 'SecurityError');}}));
  const privatePage = await privateContext.newPage();
  await privatePage.goto(url);
  await privatePage.locator('#door-1').click();
  await privatePage.locator('#overlay').waitFor({state:'visible'});
  assert.equal(await privatePage.locator('#popupTitle').innerText(), 'Ambiente');
  assert.equal(await privatePage.locator('#storageNotice').isVisible(), true);
  console.log('PASS: storage-disabled browsers still play, with an honest persistence notice.');
  assert.deepEqual(errors, []);
  console.log('PASS: no JavaScript errors.');
})().catch(error => {console.error(error);process.exitCode=1;}).finally(async () => {if(browser)await browser.close();server.close();});
