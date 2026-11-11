import { test, expect, type Page } from '@playwright/test';
import { createPart4, part4StorageKey } from '../src/part4State';

async function photoLayout(page: Page) {
  return page.locator('.dialogue-photo').evaluate(photo => {
    const image = photo.querySelector('img')!;
    const stage = photo.closest('section')!;
    const dock = stage.querySelector(':scope > .intro-dialogue-dock, :scope > .interview-dock')!;
    const frame = photo.getBoundingClientRect(), dialogue = dock.getBoundingClientRect();
    return { height: frame.height, bottom: frame.bottom, imageHeight: image.getBoundingClientRect().height,
      dockTop: dialogue.top, stacked: stage.classList.contains('portrait-stacked'), viewport: innerHeight };
  });
}

test('화면 보완: 나레이션 복원·세로 배치 가슴 아래 가림·가로 배치 하단 정렬', async ({ page }, info) => {
  const desktop = info.project.name === 'desktop';
  await page.goto('/');
  await page.getByRole('button', { name: /^게임 시작/ }).click();
  const title = page.locator('.narration-scene > header');
  await expect(title).toBeVisible();
  await expect(title).toHaveCSS('position', 'static');
  expect((await title.boundingBox())!.y).toBeGreaterThanOrEqual((await page.locator('.intro-topbar').boundingBox())!.height);
  expect(await page.locator('.monthly-intro-copy').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(Math.min(900, page.viewportSize()!.width - 64));
  await page.screenshot({ path: info.outputPath('narration.png'), fullPage: true });
  await page.locator('.intro-navigation .primary-button').click();
  await page.locator('.dialogue-photo img').evaluate(image => (image as HTMLImageElement).decode());
  if (desktop) {
    await expect.poll(async () => (await photoLayout(page)).stacked).toBe(true);
    const welcome = await photoLayout(page);
    expect(welcome.height).toBeCloseTo(492, 0);
    expect(Math.abs(welcome.bottom - welcome.dockTop)).toBeLessThan(1);
  }
  await page.screenshot({ path: info.outputPath('welcome.png'), fullPage: true });
  const save = { ...createPart4(undefined, 'national'), sourceId: 'portrait-layout', phase: 'interviews' };
  await page.evaluate(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), { key: part4StorageKey(save.sourceId), save });
  await page.goto('/?part4Demo=1&game=portrait-layout');
  await page.locator('.dialogue-photo img').evaluate(image => (image as HTMLImageElement).decode());
  if (desktop) {
    await expect.poll(async () => Math.abs((await photoLayout(page)).bottom - page.viewportSize()!.height)).toBeLessThan(1);
    const side = await photoLayout(page);
    await page.screenshot({ path: info.outputPath('side.png'), fullPage: true });
    await page.setViewportSize({ width: 1200, height: 1000 });
    await expect.poll(async () => (await photoLayout(page)).stacked).toBe(true);
    const stacked = await photoLayout(page);
    expect(stacked.imageHeight).toBeCloseTo(side.imageHeight, 0);
    expect(stacked.height).toBeCloseTo(492, 0);
    expect(Math.abs(stacked.bottom - stacked.dockTop)).toBeLessThan(1);
  } else {
    expect((await photoLayout(page)).stacked).toBe(false);
    await page.locator('#part4-chat').fill('현재 화면에서 이야기할 수 있는지 확인합니다.');
    await page.getByRole('button', { name: /전송$/ }).click();
    await expect(page.getByRole('status')).toContainText('1/8');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath(desktop ? 'stacked.png' : 'mobile.png'), fullPage: true });
});
