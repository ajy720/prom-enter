import { test, expect } from '@playwright/test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { PhotoSlot } from '../src/PhotoSlot';
import { portraitFrames } from '../src/portraitFrames';

// Exercise the real component and stylesheet cascade with every supplied pose.
// Pixel bounds are measured independently from the WebP alpha channel in-browser.
test('42종 대화 사진은 장면·화면 크기와 무관하게 잘림 없이 같은 높이를 유지한다', async ({ page }) => {
  const css = ['style.css', 'design-system.css', 'part2.css', 'part3.css', 'part4.css', 'portraits.css']
    .map(file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')).join('\n');
  const scenes = [
    ['intro-scene prologue-scene part-one-photos', 'secretary-photo'],
    ['interview-room candidate-interview interview-refined part-one-photos', 'interview-portrait'],
    ['interview-room month-photo-stage month-one-photos part4-stage', 'interview-portrait'],
    ['monthly-stage server-monthly-stage month-two-photos', 'monthly-portrait'],
    ['character-introduction part-one-photos', 'introduction-photo'],
  ];
  const body = scenes.map(([scene, container]) => Object.keys(portraitFrames).map((file, i) =>
    `<section class="${scene}"><div class="${container}">${renderToStaticMarkup(createElement(PhotoSlot, { src: `/images/characters/${file}`, name: file }))}</div><div class="interview-dock intro-dialogue-dock monthly-dock introduction-copy"><div class="dialogue-content">${'대사 길이가 바뀌어도 사진 크기를 유지합니다. '.repeat(i % 2 ? 60 : 1)}</div></div></section>`
  ).join('')).join('');
  await page.route('**/portrait-fixture', route => route.fulfill({ contentType: 'text/html', body: `<style>${css}</style><div id="root">${body}</div>` }));
  await page.goto('/portrait-fixture');
  await page.locator('img').evaluateAll(async images => { await Promise.all(images.map(image => (image as HTMLImageElement).decode())); });
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1440, height: 600 }, { width: 1200, height: 1000 }, { width: 1001, height: 600 }, { width: 950, height: 600 }, { width: 760, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    const result = await page.locator('.dialogue-photo').evaluateAll(slots => {
      const cache = new Map<string, number[]>();
      return slots.map(slot => {
        const img = slot.querySelector('img')!;
        let bounds = cache.get(img.src);
        if (!bounds) {
          const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
          const context = canvas.getContext('2d')!; context.drawImage(img, 0, 0);
          const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let left = canvas.width, top = canvas.height, right = 0, bottom = 0;
          for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) if (data[(y * canvas.width + x) * 4 + 3]) {
            left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
          }
          bounds = [left, top, right, bottom]; cache.set(img.src, bounds);
        }
        const frame = slot.getBoundingClientRect(), image = img.getBoundingClientRect(), scale = image.height / img.naturalHeight;
        return { source: img.alt, scene: slot.parentElement!.parentElement!.className,
          height: (bounds[3] - bounds[1]) * scale,
          clipped: image.left + bounds[0] * scale < frame.left - 1 || image.right - (img.naturalWidth - bounds[2]) * scale > frame.right + 1
            || image.top + bounds[1] * scale < frame.top - 1 || image.top + bounds[3] * scale > frame.bottom + 1 };
      });
    });
    expect(result.filter(item => item.clipped), JSON.stringify(viewport)).toEqual([]);
    expect(Math.max(...result.map(item => item.height)) - Math.min(...result.map(item => item.height))).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), JSON.stringify(viewport)).toBe(true);
  }
});
