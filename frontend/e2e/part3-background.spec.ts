import { test, expect } from '@playwright/test';
import { newcomers, awardPortraits } from '../src/introContent';
import { createPart3, part3SaveKey, type Part3Save } from '../src/part3State';

for (const newcomer of newcomers) for (const awarded of [true, false]) {
  test(`12개월 ${newcomer.name} ${awarded ? '수상' : '미수상'} 결산과 완료는 대표실 배경`, async ({page}, info) => {
    const save: Part3Save = {...createPart3(), newcomer, target:newcomer.id, month:12, phase:'intro', cursor:1,
      speech:'함께 무대를 만든 모두에게 감사합니다.', results:{11:awarded ? 'success' : 'failure',12:awarded ? 'success' : 'failure'}};
    await page.addInitScript(({key, save})=>localStorage.setItem(key,JSON.stringify(save)), {key:part3SaveKey,save});
    await page.goto('/?part3Demo=1');
    await expect(page.locator('.monthly-progress')).toHaveCount(0);
    if (awarded) {
      await expect(page.locator('.dialogue-header h2')).toHaveText(save.newcomer.name);
      await expect(page.locator('.part3-awards')).toHaveCSS('background-image', /stage\.png/);
      await expect(page.getByRole('log')).toHaveText(save.speech);
      await expect(page.locator('.scene-resource-status')).toHaveCount(0);
      const awardPhoto=page.locator('.interview-portrait img');
      await expect(awardPhoto).toHaveAttribute('src',awardPortraits[newcomer.id]);
      await expect.poll(()=>awardPhoto.evaluate(image=>(image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      const photoBox=await page.locator('.interview-portrait').boundingBox();
      const dockBox=await page.locator('.interview-dock').boundingBox();
      expect(photoBox).not.toBeNull(); expect(dockBox).not.toBeNull();
      if (info.project.name === 'desktop') {
        expect(dockBox!.x).toBeGreaterThanOrEqual(photoBox!.x+photoBox!.width);
        expect(dockBox!.width).toBeGreaterThanOrEqual(650);
        expect(photoBox!.height).toBeLessThan(await page.evaluate(()=>innerHeight*.75));
        expect(dockBox!.y).toBeLessThan(photoBox!.y+photoBox!.height);
        expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);
        expect(Math.abs(photoBox!.y+photoBox!.height-await page.evaluate(()=>innerHeight))).toBeLessThanOrEqual(1);
      } else expect(dockBox!.y).toBeGreaterThanOrEqual(photoBox!.y+photoBox!.height-1);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      await page.screenshot({path:info.outputPath('award-speech-stage.png'),fullPage:true});
      await page.getByRole('button',{name:'다음 →',exact:true}).click();
      await page.getByRole('button',{name:'다음 →',exact:true}).click();
      await expect(page.locator('.narration-scene')).toHaveCSS('background-image', /office\.png/);
      await expect(page.getByText('12개월차 · 대표실',{exact:true})).toBeVisible();
      await page.getByRole('button',{name:'다음 →',exact:true}).click();
    }
    const scene=page.locator('.part3-awards');
    await expect(page.locator('.dialogue-header h2')).toHaveText('백하연');
    await expect(scene).toHaveCSS('background-image', /office\.png/);
    const portrait=scene.locator('.interview-portrait img');
    await expect(portrait).toBeVisible();
    await expect.poll(()=>portrait.evaluate(image=>(image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(scene.locator('.section-kicker').first()).toContainText('대표실');
    await expect(scene.locator('h1')).toHaveCSS('color','rgb(255, 255, 255)');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:info.outputPath('annual-report-office.png'),fullPage:true});
    await page.getByRole('button',{name:'반기 결산 마치기 →',exact:true}).click();
    await expect(page.getByRole('heading',{name:'우리의 첫해를 마치며'})).toBeVisible();
    await expect(scene).toHaveCSS('background-image', /office\.png/);
    await expect(page.locator('.part3-completion button')).toHaveCount(1);
    await expect(page.locator('.part3-completion a')).toHaveCount(0);
    await page.screenshot({path:info.outputPath('part3-complete-office.png'),fullPage:true});
    await expect(page.getByRole('button',{name:'13개월차 · Part 4 시작 →',exact:true})).toBeEnabled();
  });
}
