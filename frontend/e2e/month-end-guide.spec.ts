import { test, expect, type Page } from '@playwright/test';
import { advancePart3, createPart3, part3SaveKey } from '../src/part3State';
import { createPart4, part4StorageKey } from '../src/part4State';

async function guide(page: Page) {
  const box = page.locator('.dialogue-box');
  await expect(box.locator('h2')).toHaveText('백하연');
  await expect(box).not.toContainText(/성공|실패|판정|임계값/);
  await expect(box.locator('.dialogue-content')).toContainText('대표님,');
  await expect(page.locator('.narration-scene')).toHaveCount(0);
  const portrait = page.locator('.interview-portrait img');
  await expect(portrait).toHaveAttribute('src', /hayeon/);
  await expect.poll(() => portrait.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test('7~11개월 월말 안내·실제 변화·복원과 11개월 수상 비공개', async ({page}, info) => {
  for (const month of [7,8,9,10,11]) for (const outcome of ['success','failure'] as const) {
    const save = month === 8 && outcome === 'success'
      ? advancePart3({...createPart3(),month:8,phase:'decision'}, {type:'decide',choice:'vacation'})
      : {...createPart3(), month, phase:'result', results:{[month]:outcome}, lastDelta:month === 11 ? {} : {teamwork:-5,fatigue:0}};
    await page.addInitScript(({key,save}) => localStorage.setItem(key,JSON.stringify(save)), {key:part3SaveKey,save});
    await page.goto('/?part3Demo=1');
    await guide(page);
    if (month === 11) {
      await expect(page.locator('.dialogue-box')).toContainText('스텟 변화 없음');
      await expect(page.getByRole('log')).not.toContainText(/수상했|수상하지|미수상/);
    } else await expect(page.locator('.dialogue-box [aria-label="이번 달 스텟 변화"]')).toContainText(month === 8 && outcome === 'success' ? '-40' : '-5');
    if (month === 8 && outcome === 'success') {
      await page.screenshot({path:info.outputPath('month-end-hayeon.png'), fullPage:true});
      await page.reload(); await guide(page);
      await page.getByRole('button',{name:'9개월차로 →',exact:true}).click();
      expect((await page.evaluate(key => JSON.parse(localStorage.getItem(key)!),part3SaveKey)).month).toBe(9);
    }
  }
});

test('13~22개월 모든 결과·국내외 안내와 예전 저장 복원', async ({page}, info) => {
  for (const month of [13,14,15,16,17,18,19,20,21,22]) for (const route of ['domestic','overseas'] as const) for (const outcome of ['success','partial','failure','neutral'] as const) {
    const sourceId = `guide-${month}-${route}-${outcome}`;
    const save = {...createPart4(undefined,'national'), sourceId, month, route, phase:'result', results:{[month]:outcome}, lastDelta:{funds_won:-20000000},resultText:'이전 결과 나레이션'};
    await page.addInitScript(({key,save}) => localStorage.setItem(key,JSON.stringify(save)), {key:part4StorageKey(sourceId),save});
    await page.goto(`/?part4Demo=1&game=${sourceId}`);
    await guide(page);
    await expect(page.locator('.dialogue-box [aria-label="이번 달 스텟 변화"]')).toContainText('-0.20억원');
    if(month===18&&outcome==='neutral') await expect(page.getByRole('log')).toContainText(route==='overseas'?'계약을 마쳤':'거절했습니다');
    if(month===19&&route==='overseas') await expect(page.getByRole('log')).toContainText('현지 무대');
    if(month===21&&outcome==='failure'&&route==='domestic') {
      await page.screenshot({path:info.outputPath('concert-guide.png'),fullPage:true});
      await page.reload(); await guide(page);
      await page.getByRole('button',{name:'22개월차로 →',exact:true}).click();
      expect((await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),part4StorageKey(sourceId))).month).toBe(22);
    }
  }
});
