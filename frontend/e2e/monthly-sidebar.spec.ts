import { test, expect, type Page } from '@playwright/test';
import { createPart3, part3SaveKey } from '../src/part3State';
import { createPart4, part4StorageKey, type Part4Save } from '../src/part4State';

async function part4(page: Page, patch: Partial<Part4Save>) {
  const save = {...createPart4(undefined, 'national'), sourceId:'sidebar-ending-check', ...patch};
  await page.goto('/');
  await page.evaluate(({save,key}) => localStorage.setItem(key, JSON.stringify(save)), {save,key:part4StorageKey(save.sourceId)});
  await page.goto('/?part4Demo=1&game=sidebar-ending-check');
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test('7~24개월 정보는 동일한 제목·설명·네 스텟과 할 일을 표시한다', async ({page}, info) => {
  for (let month = 7; month <= 24; month++) {
    if (month <= 12) {
      const save = {...createPart3(), month, phase:month === 12 ? 'complete' : 'decision'};
      await page.goto('/');
      await page.evaluate(({save,key}) => localStorage.setItem(key,JSON.stringify(save)), {save,key:part3SaveKey});
      await page.goto('/?part3Demo=1');
    } else await part4(page, {month, phase:month === 23 ? 'intro' : 'decision', cursor:month === 23 ? 3 : 0, route:month >= 19 ? 'domestic' : null});
    const sidebar = page.getByRole('complementary', {name:`${month}개월 차 활동 정보`});
    await expect(sidebar.locator('.section-kicker')).toHaveText(`${month}개월 차`);
    await expect(sidebar.locator('h1')).toHaveCSS('font-size','23px');
    await expect(sidebar.locator('.monthly-sidebar-description')).toHaveCSS('font-size','13px');
    await expect(sidebar.locator('.team-status-value > span')).toHaveText(['팀워크','스트레스·피로도','인지도','팬 수']);
    await expect(sidebar.locator('.team-status-value > strong').first()).toHaveCSS('font-size','23px');
    for (const value of await sidebar.locator('.team-status-value > strong').all()) expect((await value.boundingBox())!.height).toBeLessThanOrEqual(35);
    await expect(sidebar.getByRole('list',{name:'이번 달 해야 할 일'})).toBeVisible();
    await noOverflow(page);
    if ([7,13,22].includes(month)) await page.screenshot({path:info.outputPath(`month-${month}.png`),fullPage:true});
  }
});
