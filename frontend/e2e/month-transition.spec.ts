import { test, expect } from '@playwright/test';
import { createPart3, part3SaveKey } from '../src/part3State';

test('월 변경에만 어두워짐·밝아짐을 적용하고 두 화면을 겹치거나 비우지 않는다', async ({page}) => {
  await page.emulateMedia({reducedMotion:'no-preference'});
  const save = {...createPart3(), month:7, phase:'result', results:{7:'success'}};
  await page.addInitScript(({save,key}) => {
    localStorage.setItem(key,JSON.stringify(save));
    const stats = {started:0, finished:0, frames:[] as {old:string;next:string;filter:string}[]};
    Object.assign(window,{monthTransitionStats:stats});
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = callback => {
      stats.started++;
      const transition = start(callback);
      void transition.ready.then(() => {
        const animations = document.getAnimations().filter(animation => animation instanceof CSSAnimation && animation.animationName.startsWith('month-'));
        for (const time of [70,140,210]) {
          for (const animation of animations) { animation.pause(); animation.currentTime=time; }
          const old = getComputedStyle(document.documentElement,'::view-transition-old(root)');
          const next = getComputedStyle(document.documentElement,'::view-transition-new(root)');
          stats.frames.push({old:old.visibility,next:next.visibility,filter:time === 70 ? old.filter : next.filter});
        }
        for (const animation of animations) animation.play();
      }).catch(() => {});
      void transition.finished.then(() => stats.finished++);
      return transition;
    };
  }, {save,key:part3SaveKey});
  const stats = () => page.evaluate(() => (window as unknown as {monthTransitionStats:{started:number;finished:number;frames:{old:string;next:string;filter:string}[]}}).monthTransitionStats);
  await page.goto('/?part3Demo=1');
  const next = page.locator('.part3-stage .monthly-buttons .primary-button');
  await next.click(); // Reveal the rest of the narration.
  expect((await stats()).started).toBe(0);
  await next.click();
  await expect.poll(async () => (await stats()).finished).toBe(1);
  expect((await stats()).frames.map(({old,next}) => [old,next])).toEqual([
    ['visible','hidden'],['hidden','visible'],['hidden','visible'],
  ]);
  expect((await stats()).frames[0].filter).not.toBe('brightness(1)');
  await expect(page.locator('.part3-stage h1')).toHaveText('다시 숨을 고르는 시간');
  await next.click(); // Reveal month-eight narration.
  await next.click(); // Same-month secretary briefing.
  await expect(page.locator('.dialogue-header h2')).toHaveText('백하연');
  expect((await stats()).started).toBe(1);
});

test('일반 장면 이동에는 화면 전환 효과를 호출하지 않는다', async ({page}) => {
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.addInitScript(() => {
    Object.assign(window,{monthTransitionCalls:0});
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = callback => {
      (window as unknown as {monthTransitionCalls:number}).monthTransitionCalls++;
      return start(callback);
    };
  });
  await page.goto('/');
  await page.getByRole('button',{name:/^게임 시작/}).click();
  await page.locator('.intro-navigation .primary-button').click();
  await page.locator('.intro-navigation .primary-button').click();
  await expect(page.locator('.dialogue-header h2')).toHaveText('백하연');
  expect(await page.evaluate(() => (window as unknown as {monthTransitionCalls:number}).monthTransitionCalls)).toBe(0);
});
