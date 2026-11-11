import { expect, test } from '@playwright/test';

test('시작 사진을 먼저 받고 전환 사진은 나중에 요청한다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  let releaseFirst!: () => void;
  const firstCanLoad = new Promise<void>(resolve => { releaseFirst = resolve; });
  const requested: string[] = [];
  await page.route(/\/images\/scenes\/title-[^/]+\.webp$/, async route => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)!;
    requested.push(name);
    if (name.startsWith('title-white')) await firstCanLoad;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => requested).toEqual([expect.stringMatching(/^title-white(-768)?\.webp$/)]);
  releaseFirst();
  await expect.poll(() => requested.length).toBe(3);
  await expect(page.locator('.title-photo-stack img').first()).toHaveJSProperty('complete', true);
});

test('동작 줄이기 설정은 첫 사진만 표시한다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.title-photo-stack img')).toHaveCount(1);
  await expect(page.locator('.title-photo-stack img')).toHaveJSProperty('complete', true);
  await expect(page.locator('.title-photo-stack img')).toHaveClass('is-active');
});
