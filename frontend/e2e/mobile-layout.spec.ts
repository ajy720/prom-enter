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
    let checkedProfiles = false;
    for (let i = 0; i < 24 && !await candidates.isVisible(); i++) {
      const nickname = page.locator('#nickname');
      if (await nickname.isVisible()) await nickname.fill('테스트');
      const profiles = page.getByRole('button', { name: '데뷔조 프로필 보기' });
      if (!checkedProfiles && await profiles.isVisible()) {
        await profiles.click();
        const dialog = page.getByRole('dialog', { name: '기존 데뷔조 프로필' });
        for (const name of ['리안', '도하', '세인']) {
          await dialog.locator('.profile-card').filter({ hasText: name }).click();
          await expect(dialog.getByRole('heading', { name, exact: true })).toBeVisible();
          await expect(dialog.getByRole('button', { name: '나가기' })).toBeInViewport();
          expect(await dialog.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
        }
        await dialog.getByRole('button', { name: '나가기' }).click();
        checkedProfiles = true;
      }
      const notice = page.getByRole('button', { name: /확인 · 안내 계속하기/ });
      if (await notice.isVisible()) await notice.click();
      else await next.click();
      await noHorizontalOverflow();
    }
    expect(checkedProfiles).toBe(true);
    await expect(candidates).toBeVisible();
    await page.locator('.profile-card').filter({ hasText: '이도' }).click();
    await page.getByRole('button', { name: /면담 시작하기/ }).click();

    const room = page.locator('.candidate-interview');
    await expect(room).toHaveCSS('padding-left', '16px');
    await expect(room).toHaveCSS('min-height', '506px');
    await page.setViewportSize({ width, height: 380 });
    const input = page.getByRole('textbox', { name: '면담 질문' });
    await input.fill('가장 자신 있는 무대가 뭐야?');
    await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true });
    await expect(page.locator('.interview-count strong')).toHaveText('0');
    await page.getByRole('button', { name: '면담 질문 전송' }).click();
    await expect(page.locator('.interview-count strong')).toHaveText('1');
    await expect(input).toBeFocused();
    await input.fill('팀에서 어떤 역할을 맡고 싶어?');
    await input.press('Enter');
    await expect(page.locator('.interview-count strong')).toHaveText('2');
    await expect(input).toBeFocused();
    await page.getByRole('button', { name: '면담 마무리', exact: true }).click();
    await page.getByRole('button', { name: /면담 상대 목록으로/ }).click();
    const completed = page.locator('.profile-card').filter({ hasText: '이도' });
    await expect(completed.getByText('면담 완료')).toBeVisible();
    const unopened = page.locator('.profile-card').filter({ hasText: '여울' });
    await expect(unopened.getByText('면담 전')).toBeVisible();
    expect(await completed.locator('.profile-number').evaluate(element => getComputedStyle(element).backgroundColor))
      .not.toBe(await unopened.locator('.profile-number').evaluate(element => getComputedStyle(element).backgroundColor));
    await noHorizontalOverflow();
  });
}
