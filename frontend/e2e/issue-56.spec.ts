import { test, expect } from '@playwright/test';

test('나레이션은 빠르게 출력하고 첫 다음으로 전체 표시, 두 번째 다음으로 진행한다', async ({page}) => {
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.clock.install({time:new Date('2026-11-12T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-11-12T00:00:01Z'));
  await page.goto('/');
  await page.getByRole('button',{name:/^게임 시작/}).click();
  const narration = page.locator('.narration-typewriter');
  await expect(narration).toHaveAttribute('data-typing','true');
  const title = await page.locator('.narration-scene h1').textContent();
  const before = await narration.boundingBox();
  await page.clock.runFor(100);
  expect(await narration.locator('.narration-visible').textContent()).not.toBe('');
  const full = await narration.locator('.sr-only').textContent();
  expect((await narration.locator('.narration-visible').textContent())!.length).toBeLessThan(full!.length);
  await page.screenshot({path:test.info().outputPath('narration-typing.png'),fullPage:true});
  await page.locator('.intro-navigation .primary-button').click();
  await expect(narration).toHaveAttribute('data-typing','false');
  await expect(narration.locator('.narration-visible')).toHaveText(full!);
  await expect(page.locator('.narration-scene h1')).toHaveText(title!);
  await page.screenshot({path:test.info().outputPath('narration-complete.png'),fullPage:true});
  const after = await narration.boundingBox();
  expect(after!.height).toBe(before!.height);
  await page.locator('.intro-navigation .primary-button').click();
  await expect(page.locator('.narration-scene')).toHaveCount(0);
  const brand = page.locator('.intro-brand');
  await brand.hover();
  await expect(brand).toHaveCSS('text-decoration-line','none');
  await expect(brand).toHaveCSS('font-family',/DM Serif Text/);
});

test('동작 줄이기에서는 나레이션을 즉시 표시하고 한 번에 진행한다', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:/^게임 시작/}).click();
  await expect(page.locator('.narration-typewriter')).toHaveAttribute('data-typing','false');
  await page.locator('.intro-navigation .primary-button').click();
  await expect(page.locator('.narration-scene')).toHaveCount(0);
});
