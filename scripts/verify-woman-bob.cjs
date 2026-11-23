/* Optional real-browser smoke test. Start the local server before running this file. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.WEARMATE_PLAYWRIGHT || 'playwright');
const base = process.env.WEARMATE_PREVIEW || 'http://127.0.0.1:4173';

async function check(page) {
  await page.goto(new URL('/?view=fitting', base).href);
  const avatar = page.locator('#avatar[data-profile="woman-bob"]');
  const ready = () => page.locator('#save-look-button:enabled').waitFor();
  const visible = () => avatar.locator('[data-wearable]:not([hidden])')
    .evaluateAll(nodes => Array.from(new Set(nodes.map(node => node.dataset.wearable))).sort());
  async function wear(slot, item) {
    await page.locator('#tab-' + slot).click();
    await page.locator('[data-garment="' + item + '"]:enabled').click();
  }
  async function checkCoat(items) {
    assert.deepEqual(await visible(), [...items].sort());
    const dress = avatar.locator('[data-layer="floral-maxi"]');
    const tuckedSkirt = avatar.locator('[data-layer="floral-maxi-under-coat"]');
    assert.equal(await dress.isVisible(), items.includes('floral-maxi'));
    assert.equal(await tuckedSkirt.isVisible(), false);
    await wear('outerwear', 'white-puffer');
    assert.deepEqual(await visible(), [...items, 'white-puffer'].sort());
    assert.equal(await dress.isVisible(), false);
    assert.equal(await tuckedSkirt.isVisible(), items.includes('floral-maxi'));
    await page.getByRole('button', { name: '脱下外套' }).click();
    assert.deepEqual(await visible(), [...items].sort());
    assert.equal(await dress.isVisible(), items.includes('floral-maxi'));
    assert.equal(await tuckedSkirt.isVisible(), false);
  }
  await ready();
  assert.equal(await avatar.getAttribute('data-pose'), 'standard');
  assert.deepEqual(await visible(), ['light-blue-jeans', 'purple-graphic-tee', 'white-platform-sneakers']);
  await page.getByRole('navigation').getByText('我的衣橱').click();
  const cards = page.locator('[data-garment-id]');
  await cards.first().waitFor();
  assert.equal(await cards.count(), 9);
  await page.locator('[data-garment-id="navy-shirt"]').click();
  await page.locator('#try-on-item').click();
  await ready();
  await page.locator('#tryon-feedback').getByText('已试穿', { exact: false }).waitFor();
  assert.ok((await visible()).includes('navy-shirt'));
  for (const top of ['purple-graphic-tee', 'navy-shirt']) {
    await wear('top', top);
    for (const bottom of ['gray-joggers', 'light-blue-jeans', 'black-trousers']) {
      await wear('bottom', bottom);
      for (const shoe of ['ivory-mary-janes', 'white-platform-sneakers']) {
        await wear('shoes', shoe);
        await checkCoat([top, bottom, shoe]);
      }
    }
  }
  await wear('dress', 'floral-maxi');
  for (const shoe of ['ivory-mary-janes', 'white-platform-sneakers']) {
    await wear('shoes', shoe);
    await checkCoat(['floral-maxi', shoe]);
  }
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await check(page);
    assert.deepEqual(errors, []);
    console.log('woman-bob: wardrobe try-on and 28 layered combinations passed');
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
