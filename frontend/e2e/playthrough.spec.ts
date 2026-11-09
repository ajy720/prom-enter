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
  for(let i=0;i<2;i++) {
    const intro=page.locator('.monthly-intro'); if(!await intro.isVisible()) break;
    await intro.getByRole('button',{name:/다음|이야기 시작하기/}).click();
  }
}
async function monthOne(page:Page) {
  await opening(page);
  await page.getByRole('button',{name:/집중 훈련 선택/}).click();
  await serverAction(page,()=>page.locator('dialog[open]').getByRole('button',{name:/^예능/}).click());
  await page.getByRole('button',{name:/합숙 규칙 선택/}).click();
  await serverAction(page,()=>page.locator('dialog[open] .month-options button').first().click());
  for(const name of ['리안','도하','세인']) {
    await serverAction(page,()=>page.getByRole('button',{name:new RegExp(`^${name}`)}).click());
    for(let i=0;i<3;i++) await serverChat(page,'첫 합숙 대화');
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
    await serverAction(page,()=>page.getByRole('navigation',{name:'포지션 면담 상대'}).getByRole('button',{name:new RegExp(`^${name}`)}).click());
    await serverChat(page,'포지션 면담');
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
  for(const m of [3,4,5,6]) {
    await localIntro(page);
    if(m===3) await chat(page,'공개 질책 중단 대화','공개 질책은 멈추고 각자의 이야기를 듣자.');
    if(m===3 || m===6) for(const name of [selected,'리안','도하','세인']) {
      await page.getByRole('navigation',{name:'이번 달 면담 상대'}).getByRole('button',{name:new RegExp(`^${name}`)}).click();
      await chat(page,'이번 달 면담 대화');
    }
    else {
      await chat(page,'백하연과 해결 방안 대화');
      await page.getByRole('button',{name:m===4?'백하연의 수습 제안 보기 →':`${failure?'B':'A'}트랙 홍보 과제 작성 →`,exact:true}).click();
      if(m===4) await page.locator('dialog[open] .month-options button').first().click();
      if(m===5 && failure) await page.locator('dialog[open] textarea').fill('자체 숏폼과 팬 소통을 진행한다.');
      await page.locator('dialog[open]').getByRole('button',{name:'백하연과 대화로 돌아가기',exact:true}).click();
    }
    if(m===5 && failure) {
      await page.getByRole('button',{name:'B트랙 홍보 과제 작성 →',exact:true}).click();
      await page.locator('dialog[open]').getByRole('button',{name:'신입 격려 면담 진행',exact:true}).click();
      await chat(page,'이번 달 면담 대화');
      await page.getByRole('button',{name:/격려 면담 마무리·백하연에게 돌아가기/}).click();
    }
    if(m===6) await shot(page,'month-six');
    await page.getByRole('button',{name:m===6?'신입 예능 출연 결정 →':m===3?'이번 달 면담·과제 마무리 →':'이번 달 해결 방안 확정 →',exact:true}).click();
    await page.locator('dialog[open]').getByRole('button',{name:'확정하기',exact:true}).click();
    await page.getByRole('button',{name:m===6?'여섯 달 결산 보기 →':`${m+1}개월차로 →`,exact:true}).click();
    if(m===4) await resume(page);
  }
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

test('첫 화면→실제 서버 면담·선발·1~2개월→로컬 3~12개월, 같은 ID·URL로 완료', async ({page},info) => {
  const selected=info.project.name==='mobile'?'여울':'사야';
  let creations=0; const errors:string[]=[];
  page.on('request',r=>{if(r.method()==='POST' && /\/api\/games$/.test(r.url())) creations++;});
  page.on('pageerror',e=>errors.push(e.message));
  expect((await (await page.request.get('/api/health')).json()).provider).toBe('demo');
  await prologue(page); await cast(page,selected); await monthOne(page); await monthTwo(page,selected);
  const id=await page.evaluate(()=>localStorage.getItem('prom-story-game'));
  await sixMonths(page,selected); await partThree(page,selected);
  expect(creations).toBe(1); expect(new URL(page.url()).search).toBe(''); expect(errors).toEqual([]);
  const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem(`prom-playthrough-v1:${id}`)!),id);
  expect(saved.gameId).toBe(id); expect(saved.six.game.game_id).toBe(id); expect(saved.part3.sourceId).toBe(id);
  expect(saved.part3.newcomer.name).toBe(selected); expect(saved.six.game.character.name).toBe(selected);
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
  await page.evaluate(save=>{localStorage.setItem('prom-story-game',save.gameId);localStorage.setItem('prom-active-save','story');localStorage.setItem(`prom-playthrough-v1:${save.gameId}`,JSON.stringify(save));},save);
  await page.reload(); await page.getByRole('button',{name:'이야기 이어하기',exact:true}).click();
}
test('로컬 수상 성공: 소감 원문·트로피·반기 정리 순서와 새로고침 보상 중복 방지',async({page})=>{
  await seed(page,'award'); await page.getByRole('button',{name:'12개월차로 →',exact:true}).click();
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('prom-playthrough-v1:e2e_award')!).part3.stats);
  await resume(page); await page.getByRole('button',{name:'다음 →',exact:true}).click();
  await expect(page.getByRole('log')).toContainText('이 무대는 우리 모두의 것입니다.');
  await page.getByRole('button',{name:'다음 →',exact:true}).click();
  await expect(page.getByRole('log')).toContainText('스페셜 무대');
  await page.getByRole('button',{name:'다음 →',exact:true}).click();
  await expect(page.getByRole('log')).toContainText('트로피를 진열장에 하나 더 추가'); await shot(page,'trophy');
  await page.getByRole('button',{name:'다음 →',exact:true}).click(); await expect(page.getByRole('log')).toContainText('지난 반기를 정리');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('prom-playthrough-v1:e2e_award')!).part3.stats)).toEqual(before);
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
  expect(await page.evaluate(id=>localStorage.getItem(`prom-playthrough-v1:${id}`),id)).toBeNull();
});

test('로컬 저장 실패·재시도·다른 화면 충돌·손상된 저장을 보존',async({page})=>{
  await seed(page,'award');
  const before=await page.evaluate(()=>localStorage.getItem('prom-playthrough-v1:e2e_award'));
  await page.evaluate(()=>{
    const original=Storage.prototype.setItem;
    (window as unknown as {restoreStorage:()=>void}).restoreStorage=()=>{Storage.prototype.setItem=original;};
    Storage.prototype.setItem=function(key,value){if(key.startsWith('prom-playthrough')) throw new DOMException('quota','QuotaExceededError');original.call(this,key,value);};
  });
  await page.getByRole('button',{name:'12개월차로 →',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('반영하지 않았습니다');
  expect(await page.evaluate(()=>localStorage.getItem('prom-playthrough-v1:e2e_award'))).toEqual(before);
  await page.evaluate(()=>(window as unknown as {restoreStorage:()=>void}).restoreStorage());
  await page.getByRole('button',{name:'12개월차로 →',exact:true}).click();
  await expect(page.getByRole('log')).toContainText('수상자로');
  await page.evaluate(()=>{const key='prom-playthrough-v1:e2e_award';const s=JSON.parse(localStorage.getItem(key)!);s.revision++;localStorage.setItem(key,JSON.stringify(s));});
  await page.getByRole('button',{name:'다음 →',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('다른 화면');
  await resume(page);await expect(page.getByRole('log')).toContainText('수상자로');
  await page.evaluate(()=>localStorage.setItem('prom-playthrough-v1:e2e_award','{broken'));
  await resume(page);await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('prom-playthrough-v1:e2e_award'))).toBe('{broken');
});

test('로컬 3~6개월 실패·5개월 B트랙 격려·7개월 면담 8회 상한과 실패 엔딩',async({page})=>{
  const source=createMonthlyFixture(3);source.game_id='e2e_six_failure';source.event.id='p2_m03_rehearsal';
  source.stats.teamwork=5;source.stats.fatigue=95;source.completed_events.p2_m02_center='failure';
  const save=createPlaythrough(source);save.six!.tone='pressure';save.six!.previewOutcome='failure';
  await page.goto('/');
  await page.evaluate(save=>{localStorage.setItem('prom-story-game',save.gameId);localStorage.setItem('prom-active-save','story');localStorage.setItem(`prom-playthrough-v1:${save.gameId}`,JSON.stringify(save));},save);
  await resume(page); await sixMonths(page,'이도',true);await localIntro(page);
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
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('prom-playthrough-v1:e2e_six_failure')!));
  expect(stored.six.results).toEqual({3:'failure',4:'failure',5:'failure',6:'failure'});
  expect(stored.six.encouragement).toBe('none');expect(stored.part3.chats).toHaveLength(8);
});
