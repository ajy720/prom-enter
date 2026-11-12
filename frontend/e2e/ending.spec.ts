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

for (const ending of ['happy','ordinary','forgotten','withdrawn'] as const) {
  test(`${ending} 엔딩은 문단·마지막 문장·멤버 사진·복원·자동 진행이 이어진다`, async ({page}, info) => {
    await part4(page, {phase:'ending', ending, month:ending === 'withdrawn' ? 13 : 24, route:'domestic', renew:true});
    const scene = page.getByRole('region',{name:'엔딩',exact:true});
    await expect(scene).toHaveCSS('background-image',ending === 'happy' ? /stage\.webp/ : /practice\.webp/);
    await expect(page.locator('.monthly-sidebar')).toHaveCount(0);
    await expect(scene.locator('.ending-preface')).toHaveText('우리가 함께 걸어온 시간');
    await page.screenshot({path:info.outputPath(`${ending}-title.png`),fullPage:true});
    await scene.getByRole('button',{name:'우리의 이야기 →',exact:true}).click();
    await expect(scene.locator('.ending-text')).toBeVisible();
    await page.screenshot({path:info.outputPath(`${ending}-story.png`),fullPage:true});
    await page.reload();
    await expect(scene.locator('.ending-text')).toBeVisible();
    await expect(scene.locator('.ending-navigation button')).toHaveCount(0);
    await expect(scene).toHaveClass(/ending-memory/);
    await expect(scene).toHaveCSS('background-image',ending === 'happy' ? /stage\.webp/ : /practice\.webp/);
    await expect(scene.getByRole('heading')).toHaveCount(0);
    await expect(scene.locator('.ending-text')).toHaveCount(0);
    await expect(scene.locator('.ending-last-line')).toBeVisible();
    await page.screenshot({path:info.outputPath(`${ending}-last-line.png`),fullPage:true});
    await expect(scene.locator('.ending-navigation button')).toHaveText(['함께 남긴 기록 →']);
    await scene.getByRole('button',{name:'함께 남긴 기록 →',exact:true}).click();
    await expect(scene.locator('.ending-stats > div')).toHaveCount(5);
    await expect(scene.getByRole('button',{name:'활동·면담 기록',exact:true})).toHaveCount(0);
    await expect(scene.locator('.ending-members img')).toHaveCount(4);
    await expect(scene.locator('.ending-members figcaption')).toHaveText(ending === 'withdrawn' ? ['이도 · 탈퇴','리안','도하','세인'] : ['이도','리안','도하','세인']);
    for (const img of await scene.locator('.ending-members img').all()) {
      await expect.poll(()=>img.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await expect(img).toHaveAttribute('src',/\/profile-2\.webp$/);
      await expect(img).toHaveCSS('border-radius','16px');
      await expect(img).toHaveCSS('filter', ending === 'withdrawn' && await img.getAttribute('alt') === '이도' ? 'grayscale(1)' : 'none');
    }
    await page.screenshot({path:info.outputPath(`${ending}-summary.png`),fullPage:true});
    await expect(scene.locator('.ending-navigation button')).toHaveText(['시작 화면으로 →']);
    await noOverflow(page);
  });
}

test('7개월 조기 종료도 같은 엔딩 연출을 사용한다', async ({page}) => {
  const save = {...createPart3(), phase:'ending', results:{2:'failure',3:'failure',4:'failure',5:'failure',6:'failure',7:'failure'}};
  await page.addInitScript(({save,key}) => localStorage.setItem(key, JSON.stringify(save)), {save,key:part3SaveKey});
  await page.goto('/?part3Demo=1');
  await expect(page.getByRole('region',{name:'엔딩',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'우리의 이야기 →'}).click();
  await expect(page.locator('.ending-text')).toContainText('반복된 어려움');
  await noOverflow(page);
});

test('세 신입의 첨부 프로필2와 사진 행의 폭·비율을 유지한다', async ({page}, info) => {
  for (const [id,name,folder] of [['hyerin','이도','ido'],['seoyeon','여울','yeoul'],['jiwoo','사야','saya']]) {
    await part4(page, {newcomer:{id,name},target:id,phase:'ending',ending:'happy',month:24,route:'domestic'});
    await page.evaluate(()=>sessionStorage.setItem('prom-ending-view:sidebar-ending-check:24:happy','5'));
    await page.reload();
    const scene = page.getByRole('region',{name:'엔딩',exact:true});
    const photos = scene.locator('.ending-members img');
    await expect(photos.first()).toHaveAttribute('src',`/images/characters/${folder}/profile-2.webp`);
    for (const img of await photos.all()) {
      await expect.poll(()=>img.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      const box = (await img.boundingBox())!;
      expect(Math.abs(box.width / box.height - 1312 / 1199)).toBeLessThan(.01);
    }
    const content = (await scene.locator('.ending-content').boundingBox())!;
    const first = (await photos.first().boundingBox())!, last = (await photos.last().boundingBox())!;
    expect(Math.abs(first.x-content.x)).toBeLessThan(1);
    expect(Math.abs(last.x+last.width-content.x-content.width)).toBeLessThan(1);
    await noOverflow(page);
    await page.screenshot({path:info.outputPath(`rounded-${folder}.png`),fullPage:true});
  }
});

test('마지막 문장 전체가 1.5초 페이드인한 후 진행 버튼이 나타난다', async ({page}) => {
  await page.emulateMedia({reducedMotion:'no-preference'});
  await part4(page, {phase:'ending',ending:'happy',month:24,route:'domestic'});
  // Jump only the reading cursor; the game state and ending remain untouched.
  await page.evaluate(()=>sessionStorage.setItem('prom-ending-view:sidebar-ending-check:24:happy','4'));
  await page.reload();
  const line = page.locator('.ending-last-line');
  await expect(line).toHaveText('두 해의 끝은 새로운 시작이 되었다.');
  await expect(line).toHaveCSS('animation-duration','1.5s');
  const next = page.getByRole('button',{name:'함께 남긴 기록 →',exact:true});
  await line.evaluate(el=>{const animation=el.getAnimations()[0]; animation.pause(); animation.currentTime=750;});
  await expect(next).toBeHidden();
  const opacity = await line.evaluate(el=>Number(getComputedStyle(el).opacity));
  expect(opacity).toBeGreaterThan(0); expect(opacity).toBeLessThan(1);
  await line.evaluate(el=>{const animation=el.getAnimations()[0]; animation.currentTime=1490; animation.play();});
  await expect(next).toBeVisible();
  await expect(line).toHaveCSS('opacity','1');
});

test('문단 출력 완료 후 1.5초를 기다린 뒤 버튼 없이 다음 문단으로 이동한다', async ({page}) => {
  await page.emulateMedia({reducedMotion:'no-preference'});
  await part4(page, {phase:'ending',ending:'happy',month:24,route:'domestic'});
  await page.clock.install();
  await page.getByRole('button',{name:'우리의 이야기 →'}).click();
  const text = page.locator('.ending-text');
  await expect(text).toHaveAttribute('data-typing','true');
  await expect(page.locator('.ending-navigation button')).toHaveCount(0);
  const paragraph = (await text.locator('.sr-only').textContent())!;
  await page.clock.runFor(Array.from(paragraph).length * 30);
  await expect(text).toHaveAttribute('data-typing','false');
  await expect(text.locator('.ending-text-visible')).toHaveText(paragraph);
  await page.clock.runFor(1400);
  await expect(text.locator('.sr-only')).toHaveText(paragraph);
  await page.clock.runFor(200);
  await expect(text.locator('.sr-only')).not.toHaveText(paragraph);
  await expect(page.locator('.ending-navigation button')).toHaveCount(0);
});
