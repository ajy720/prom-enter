import { test, expect, type Page } from '@playwright/test';
import { createPlaythrough } from '../src/playthroughState';
import { advancePart3 } from '../src/part3State';
import { createMonthlyFixture } from '../src/monthlyFixture';

async function layout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
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
async function resume(page:Page) { await page.reload(); await page.getByRole('button',{name:'이야기 이어하기',exact:true}).click(); }
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
  await page.getByRole('button',{name:/목표 확인 · 첫 합숙 시작/}).click();
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
async function localIntro(page:Page) {
  for(let i=0;i<8;i++) {
    const next=page.getByRole('button',{name:/^(다음 대화|질책 중단하기|백하연과 대화하기|멤버 면담 시작|다음 →|면담 시작 →|선택하기 →|수상 소감 작성 →)/});
    if(!await next.count()) break;
    await next.click();
  }
}
async function sixMonths(page:Page,selected:string,failure=false) {
  await opening(page);
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
  await page.getByRole('button',{name:/홍보 예산 배분하기/}).click();
  const budget=page.locator('dialog[open]');
  const total=failure?10000000:40000000;
  await budget.getByLabel('숏폼 예산 (원)').fill(String(failure?0:total*.5));
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
  await page.getByRole('button',{name:'7개월차로 →',exact:true}).click();
  await resume(page);
}
async function partThree(page:Page,selected:string) {
  await localIntro(page);
  await chat(page,'멤버 면담');
  await page.getByRole('button',{name:/면담 마무리 →/}).click();
  await page.getByRole('button',{name:/대응 방향 선택/}).click();
  await page.getByRole('button',{name:/증거 확보·법적 대응/}).click();
  await page.getByRole('button',{name:/^공식 입장 발표·개인 SNS 잠시 중단/}).click();
  await resume(page);
  await expect(page.getByRole('button',{name:/^공식 입장 발표·개인 SNS 잠시 중단/})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'선택 확정 →',exact:true}).click();
  await page.locator('dialog[open]').getByRole('button',{name:'확정하기',exact:true}).click();
  await page.getByRole('button',{name:'8개월차로 →',exact:true}).click();
  await localIntro(page);
  await page.getByRole('button',{name:'컨디션 관리 선택 →',exact:true}).click();
  await page.locator('dialog[open]').getByRole('button',{name:/휴가 제공/}).click();
  await page.locator('dialog[open]').getByRole('button',{name:'선택 확인 →',exact:true}).click();
  await page.locator('dialog[open]').getByRole('button',{name:'확정하기',exact:true}).click();
  await page.getByRole('button',{name:'9개월차로 →',exact:true}).click();
  await localIntro(page);
  await page.getByRole('button',{name:/^전원 광고로 협상/}).click();
  await page.getByRole('button',{name:'선택 확정 →',exact:true}).click();
  await page.locator('dialog[open]').getByRole('button',{name:'확정하기',exact:true}).click();
  await page.getByRole('button',{name:'10개월차로 →',exact:true}).click();
  await expect(page.getByRole('log')).toContainText('광고의 효과');
  await localIntro(page);
  for(const name of [selected,'리안','도하','세인']) {
    await page.getByRole('navigation',{name:'이번 달 면담 상대'}).getByRole('button',{name:new RegExp(`^${name}`)}).click();
    await chat(page,'멤버 면담');
  }
  await shot(page,'month-ten-interviews');
  await page.getByRole('button',{name:'면담 마무리 →',exact:true}).click();
  await page.getByRole('button',{name:'센터 선택 →',exact:true}).click();
  await page.getByRole('button',{name:/^리안 센터 선택/}).click();
  await page.getByRole('button',{name:'선택 확정 →',exact:true}).click();
  await page.locator('dialog[open]').getByRole('button',{name:'확정하기',exact:true}).click();
  await page.getByRole('button',{name:'11개월차로 →',exact:true}).click();
  await localIntro(page);
  await page.getByRole('textbox',{name:/수상 소감을 입력해주세요/}).fill('함께한 멤버와 팬 여러분 감사합니다.');
  await resume(page);
  await expect(page.getByRole('textbox',{name:/수상 소감을 입력해주세요/})).toHaveValue('함께한 멤버와 팬 여러분 감사합니다.');
  await page.getByRole('button',{name:'수상 소감 확정 →',exact:true}).click();
  await page.locator('dialog[open]').getByRole('button',{name:'확정하기',exact:true}).click();
  await page.getByRole('button',{name:'12개월차로 →',exact:true}).click();
  await shot(page,'month-twelve');
  for(let i=0;i<6;i++) {
    if(await page.getByRole('heading',{name:'우리의 첫해를 마치며',exact:true}).isVisible()) break;
    await page.getByRole('button',{name:/^(다음 →|반기 결산 마치기 →)/}).click();
  }
  await expect(page.getByRole('heading',{name:'우리의 첫해를 마치며',exact:true})).toBeVisible();
  await resume(page);
  await expect(page.getByRole('heading',{name:'우리의 첫해를 마치며',exact:true})).toBeVisible();
}

test('첫 화면→실제 서버 면담·선발·1~6개월→로컬 7~12개월, 같은 ID·URL로 완료', async ({page},info) => {
  const selected=info.project.name==='mobile'?'여울':'사야';
  let creations=0; const errors:string[]=[];
  page.on('request',r=>{if(r.method()==='POST' && /\/api\/games$/.test(r.url())) creations++;});
  page.on('pageerror',e=>errors.push(e.message));
  expect((await (await page.request.get('/api/health')).json()).provider).toBe('demo');
  await prologue(page); await cast(page,selected); await monthOne(page,selected); await monthTwo(page,selected);
  const id=await page.evaluate(()=>localStorage.getItem('prom-story-game'));
  await sixMonths(page,selected); await partThree(page,selected);
  expect(creations).toBe(1); expect(new URL(page.url()).search).toBe(''); expect(errors).toEqual([]);
  const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem(`prom-playthrough-v2:${id}`)!),id);
  expect(saved.gameId).toBe(id); expect(saved.six).toBeNull(); expect(saved.source.game_id).toBe(id); expect(saved.part3.sourceId).toBe(id);
  expect(saved.part3.newcomer.name).toBe(selected); expect(saved.source.character.name).toBe(selected);
  expect(saved.part3.month).toBe(12); expect(saved.part3.phase).toBe('complete');
  await shot(page,'part3-complete');
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
  await page.reload(); await page.getByRole('button',{name:'이야기 이어하기',exact:true}).click();
}
test('로컬 수상 성공: 소감 원문·트로피·반기 정리 순서와 새로고침 보상 중복 방지',async({page})=>{
  await seed(page,'award'); await page.getByRole('button',{name:'12개월차로 →',exact:true}).click();
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('prom-playthrough-v2:e2e_award')!).part3.stats);
  await resume(page); await page.getByRole('button',{name:'다음 →',exact:true}).click();
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
  await resume(page); await expect(page.getByRole('heading',{name:'잊혀진 그룹',exact:true})).toBeVisible(); await shot(page,'forgotten');
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
  await resume(page);await expect(page.getByRole('log')).toContainText('수상자로');
  await page.evaluate(()=>localStorage.setItem('prom-playthrough-v2:e2e_award','{broken'));
  await resume(page);await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('prom-playthrough-v2:e2e_award'))).toBe('{broken');
});

test('서버 2~6개월 실패·B트랙 비용·7개월 면담 상한과 실패 엔딩',async({page})=>{
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
  await sixMonths(page,'이도',true);await localIntro(page);
  await expect(page.getByRole('button',{name:'면담 마무리 →',exact:true})).toBeDisabled();
  for(let i=0;i<8;i++) await chat(page,'멤버 면담',`이야기를 들어줄게 ${i}`);
  await expect(page.getByRole('textbox',{name:'멤버 면담',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'면담 마무리 →',exact:true}).click();
  await page.getByRole('button',{name:/대응 방향 선택/}).click();
  await page.getByRole('button',{name:/^법적 대응 없이 경과 관찰/}).click();
  await page.getByRole('button',{name:/^개인 SNS 활동 유지/}).click();
  await page.getByRole('button',{name:'선택 확정 →',exact:true}).click();
  await page.locator('dialog[open]').getByRole('button',{name:'확정하기',exact:true}).click();
  await page.getByRole('button',{name:'이야기 마무리 →',exact:true}).click();
  await expect(page.getByRole('heading',{name:'잊혀진 그룹',exact:true})).toBeVisible();
  const stored=await page.evaluate(()=>{const id=localStorage.getItem('prom-story-game');return JSON.parse(localStorage.getItem(`prom-playthrough-v2:${id}`)!);});
  for(const month of [2,3,4,5,6]) expect(stored.source.completed_events[`p2_m0${month}_${({2:'center',3:'rehearsal',4:'showcase',5:'promotion',6:'variety'} as Record<number,string>)[month]}`]).toBe('failure');
  expect(stored.six).toBeNull();expect(stored.part3.chats).toHaveLength(8);
});
