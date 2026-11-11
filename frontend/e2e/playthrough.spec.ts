import { test, expect, type Page } from '@playwright/test';
import { createPlaythrough } from '../src/playthroughState';
import { advancePart3 } from '../src/part3State';
import { createMonthlyFixture } from '../src/monthlyFixture';

async function layout(page: Page) {
  await expect(page.locator('.intro-topbar').getByRole('button',{name:'시작 화면',exact:true})).toHaveCount(0);
  await expect(page.locator('.intro-topbar').getByRole('link',{name:'시작 화면',exact:true})).toHaveCount(0);
  const brand = page.locator('.intro-topbar .intro-brand');
  if (await brand.count()) await expect(brand).toHaveCSS('text-decoration-line', 'none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  if ((await page.viewportSize())!.width >= 1001) {
    const overlapping = await page.locator('.candidate-interview, .month-photo-stage, .monthly-stage, .monthly-intro').evaluateAll(stages => stages.some(stage => {
      const info = stage.querySelector(':scope > .interview-info, :scope > .monthly-info, :scope > header');
      const portrait = stage.querySelector(':scope > .interview-portrait:has(.dialogue-photo), :scope > .monthly-portrait:has(.dialogue-photo), :scope > .monthly-intro-portrait:has(.dialogue-photo)');
      if (!info || !portrait) return false;
      const a = info.getBoundingClientRect(), b = portrait.getBoundingClientRect();
      return a.width > 0 && b.width > 0 && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
    }));
    expect(overlapping).toBe(false);
  }
  const composer = page.locator('.chat-composer textarea:visible');
  if(await composer.count()) expect((await composer.boundingBox())!.height).toBeLessThanOrEqual(46);
  const progress=page.locator('.part3-stage .monthly-progress');
  if(await progress.count()) expect(await progress.evaluate(e=>e.scrollHeight <= e.clientHeight+1)).toBe(true);
}
async function shot(page:Page, name:string) { await layout(page); await page.screenshot({path:test.info().outputPath(`${name}.png`),fullPage:true}); }
async function serverAction(page:Page, action:()=>Promise<unknown>) {
  const response = page.waitForResponse(r=>r.url().includes('/turns') && r.request().method()==='POST');
  await action(); const r=await response; expect(r.ok(),await r.text()).toBe(true); return (await r.json()).game;
}
async function chat(page:Page, label:string, text='함께 준비하자. 필요한 도움을 이야기해줘.') {
  await page.getByRole('textbox',{name:label,exact:true}).fill(text);
  await page.getByRole('button',{name:`${label} 전송`,exact:true}).click();
}
async function serverChat(page:Page,label:string,text?:string) { return serverAction(page,()=>chat(page,label,text)); }
async function resume(page:Page, legacy = false) {
  await page.reload();
  await page.getByRole('button',{name:legacy ? '이전 브라우저 데모 열기' : '이야기 이어하기',exact:true}).click();
}
async function prologue(page:Page) {
  await page.goto('/'); await shot(page,'title');
  await page.getByRole('button',{name:/^게임 시작/}).click();
  for(let i=0;i<24;i++) {
    if(await page.locator('.selection-screen.interview-hub').isVisible()) break;
    if(await page.locator('#nickname').isVisible()) await page.locator('#nickname').fill('테스트');
    const modal=page.locator('dialog[open]');
    if(await modal.count()) await modal.getByRole('button',{name:/확인 · 안내 계속하기/}).click();
    else await page.locator('.intro-navigation .primary-button').click();
  }
  await expect(page.getByRole('heading',{name:'누구와 면담할까요?'})).toBeVisible();
}
async function cast(page:Page, selected:string) {
  for(const name of ['이도','여울','사야']) {
    await page.locator('.profile-card').filter({hasText:name}).click();
    const opening=page.getByRole('button',{name:/면담 시작하기/});
    await opening.click();
    await serverChat(page,'면담 질문');
    await serverAction(page,()=>page.getByRole('button',{name:'면담 마무리',exact:true}).click());
    await serverAction(page,()=>page.getByRole('button',{name:/면담 상대 목록으로/}).click());
  }
  await page.getByRole('button',{name:/최종 영입 선택/}).click();
  await page.locator('.profile-card').filter({hasText:selected}).click();
  await page.getByRole('button',{name:`${selected} 영입하기`}).click();
  await serverAction(page,()=>page.getByRole('button',{name:'영입 확정',exact:true}).click());
  await page.locator('dialog[open]').getByRole('button',{name:/다음 이야기로/}).click();
  await page.locator('.intro-navigation').getByRole('button',{name:/다음/}).click();
  await page.locator('.intro-navigation').getByRole('button',{name:/다음/}).click();
  await page.getByRole('button',{name:/활동 방향 선택/}).click();
  await page.getByRole('radio',{name:/국민 그룹/}).check();
  await page.getByRole('button',{name:/목표 확정 · 첫 합숙 시작/}).click();
}
async function opening(page:Page) {
  for(let i=0;i<16;i++) {
    const old=page.locator('.monthly-intro');
    if(await old.isVisible()) {
      if(['나레이션','기자'].includes((await old.locator('.dialogue-header h2').textContent()) ?? '')) {
        await expect(old.locator('.interview-info, .scene-resource-status')).toHaveCount(0);
        if((await old.locator('.dialogue-header h2').textContent()) === '기자' || (await old.getByRole('log').textContent())?.includes('오늘은 데뷔 쇼케이스')) await expect(old).toHaveCSS('background-image', /stage\.png/);
        expect(await old.locator('.dialogue-box').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');
        await shot(page,'narration-'+(await old.locator('header h1').textContent()));
      }
      if ((await old.locator('.dialogue-header h2').textContent()) === '백하연') {
        await expect(old.locator('.dialogue-content')).not.toContainText('신입');
        await shot(page,'briefing-'+(await old.locator('header h1').textContent()));
      }
      await old.locator('button.primary-button').click(); continue;
    }
    const next=page.locator('.server-part-two').getByRole('button',{name:/^(다음|계속하기|[4-6]개월차 시작하기|반기 결산 보기) →$/});
    if(!await next.count()) break;
    await next.click();
  }
}
async function monthOne(page:Page,selected:string) {
  await opening(page);
  await page.getByRole('button',{name:/집중 훈련 선택/}).click();
  await serverAction(page,()=>page.locator('dialog[open]').getByRole('button',{name:/^예능/}).click());
  await page.getByRole('button',{name:/합숙 규칙 선택/}).click();
  await serverAction(page,()=>page.locator('dialog[open] .month-options button').first().click());
  for(const name of [selected,'리안','도하','세인']) {
    await serverAction(page,()=>page.getByRole('button',{name:new RegExp(`^${name}`)}).click());
    await serverChat(page,'첫 합숙 대화');
    await expect(page.locator('.dialogue-header h2')).toHaveText(name);
    await expect(page.locator('.scene-resource-status')).toHaveCount(0);
  }
  await shot(page,'month-one');
  await page.getByRole('button',{name:/첫 달 계획 확인/}).click();
  await serverAction(page,()=>page.getByRole('button',{name:'첫 달 계획 확정',exact:true}).click());
  await resume(page); await expect(page.getByRole('heading',{name:'프로뮤의 첫걸음을 준비했어요.'})).toBeVisible();
  await serverAction(page,()=>page.getByRole('button',{name:/2개월차로/}).click());
}
async function monthTwo(page:Page,selected:string) {
  await opening(page);
  await expect(page.locator('.monthly-stats > div').filter({has:page.locator('dt', {hasText:'인지도'})}).locator('dd')).toHaveText('-');
  for(const name of [selected,'리안','도하','세인']) {
    await serverAction(page,()=>page.getByRole('navigation',{name:'2개월차 면담 상대'}).getByRole('button',{name:new RegExp(`^${name}`)}).click());
    await serverChat(page,'2개월차 면담');
  }
  await serverAction(page,()=>page.getByRole('button',{name:'면담 완료',exact:true}).click());
  await shot(page,'month-two-result');
  await page.getByRole('button',{name:/3개월차 안내 보기/}).click();
  await resume(page);
  await page.getByRole('button',{name:/3개월차 시작하기/}).click();
}
async function sixMonths(page:Page,selected:string,failure=false) {
  await opening(page);
  await expect(page.locator('.monthly-stats > div').filter({has:page.locator('dt', {hasText:'인지도'})}).locator('dd')).toHaveText('-');
  const stopped=await serverChat(page,'공개 질책 중단 대화','공개 질책을 중단해줘');
  expect(stopped.history.at(-1).messages.map((m:{speaker_id:string})=>m.speaker_id)).toEqual(['newcomer','yuna','secretary']);
  if (!failure) {
    await page.evaluate(({id,turnId})=>{const key=`prom-server-monthly:${id}:p2_m03_rehearsal:stop:${turnId}`;localStorage.setItem(key,'read');localStorage.setItem(key+':cursor','1');},{id:stopped.game_id,turnId:stopped.history.at(-1).id});
    await page.route(`**/api/games/${stopped.game_id}`,async route=>{
      const response=await route.fetch();const saved=await response.json();
      const turn=saved.history.find((item:{id:string})=>item.id===stopped.history.at(-1).id);
      const messages=Object.fromEntries(turn.messages.map((message:{speaker_id:string})=>[message.speaker_id,message]));
      turn.messages=['newcomer','secretary','yuna'].map(role=>messages[role]);
      await route.fulfill({response,json:saved});
    },{times:1});
    await resume(page);
  }
  await expect(page.locator('.dialogue-header h2')).toHaveText(selected);
  await page.getByRole('button',{name:'다음 →',exact:true}).click();
  await expect(page.locator('.dialogue-header h2')).toHaveText('세인');
  await page.getByRole('button',{name:'다음 →',exact:true}).click();
  await expect(page.locator('.dialogue-header h2')).toHaveText('백하연');
  await opening(page);
  await expect(page.getByRole('button',{name:'면담 완료',exact:true})).toBeDisabled();
  for(const name of [selected,'리안','도하','세인']) {
    await serverAction(page,()=>page.getByRole('navigation',{name:'3개월차 면담 상대'}).getByRole('button',{name:new RegExp(`^${name}`)}).click());
    await serverChat(page,'3개월차 면담');
  }
  await shot(page,'month-three-interviews');
  await serverAction(page,()=>page.getByRole('button',{name:'면담 완료',exact:true}).click());
  await opening(page);
  await expect(page.locator('.server-part-two')).toHaveCSS('background-image', /office\.png/);
  await page.getByRole('button',{name:failure?'기사 대응 지시':'신입에게 직접 격려',exact:false}).click();
  await serverAction(page,()=>page.locator('dialog[open]').getByRole('button',{name:'대응 확정',exact:true}).click());
  await opening(page);
  await expect(page.locator('.server-part-two')).toHaveCSS('background-image', /office\.png/);
  const discussion = await serverChat(page, '백하연과 대화', '홍보 예산 배분 확정');
  expect(discussion.event.id).toBe('p2_m05_promotion');
  expect(discussion.history.at(-1).analysis.action_id).toBe('talk');
  expect(discussion.history.at(-1).stat_delta).toEqual({});
  await expect(page.getByText('홍보 계획은 채팅에서 상의하고, 금액은 예산 배분 창에서 확정하세요.')).toBeVisible();
  await page.getByRole('button',{name:/홍보 예산 배분하기/}).click();
  const budget=page.locator('dialog[open]');
  const total=failure?10000000:40000000;
  const amount = budget.getByLabel('숏폼 예산 (원)');
  await amount.fill('');
  await expect(amount).toHaveValue('');
  await amount.pressSequentially('100000');
  await expect(amount).toHaveValue('100000');
  await amount.fill(String(failure?0:total*.5));
  await budget.getByLabel('라디오 예산 (원)').fill(String(failure?total:total*.2));
  await budget.getByLabel('팬사인회 예산 (원)').fill(String(failure?0:total*.3));
  await shot(page,'month-five-budget');
  await serverAction(page,()=>budget.getByRole('button',{name:'예산 배분 확정',exact:true}).click());
  await opening(page); await resume(page);
  await expect(page.getByRole('textbox',{name:'백하연과 대화',exact:true})).toBeVisible();
  await shot(page,'month-six');
  const result=await serverChat(page,'백하연과 대화','신입 출연시켜줘');
  expect(result.event.id).toBe('p2_complete');
  expect(result.completed_events.p2_m06_variety).toBe(failure?'failure':'success');
  await expect(page.getByRole('log')).toContainText(failure?'악플':'인지도');
  await opening(page);
  const next = await serverAction(page,()=>page.getByRole('button',{name:'7개월차로 →',exact:true}).click());
  expect(next.event.id).toBe('p2_m07');
  expect(next.game_id).toBe(result.game_id);
  await resume(page);
}
async function storyStep(page: Page, name: string | RegExp) {
  return serverAction(page, () => page.getByRole('button', {name, exact: typeof name === 'string'}).click());
}

async function storySelect(page: Page, name: string | RegExp) {
  await page.getByRole('button', {name}).click();
}

async function storyConfirm(page: Page, name: string, part4 = false) {
  await storySelect(page, name);
  return serverAction(page, () => page.locator('dialog[open]').getByRole('button',
    {name: part4 ? '결정 확정' : '확정하기', exact: true}).click());
}

async function storyRead(page: Page, last: string) {
  await storyStep(page, '다음 →');
  return storyStep(page, last);
}

async function storyInterviews(page: Page, selected: string) {
  for (const name of [selected, '리안', '도하', '세인']) {
    const target = page.getByRole('navigation', {name: '이번 달 면담 상대'}).getByRole('button', {name: new RegExp(`^${name}`)});
    if (await target.getAttribute('aria-pressed') !== 'true') await serverAction(page, () => target.click());
    await serverChat(page, '멤버 면담', '이번 활동에 대한 생각을 들려줘.');
  }
  return storyStep(page, '면담 마무리 →');
}

test('후보 완료 색상·전송 후 포커스·프로필 배치', async ({page}, info) => {
  await page.goto('/');
  await page.getByRole('button',{name:/^게임 시작/}).click();
  for (let i = 0; i < 12; i++) {
    const profiles = page.getByRole('button',{name:'데뷔조 프로필 보기',exact:true});
    if (await profiles.isVisible()) {
      await profiles.click();
      const modal = page.getByRole('dialog',{name:'기존 데뷔조 프로필',exact:true});
      await expect(modal).toBeVisible();
      if (info.project.name === 'desktop') {
        for (const viewport of [{width:1440,height:1000}, {width:1366,height:768}]) {
          await page.setViewportSize(viewport);
          for (const name of ['리안','도하','세인']) {
            await modal.locator('.profile-card').filter({hasText:name}).click();
            await expect.poll(()=>modal.evaluate(e => e.scrollHeight <= e.clientHeight + 1)).toBe(true);
          }
          await shot(page,`profiles-${viewport.width}`);
        }
        await page.setViewportSize({width:1440,height:1000});
      }
      await shot(page,'profiles-fit');
      await modal.getByRole('button',{name:'나가기',exact:true}).click();
      break;
    }
    if(await page.locator('#nickname').isVisible()) await page.locator('#nickname').fill('테스트');
    const modal=page.locator('dialog[open]');
    if(await modal.count()) await modal.getByRole('button',{name:/확인 · 안내 계속하기/}).click();
    else await page.locator('.intro-navigation .primary-button').click();
  }
  // Continue the current prologue without resetting the save.
  for (let i = 0; i < 20 && !await page.locator('.interview-hub').isVisible(); i++) {
    const modal = page.locator('dialog[open]');
    if(await modal.count()) await modal.getByRole('button',{name:/확인 · 안내 계속하기/}).click();
    else await page.locator('.intro-navigation .primary-button').click();
  }
  const card = page.locator('.profile-card').filter({hasText:'이도'});
  const before = await card.locator('.profile-number').evaluate(e=>getComputedStyle(e).backgroundColor);
  await card.click(); await page.getByRole('button',{name:/면담 시작하기/}).click();
  await serverChat(page,'면담 질문');
  const input = page.getByRole('textbox',{name:'면담 질문',exact:true});
  await expect(input).toBeFocused();
  await input.fill('앞으로 어떤 무대를 하고 싶어?');
  await serverAction(page,()=>input.press('Enter'));
  await expect(input).toBeFocused();
  await layout(page);
  if (info.project.name === 'desktop') {
    const dock = await page.locator('.interview-dock').boundingBox();
    const person = await page.locator('.dialogue-photo').evaluate(photo => {
      const pane = photo.getBoundingClientRect();
      return {right: pane.right};
    });
    const info = await page.locator('.interview-info').boundingBox();
    const portrait = await page.locator('.interview-portrait').boundingBox();
    expect(info!.x + info!.width).toBeLessThanOrEqual(portrait!.x + 1);
    expect(dock!.width).toBeGreaterThanOrEqual(340);
    expect(dock!.x).toBeGreaterThanOrEqual(person.right);
  }
  await shot(page,'wide-interview');
  await serverAction(page,()=>page.getByRole('button',{name:'면담 마무리',exact:true}).click());
  await serverAction(page,()=>page.getByRole('button',{name:/면담 상대 목록으로/}).click());
  await expect(card).toHaveClass(/interview-completed/);
  expect(await card.locator('.profile-number').evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe(before);
  await expect(card).toContainText('면담 완료');
  await shot(page,'candidate-completed');
  const brand = page.locator('.intro-topbar .intro-brand');
  await brand.hover();
  await expect(brand).toHaveCSS('text-decoration-line', 'none');
  await brand.click();
  await expect(page.getByRole('button',{name:/^게임 시작/})).toBeVisible();
});

test('안내 제목·인물 분리와 대화창 최대 폭', async ({page}, info) => {
  await prologue(page);
  await cast(page, '이도');
  await page.locator('.narration-scene').getByRole('button',{name:'다음 →',exact:true}).click();
  const scene = page.locator('.monthly-intro.is-briefing');
  await expect(scene.getByRole('heading',{name:'백하연',exact:true})).toBeVisible();
  const sizes = info.project.name === 'desktop'
    ? [{width:2880,height:1406}, {width:1920,height:1080}, {width:1366,height:768}]
    : [page.viewportSize()!];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await layout(page);
    if (info.project.name === 'desktop') {
      const heading = (await scene.locator(':scope > header').boundingBox())!;
      const person = (await scene.locator('.monthly-intro-portrait').boundingBox())!;
      expect(heading.y + heading.height).toBeLessThanOrEqual(person.y + 1);
      const stage = (await scene.boundingBox())!;
      expect(Math.abs(person.y + person.height - stage.y - stage.height)).toBeLessThanOrEqual(1);
      expect((await scene.locator('.monthly-intro-copy').boundingBox())!.width).toBeLessThanOrEqual(681);
    }
    await shot(page,`briefing-separated-${size.width}`);
  }
});

test('데모 화면 그대로 첫 화면부터 24개월 결말까지 같은 서버 저장으로 진행', async ({page}, info) => {
  const overseas = info.project.name === 'desktop';
  const selected = overseas ? '사야' : '여울';
  let creations = 0;
  const errors: string[] = [];
  page.on('request', r => { if (r.method() === 'POST' && /\/api\/games$/.test(r.url())) creations++; });
  page.on('pageerror', e => errors.push(e.message));
  await prologue(page); await cast(page, selected); await monthOne(page, selected); await monthTwo(page, selected);
  const id = await page.evaluate(() => localStorage.getItem('prom-story-game'));
  await sixMonths(page, selected);
  await expect(page.locator('.narration-scene')).toHaveCSS('background-image', /office\.png/);
  const initial = await storyStep(page, '다음 →');
  await expect(page.getByRole('log')).toContainText('대표님, 상담할 게 있어서 왔어요');
  await storyStep(page, '면담 시작 →');
  await expect(page.getByRole('combobox', {name: '대화 상대'})).toHaveCount(0);
  await expect(page.getByRole('button', {name: '면담 마무리 →'})).toBeDisabled();
  await expect(page.locator('.scene-resource-status')).toHaveCount(0);
  const interviewed = await serverChat(page, '멤버 면담', '어떤 점이 걱정돼?');
  expect(interviewed.stats).toEqual(initial.stats);
  await resume(page);
  await expect(page.getByRole('status')).toContainText('1/8회');
  await shot(page, 'month-seven-interview');
  await storyStep(page, '면담 마무리 →');
  await storyStep(page, '대응 방향 선택 →');
  await storySelect(page, /^증거 확보·법적 대응/);
  await storySelect(page, '공식 입장 발표·개인 SNS 잠시 중단');
  const result7 = await storyConfirm(page, '선택 확정 →');
  expect(result7.monthly_story.phase).toBe('result');
  expect(result7.stats.funds_won).toBe(initial.stats.funds_won - 20_000_000);

  await storyStep(page, '8개월차로 →');
  await storyStep(page, '다음 →');
  await expect(page.getByRole('heading',{name:'백하연',exact:true})).toBeVisible();
  await storyStep(page, '컨디션 관리 선택 →');
  await expect(page.getByRole('dialog',{name:'컨디션 관리',exact:true})).toBeVisible();
  await storySelect(page, /^휴가 제공/);
  await storyConfirm(page, '선택 확인 →');
  await storyStep(page, '9개월차로 →');
  for (let i = 0; i < 3; i++) await storyStep(page, '다음 →');
  await storyStep(page, '선택하기 →');
  await storySelect(page, '전원 광고로 협상');
  await storyConfirm(page, '선택 확정 →');
  await storyStep(page, '10개월차로 →');
  await storyRead(page, '면담 시작 →');
  await shot(page, 'month-ten-interviews');
  await storyInterviews(page, selected);
  await storyStep(page, '센터 선택 →');
  await storySelect(page, '리안 센터 선택');
  await storyConfirm(page, '선택 확정 →');
  await storyStep(page, '11개월차로 →');
  await storyStep(page, '다음 →');
  await storyRead(page, '수상 소감 작성 →');
  const speech = '함께한 멤버와 팬 여러분 감사합니다.';
  await page.getByRole('textbox', {name: /수상 소감을 입력/}).fill(speech);
  await resume(page);
  await expect(page.getByRole('textbox', {name: /수상 소감을 입력/})).toHaveValue(speech);
  const prepared = await storyConfirm(page, '수상 소감 확정 →');
  expect(prepared.award_speech).toBe(speech);
  const awarded = await storyStep(page, '12개월차로 →');
  expect(awarded.stats.fans - prepared.stats.fans).toBe(awarded.monthly_story.award_expected ? 50_000 : 10_000);
  await expect(page.locator('.narration-scene')).toHaveCSS('background-image', /stage\.png/);
  await resume(page);
  await storyStep(page, '다음 →');
  if (awarded.monthly_story.award_expected) {
    await expect(page.getByRole('log')).toContainText(speech);
    for (let i = 0; i < 3; i++) await storyStep(page, '다음 →');
  }
  await expect(page.locator('.part3-awards')).toHaveCSS('background-image', /office\.png/);
  await storyStep(page, '반기 결산 마치기 →');
  await expect(page.locator('.part3-awards')).toHaveCSS('background-image', /office\.png/);
  await storyStep(page, '13개월차 · Part 4 시작 →');
  await storyStep(page, '게시물 확인 →');
  await expect(page.getByAltText(`${selected} 과거 논란 게시물`)).toBeVisible();
  await storyStep(page, '백하연의 보고 듣기 →');
  await storyStep(page, '여론 보기 →');
  await expect(page.getByAltText(`${selected} 논란에 달린 댓글`)).toBeVisible();
  await storyStep(page, '신입과 면담하기 →');
  await serverChat(page, '멤버 면담');
  await storyStep(page, '면담 마무리 →');
  for (const evidence of [/^SNS 기록 확인/, /^친구 하나에게 연락/, /^학교 상담 기록 확인/]) await storyStep(page, evidence);
  await storyStep(page, '조사 마무리 · 대응 선택 →');
  await storySelect(page, /^조사 결과를 바탕으로 신입 보호/);
  await storyConfirm(page, '선택 확인 →', true);

  const choices: [number, (string | RegExp)[]][] = [
    [14, ['기부 프로젝트']], [15, [/^단체 예능 출연하기/]], [16, ['1,000석', '4만원']],
    [17, [/^겹치는 일정 거절/]], [18, [overseas ? /^제안 수락/ : /^제안 거절/]],
  ];
  for (const [month, options] of choices) {
    await storyStep(page, `${month}개월차로 →`);
    await storyRead(page, '선택하기 →');
    for (const option of options) await storySelect(page, option);
    await storyConfirm(page, '선택 확인 →', true);
  }
  await storyStep(page, '19개월차로 →');
  await storyRead(page, '멤버 면담 시작 →');
  await storyInterviews(page, selected);
  if (overseas) {
    await storySelect(page, /^훈련 실시/);
    await storySelect(page, /^현지 감성/);
  } else await storySelect(page, '몇 곳을 선택해서 간다');
  await storyConfirm(page, '선택 확인 →', true);
  await storyStep(page, '20개월차로 →');
  if (overseas) {
    await storyRead(page, '백하연과 대화하기 →');
    const label = '백하연과 루머 대응 대화';
    await serverChat(page, label, '감정적 대응은 하지 말고 공식 자료로 해명하자.');
    await serverChat(page, label, '팬을 비난하면 어떨까요?');
    const guidance = await serverChat(page, label, '멤버들과 같이 이야기하고 싶어요.');
    expect(guidance.monthly_story.guidance).toBe('calm');
    await storyStep(page, '대화 마무리 · 대응 선택 →');
    await storySelect(page, '팩트 해명');
    await storyConfirm(page, '선택 확인 →', true);
  } else {
    await storyRead(page, '선택하기 →');
    await storySelect(page, '대표곡');
    await page.getByLabel('콘서트 홍보 멘트').fill('팬은 멍청해');
    const checked = await storyStep(page, '선택 확인 →');
    expect(checked.monthly_story.promotion_warning).toBe(true);
    await expect(page.locator('dialog[open]')).toContainText('발표 전에 표현을 다시 살펴주세요');
    await storySelect(page, '다시 선택');
    await page.getByLabel('콘서트 홍보 멘트').fill('첫 단독 콘서트에서 함께 만나요!');
    await storyStep(page, '선택 확인 →');
    await serverAction(page, () => page.locator('dialog[open]').getByRole('button', {name:'결정 확정', exact:true}).click());
  }
  await storyStep(page, '21개월차로 →');
  await storyRead(page, '선택하기 →');
  await storySelect(page, /^3천 석/);
  await storyConfirm(page, '선택 확인 →', true);
  await storyStep(page, '22개월차로 →');
  const album = await storyRead(page, '선택하기 →');
  await storySelect(page, '대중 친화 콘셉트');
  await storySelect(page, '밝은 팝 타이틀');
  const funds = album.stats.funds_won;
  const portion = Math.ceil(funds * .3);
  const production = page.getByLabel('제작 (원)');
  await production.scrollIntoViewIfNeeded();
  await production.click();
  const budgetScroll = await page.evaluate(()=>window.scrollY);
  expect(budgetScroll).toBeGreaterThan(0);
  await production.fill(String(portion));
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  expect(Math.abs(await page.evaluate(()=>window.scrollY) - budgetScroll)).toBeLessThanOrEqual(2);
  await page.getByLabel('홍보 (원)').fill(String(portion));
  await page.getByLabel('예비비 (원)').fill(String(funds - 2 * portion));
  await expect(page.getByRole('status')).toContainText('남은 배분 가능 자금 0원');
  await shot(page, 'month-twenty-two-album');
  await storyConfirm(page, '선택 확인 →', true);
  await storyStep(page, '23개월차로 →');
  for (let i = 0; i < 7; i++) {
    if (i >= 3) await expect(page.locator('.dialogue-header h2')).toHaveText([selected, '리안', '도하', '세인'][i - 3]);
    await storyStep(page, '다음 →');
  }
  await storyStep(page, '24개월차로 →');
  await storyRead(page, '선택하기 →');
  await storySelect(page, '그룹 활동을 마무리하고 싶다');
  const ending = await storyConfirm(page, '선택 확인 →', true);
  expect(ending.monthly_story.phase).toBe('flash');
  await expect(page.locator('.part3-completion')).toBeVisible();
  await resume(page);
  await expect(page.locator('.part3-completion')).toBeVisible();
  const saved = await (await page.request.get(`/api/games/${id}`)).json();
  expect(saved.game_id).toBe(id);
  expect(saved.character.name).toBe(selected);
  expect(saved.monthly_story.phase).toBe('ending');
  expect(saved.monthly_story.renew).toBe(false);
  expect(saved.monthly_story.goal).toBe('national');
  expect(saved.completed_events.p2_m20).toBe('success');
  expect(await page.evaluate(id => localStorage.getItem(`prom-playthrough-v2:${id}`), id)).toBeNull();
  expect(creations).toBe(1);
  expect(new URL(page.url()).search).toBe('');
  expect(errors).toEqual([]);
  await shot(page, 'contract-complete');
});

// Explicit test samples for branches not naturally reachable with unfinished 4/5-month rules.
async function seed(page:Page, phase:'award'|'forgotten') {
  const source=createMonthlyFixture(6); source.event.id='p2_complete'; source.game_id=`e2e_${phase}`;
  const save=createPlaythrough(source);
  const p=save.part3!;
  if(phase==='award') {
    p.month=11; p.phase='decision'; p.stats.awareness=40; p.stats.fans=50000;
    save.part3=advancePart3(p,{type:'decide',speech:'이 무대는 우리 모두의 것입니다.'});
  } else {p.month=7;p.phase='result';p.results={2:'failure',3:'failure',4:'failure',5:'failure',6:'failure',7:'failure'};}
  await page.goto('/');
  await page.evaluate(save=>{localStorage.setItem('prom-story-game',save.gameId);localStorage.setItem('prom-active-save','story');localStorage.setItem(`prom-playthrough-v2:${save.gameId}`,JSON.stringify(save));},save);
  await resume(page,true);
}
test('로컬 수상 성공: 소감 원문·트로피·반기 정리 순서와 새로고침 보상 중복 방지',async({page})=>{
  await seed(page,'award'); await page.getByRole('button',{name:'12개월차로 →',exact:true}).click();
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('prom-playthrough-v2:e2e_award')!).part3.stats);
  await resume(page,true); await page.getByRole('button',{name:'다음 →',exact:true}).click();
  await expect(page.getByRole('log')).toContainText('이 무대는 우리 모두의 것입니다.');
  await page.getByRole('button',{name:'다음 →',exact:true}).click();
  await expect(page.getByRole('log')).toContainText('스페셜 무대');
  await page.getByRole('button',{name:'다음 →',exact:true}).click();
  await expect(page.getByRole('log')).toContainText('트로피를 진열장에 하나 더 추가'); await shot(page,'trophy');
  await page.getByRole('button',{name:'다음 →',exact:true}).click(); await expect(page.getByRole('log')).toContainText('지난 반기를 정리');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('prom-playthrough-v2:e2e_award')!).part3.stats)).toEqual(before);
});
test('로컬 전 사건 실패 엔딩과 이어하기',async({page})=>{
  await seed(page,'forgotten'); await page.getByRole('button',{name:'이야기 마무리 →',exact:true}).click();
  await expect(page.getByRole('heading',{name:'잊혀진 그룹',exact:true})).toBeVisible();
  await resume(page,true); await expect(page.getByRole('heading',{name:'잊혀진 그룹',exact:true})).toBeVisible(); await shot(page,'forgotten');
});

test('실제 서버 요청: 연결 끊김·새로고침·응답 유실·중복 재시도와 409 재조회',async({page})=>{
  await prologue(page);
  await page.locator('.profile-card').filter({hasText:'이도'}).click();
  await page.getByRole('button',{name:/면담 시작하기/}).click();
  await expect(page.getByRole('textbox',{name:'면담 질문',exact:true})).toBeVisible();
  const id=await page.evaluate(()=>localStorage.getItem('prom-story-game'));
  const sent:unknown[]=[];
  let fail=true,loseResponse=false;
  await page.route('**/api/games/*/turns',async route=>{
    sent.push(route.request().postDataJSON());
    if(fail) {fail=false;await route.abort('connectionfailed');return;}
    if(loseResponse) {loseResponse=false;await route.fetch();await route.abort('connectionfailed');return;}
    await route.continue();
  });
  await chat(page,'면담 질문','이 연결 오류 뒤에도 같은 질문을 이어가자.');
  await expect(page.getByRole('button',{name:'같은 요청 재시도',exact:true})).toBeVisible();
  await resume(page);
  await serverAction(page,()=>page.getByRole('button',{name:'같은 요청 재시도',exact:true}).click());
  expect(sent[0]).toEqual(sent[1]);
  const game1=await (await page.request.get(`/api/games/${id}`)).json();
  expect(game1.history.filter((t:{input:string})=>t.input==='이 연결 오류 뒤에도 같은 질문을 이어가자.')).toHaveLength(1);
  loseResponse=true;
  await chat(page,'면담 질문','응답을 잃어도 질문은 한 번만 기록해줘.');
  await expect(page.getByRole('button',{name:'같은 요청 재시도',exact:true})).toBeVisible();
  await serverAction(page,()=>page.getByRole('button',{name:'같은 요청 재시도',exact:true}).click());
  expect(sent[2]).toEqual(sent[3]);
  const game2=await (await page.request.get(`/api/games/${id}`)).json();
  expect(game2.history.filter((t:{input:string})=>t.input==='응답을 잃어도 질문은 한 번만 기록해줘.')).toHaveLength(1);
  const external=await page.request.post(`/api/games/${id}/turns`,{data:{request_id:crypto.randomUUID(),state_version:game2.version,input_type:'chat',action_id:null,text:'다른 화면의 진행'}});
  expect(external.ok()).toBe(true);
  await chat(page,'면담 질문','이전 버전에서 보낸 질문');
  await expect(page.getByRole('alert')).toContainText('최신 상태');
  await expect(page.getByRole('button',{name:'같은 요청 재시도',exact:true})).toHaveCount(0);
  expect(await page.evaluate(id=>localStorage.getItem(`prom-playthrough-v2:${id}`),id)).toBeNull();
});

test('로컬 저장 실패·재시도·다른 화면 충돌·손상된 저장을 보존',async({page})=>{
  await seed(page,'award');
  const before=await page.evaluate(()=>localStorage.getItem('prom-playthrough-v2:e2e_award'));
  await page.evaluate(()=>{
    const original=Storage.prototype.setItem;
    (window as unknown as {restoreStorage:()=>void}).restoreStorage=()=>{Storage.prototype.setItem=original;};
    Storage.prototype.setItem=function(key,value){if(key.startsWith('prom-playthrough')) throw new DOMException('quota','QuotaExceededError');original.call(this,key,value);};
  });
  await page.getByRole('button',{name:'12개월차로 →',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('반영하지 않았습니다');
  expect(await page.evaluate(()=>localStorage.getItem('prom-playthrough-v2:e2e_award'))).toEqual(before);
  await page.evaluate(()=>(window as unknown as {restoreStorage:()=>void}).restoreStorage());
  await page.getByRole('button',{name:'12개월차로 →',exact:true}).click();
  await expect(page.getByRole('log')).toContainText('수상자로');
  await page.evaluate(()=>{const key='prom-playthrough-v2:e2e_award';const s=JSON.parse(localStorage.getItem(key)!);s.revision++;localStorage.setItem(key,JSON.stringify(s));});
  await page.getByRole('button',{name:'다음 →',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('다른 화면');
  await resume(page,true);await expect(page.getByRole('log')).toContainText('수상자로');
  await page.evaluate(()=>localStorage.setItem('prom-playthrough-v2:e2e_award','{broken'));
  await resume(page,true);await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('prom-playthrough-v2:e2e_award'))).toBe('{broken');
});

test('서버 2~6개월 실패·B트랙 비용·7개월 면담 상한과 조기 엔딩',async({page})=>{
  await page.goto('/');
  let game=await (await page.request.post('/api/games',{data:{character_id:'a',scenario:'part2'}})).json();
  async function act(action_id:string) {
    const response=await page.request.post(`/api/games/${game.game_id}/turns`,{data:{request_id:crypto.randomUUID(),state_version:game.version,input_type:'action',action_id,text:''}});
    expect(response.ok(),await response.text()).toBe(true); game=(await response.json()).game;
  }
  for(const action of ['finish_interview','finish_interview','finish_interview','select_a','skip_training']) await act(action);
  for(const member of game.center_interviews.members) {
    const room=await page.request.post(`/api/games/${game.game_id}/turns`,{data:{request_id:crypto.randomUUID(),state_version:game.version,input_type:'conversation',conversation_mode:'private',target_character_id:member.character_id}});
    expect(room.ok()).toBe(true);game=(await room.json()).game;
    const reply=await page.request.post(`/api/games/${game.game_id}/turns`,{data:{request_id:crypto.randomUUID(),state_version:game.version,input_type:'chat',text:'포지션에 대한 생각을 들려줘'}});
    expect(reply.ok()).toBe(true);game=(await reply.json()).game;
  }
  await act('finish_center_interviews');
  await page.evaluate(id=>{localStorage.setItem('prom-story-game',id);localStorage.setItem('prom-active-save','story');},game.game_id);
  await resume(page);
  await page.getByRole('button',{name:/3개월차 안내 보기/}).click();
  await page.getByRole('button',{name:/3개월차 시작하기/}).click();
  await sixMonths(page, '이도', true);
  await storyRead(page, '면담 시작 →');
  for (let i = 0; i < 8; i++) await serverChat(page, '멤버 면담', `이야기를 들어줄게 ${i}`);
  await expect(page.getByRole('textbox', {name: '멤버 면담', exact: true})).toBeDisabled();
  await storyStep(page, '면담 마무리 →');
  await storyStep(page, '대응 방향 선택 →');
  await storySelect(page, /^법적 대응 없이 경과 관찰/);
  await storySelect(page, '개인 SNS 활동 유지');
  const stored = await storyConfirm(page, '선택 확정 →');
  for (const event of ['p2_m02_center', 'p2_m03_rehearsal', 'p2_m04_showcase', 'p2_m05_promotion', 'p2_m06_variety', 'p2_m07']) {
    expect(stored.completed_events[event]).toBe('failure');
  }
  const ended = await storyStep(page, '이야기 마무리 →');
  expect(ended.event.id).toBe('p2_m07');
  expect(ended.monthly_story.ending).toBe('forgotten');
  expect(ended.history.filter(turn => turn.event_id === 'p2_m07' && turn.input_type === 'chat')).toHaveLength(8);
});
