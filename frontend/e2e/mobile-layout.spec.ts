import { expect, test } from '@playwright/test';

for (const width of [320, 360]) {
  test(`${width}px 시작 화면·안내·면담에서 가로 넘침 없이 입력할 수 있다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 568 });
    await page.goto('/');
    const noHorizontalOverflow = () => expect(page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    )).resolves.toBe(true);

    await expect(page.locator('.title-heading')).toHaveCSS('padding-left', '16px');
    await expect(page.locator('.title-screen')).toHaveCSS('min-height', '568px');
    await noHorizontalOverflow();
    await page.getByRole('button', { name: /^게임 시작/ }).click();

    const next = page.locator('.intro-navigation .primary-button');
    const candidates = page.getByRole('heading', { name: '누구와 면담할까요?' });
    for (let i = 0; i < 24 && !await candidates.isVisible(); i++) {
      const nickname = page.locator('#nickname');
      if (await nickname.isVisible()) await nickname.fill('테스트');
      const notice = page.getByRole('button', { name: /확인 · 안내 계속하기/ });
      if (await notice.isVisible()) await notice.click();
      else await next.click();
      await noHorizontalOverflow();
    }
    await expect(candidates).toBeVisible();
    await page.locator('.profile-card').filter({ hasText: '이도' }).click();
    await page.getByRole('button', { name: /면담 시작하기/ }).click();

    const room = page.locator('.candidate-interview');
    await expect(room).toHaveCSS('padding-left', '16px');
    await expect(room).toHaveCSS('min-height', '506px');
    await page.setViewportSize({ width, height: 380 });
    await page.getByRole('textbox', { name: '면담 질문' }).fill('가장 자신 있는 무대가 뭐야?');
    await page.getByRole('button', { name: '면담 질문 전송' }).click();
    await expect(page.locator('.interview-count strong')).toHaveText('1');
    await noHorizontalOverflow();
  });
}
