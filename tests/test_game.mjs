// Playwright tests for Color Gems.
// Usage: node tests/test_game.mjs [url]   (default: local index.html)
// Set OFFLINE=1 to block Google Fonts and test the fallback fonts.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] || pathToFileURL(path.join(here, '..', 'index.html')).href;
const shots = path.join(here, 'screenshots');
fs.mkdirSync(shots, { recursive: true });
const offline = !!process.env.OFFLINE;
const tag = offline ? '-offline' : '';
const sizes = [[360, 640], [390, 700], [430, 860]];

let pass = 0, fail = 0;
function check(name, ok, info = '') {
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  [' + info + ']' : ''));
}

const browser = await chromium.launch();
for (const [w, h] of sizes) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme });
    if (offline) await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text()) && !/ERR_FAILED/.test(m.text())) errors.push(m.text()); });
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const P = `${w}x${h} ${scheme}${tag}:`;

    const noScroll = async (label) => {
      const s = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, w: innerWidth, h: innerHeight }));
      check(`${P} no page scroll (${label})`, s.sw <= s.w && s.sh <= s.h, JSON.stringify(s));
    };
    // Is an element's content clipped/overflowing its box or the result card?
    const fits = (sel) => page.evaluate((sel) => {
      const e = document.querySelector(sel), card = document.querySelector('.out');
      const r = e.getBoundingClientRect(), c = card.getBoundingClientRect();
      return e.scrollWidth <= e.clientWidth + 1 && r.right <= c.right + 0.5 && r.bottom <= c.bottom + 0.5;
    }, sel);
    const tile = (name) => page.locator('.tile', { hasText: name }).click();
    const text = (sel) => page.locator(sel).innerText();
    const clear = () => page.click('#rs');
    const mode = async (label) => { await page.click('#bg'); await page.click(`.gm:has-text("${label}")`); };

    await noScroll('start');
    const top = await page.evaluate(() => { const h = document.querySelector('h1').getBoundingClientRect(), b = document.querySelector('#bc').getBoundingClientRect(), t = document.querySelector('.top'); return { oneLine: h.height < 40 && Math.abs(h.top + h.height / 2 - (b.top + b.height / 2)) < 12, fit: t.scrollWidth <= t.clientWidth && b.right <= innerWidth }; });
    check(`${P} header on one line`, top.oneLine && top.fit, JSON.stringify(top));
    const small = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.offsetParent && (b.getBoundingClientRect().height < 44 || b.getBoundingClientRect().width < 44)).map(b => b.textContent.trim()));
    check(`${P} touch targets >= 44px`, small.length === 0, small.join(','));
    if (scheme === 'light') await page.waitForTimeout(900), await page.screenshot({ path: path.join(shots, `${w}x${h}${tag}-1-start.png`) });

    // Free mixing
    await tile('Ruby'); await tile('Citrine');
    check(`${P} Ruby+Citrine = AMBER`, (await text('#res')) === 'AMBER', await text('#res'));
    check(`${P} formula "Ruby + Citrine"`, (await text('#rec')) === 'Ruby + Citrine', await text('#rec'));
    await tile('Sapphire');
    check(`${P} +Sapphire = SMOKY QUARTZ`, (await text('#res')) === 'SMOKY QUARTZ', await text('#res'));
    check(`${P} "Smoky quartz" fits result card`, await fits('#res'));
    await tile('Emerald'); await tile('Diamond');
    check(`${P} all four + Diamond = ONYX`, (await text('#res')) === 'ONYX', await text('#res'));
    check(`${P} Diamond hint`, (await text('#hint')).includes('Diamond makes it lighter'), await text('#hint'));
    check(`${P} Diamond formula`, (await text('#rec')).endsWith('+ Diamond (lighter)'), await text('#rec'));
    check(`${P} formula fits result card`, await fits('#rec'));
    await noScroll('5 gems');
    if (scheme === 'light') await page.waitForTimeout(900), await page.screenshot({ path: path.join(shots, `${w}x${h}${tag}-2-onyx.png`) });
    await clear();
    check(`${P} Clear resets`, (await text('#res')) === 'TAP A GEM' && (await page.locator('.tile.on').count()) === 0, await text('#res'));
    await tile('Citrine'); await tile('Sapphire'); await tile('Emerald');
    check(`${P} Dark emerald`, (await text('#res')) === 'DARK EMERALD', await text('#res'));
    check(`${P} "Dark emerald" fits result card`, await fits('#res'));
    await tile('Diamond');
    check(`${P} "Dark emerald" + Diamond formula fits`, await fits('#rec') && await fits('#res'));
    if (scheme === 'light') await page.waitForTimeout(900), await page.screenshot({ path: path.join(shots, `${w}x${h}${tag}-3-dark-emerald.png`) });
    await clear();

    // Collection: so far r,y,ry,bry,bgry,b?,... check counter and awards
    const cnt = await text('#cntb');
    const found = await page.evaluate(() => JSON.parse(localStorage.getItem('cg-found') || '[]').length);
    check(`${P} collection counter matches found gems`, cnt === `${found}/15` && found >= 6, `${cnt} found=${found}`);
    await page.click('#bc');
    const aw = await page.locator('.aw.got').allInnerTexts();
    check(`${P} Gem Finder award earned`, aw.some(a => a.includes('Gem Finder')) && !aw.some(a => a.includes('Master Jeweler')), aw.join('|'));
    if (scheme === 'light') await page.waitForTimeout(900), await page.screenshot({ path: path.join(shots, `${w}x${h}${tag}-4-collection.png`) });
    await page.locator('#sc .close').click();

    // Challenge
    await mode('Challenge');
    await page.click('#gb');
    const gt = await text('#gt');
    check(`${P} Challenge gives a target`, /^Make .+/.test(gt), gt);
    const target = await page.evaluate(() => target);
    const ids = { r: 'Ruby', y: 'Citrine', b: 'Sapphire', g: 'Emerald' };
    for (const ch of target) await tile(ids[ch]);
    check(`${P} Challenge success message`, (await text('#chk')).startsWith('Yes! You made'), await text('#chk'));
    await noScroll('challenge');
    if (scheme === 'light') await page.waitForTimeout(900), await page.screenshot({ path: path.join(shots, `${w}x${h}${tag}-5-challenge.png`) });

    // Mystery
    await mode('Mystery');
    await page.click('#gb');
    const mt = await page.evaluate(() => target);
    check(`${P} Mystery shows a color`, (await page.locator('#mg svg').count()) === 1);
    const wrong = mt.includes('r') ? 'Citrine' : 'Ruby';
    await tile(wrong); await page.click('#gb');
    check(`${P} Mystery wrong Check says "Not yet"`, (await text('#chk')).startsWith('Not yet'), await text('#chk'));
    await clear();
    for (const ch of mt) await tile(ids[ch]);
    await page.click('#gb');
    check(`${P} Mystery right Check succeeds`, (await text('#chk')).startsWith('Yes! It is'), await text('#chk'));
    await noScroll('mystery');
    if (scheme === 'light') await page.waitForTimeout(900), await page.screenshot({ path: path.join(shots, `${w}x${h}${tag}-6-mystery.png`) });

    // Two players
    await mode('Two players');
    await page.click('#gb');
    check(`${P} Hide with nothing asks to pick`, (await text('#chk')).startsWith('Pick at least one gem'), await text('#chk'));
    await tile('Sapphire'); await tile('Emerald');
    await page.click('#gb');
    check(`${P} Hide clears the window`, (await page.locator('.tile.on').count()) === 0 && (await text('#gt')) === "Player 2's turn");
    await tile('Ruby'); await page.click('#gb');
    check(`${P} wrong guess counts a try`, (await text('#chk')).includes('Wrong tries: 1'), await text('#chk'));
    await clear(); await tile('Emerald'); await tile('Sapphire'); await page.click('#gb');
    check(`${P} correct guess reports tries`, (await text('#chk')).startsWith('Correct after 1 wrong try') && (await text('#chk')).includes('Aquamarine'), await text('#chk'));
    await noScroll('two players');
    if (scheme === 'light') await page.waitForTimeout(900), await page.screenshot({ path: path.join(shots, `${w}x${h}${tag}-7-two-players.png`) });

    // Games sheet
    await page.click('#bg');
    if (scheme === 'light') await page.waitForTimeout(900), await page.screenshot({ path: path.join(shots, `${w}x${h}${tag}-8-games.png`) });
    else await page.screenshot({ path: path.join(shots, `${w}x${h}${tag}-dark.png`) });
    await page.locator('#sg .close').click();

    // Master Jeweler after all 15 + reload persistence
    await mode('Free mixing');
    const all = ['r', 'y', 'b', 'g', 'ry', 'br', 'by', 'gr', 'gy', 'bg', 'bry', 'gry', 'bgr', 'bgy', 'bgry'];
    for (const k of all) { for (const ch of k) await tile(ids[ch]); await clear(); }
    check(`${P} 15/15 collected`, (await text('#cntb')) === '15/15', await text('#cntb'));
    await page.reload(); await page.click('#bc');
    const aw2 = await page.locator('.aw.got').allInnerTexts();
    check(`${P} all awards + saved after reload`, aw2.length === 3 && (await text('#cntb')) === '15/15', aw2.join('|'));

    check(`${P} no JS errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
}

// Storage blocked: the page must still work
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
  await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.locator('.tile', { hasText: 'Ruby' }).click(); await page.locator('.tile', { hasText: 'Sapphire' }).click();
  check('storage blocked: still mixes AMETHYST', (await page.locator('#res').innerText()) === 'AMETHYST' && errors.length === 0, errors.join('|'));
  await ctx.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
