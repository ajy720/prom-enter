import { test, expect, type Page } from '@playwright/test';
import { createPart4, part4StorageKey, type Part4Save } from '../src/part4State';

async function seed(page:Page,patch:Partial<Part4Save>={}) {
  const s={...createPart4(),...patch,sourceId:'e2e-part4'};
  await page.addInitScript(({key,save})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(save));},{key:part4StorageKey(s.sourceId),save:s});
  await page.goto('/?part4Demo=1&game=e2e-part4');
}
async function state(page:Page):Promise<Part4Save> {return page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),part4StorageKey('e2e-part4'));}
async function chat(page:Page,text:string) {await page.locator('#part4-chat').fill(text);await page.getByRole('button',{name:/전송$/}).click();}
async function read(page:Page) {
  for(let i=0;i<12;i++) {
    const s=await state(page);
    if(s.phase!=='intro')break;
    if(s.month===23&&s.cursor===0)await expect(page.locator('.narration-scene')).toHaveCSS('background-image',/stage\.png/);
    if(s.month===23&&s.cursor===3)await expect(page.locator('.dialogue-header h2')).toHaveText(s.newcomer.name);
    await page.locator('.part-four .primary-button').filter({hasText:/^(다음|멤버 면담 시작|백하연과 대화하기|선택하기|24개월차로)/}).click();
  }
}
async function select(page:Page,name:string) {await page.getByRole('button',{name}).click();}
async function confirm(page:Page) {await page.getByRole('button',{name:'선택 확인 →',exact:true}).click();await page.getByRole('dialog',{name:'이번 달 결정 확인'}).getByRole('button',{name:'결정 확정',exact:true}).click();}
async function nextMonth(page:Page) {await page.locator('.narration-scene > .monthly-intro-copy > .primary-button').click();await read(page);}
async function interviews(page:Page) {
  const s=await state(page);
  for(const member of [s.newcomer,{id:'dahyun',name:'리안'},{id:'haram',name:'도하'},{id:'yuna',name:'세인'}]) {
    await page.getByRole('navigation',{name:'이번 달 면담 상대'}).getByRole('button',{name:new RegExp(`^${member.name}`)}).click();
    await chat(page,'이번 활동에 대한 생각을 들려줘.');
  }
  await page.getByRole('button',{name:'면담 마무리 →',exact:true}).click();
}
async function checkLayout(page:Page) {
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  if((page.viewportSize()?.width??0)>1000&&await page.locator('.interview-portrait').count())expect((await page.locator('.interview-portrait').boundingBox())!.y).toBeLessThan(page.viewportSize()!.height/2);
  for(const img of await page.locator('.part-four img').all())await expect(img).toHaveJSProperty('naturalWidth',await img.evaluate(el=>(el as HTMLImageElement).naturalWidth).then(n=>{expect(n).toBeGreaterThan(0);return n;}));
}
for(const route of ['domestic','overseas'] as const)test(`Part 4 ${route} 13→24개월 전체 선택·복원·결말`,async({page},info)=>{
  await seed(page);await page.getByRole('radio',{name:/국민 그룹/}).check();await page.getByRole('button',{name:'목표 확정 · 13개월차 시작 →'}).click();
  await page.getByRole('button',{name:'게시물 확인 →'}).click();await expect(page.getByAltText('이도 과거 논란 게시물')).toHaveAttribute('src','/images/characters/ido/past-rumor.png');
  await page.getByRole('button',{name:'백하연의 보고 듣기 →'}).click();await page.getByRole('button',{name:'여론 보기 →'}).click();await expect(page.getByAltText('이도 논란에 달린 댓글')).toBeVisible();await page.getByRole('button',{name:'신입과 면담하기 →'}).click();
  await expect(page.locator('.scene-resource-status')).toHaveCount(0);await expect(page.getByRole('button',{name:'면담 마무리 →'})).toBeDisabled();
  await chat(page,'확인할 수 있는 기록이 남아 있을까?');await checkLayout(page);await page.screenshot({path:info.outputPath('13-interview.png'),fullPage:true});
  await page.reload();await expect(page.getByRole('status')).toContainText('1/8회');await page.getByRole('button',{name:'면담 마무리 →'}).click();
  for(const name of ['SNS 기록 확인','친구 하나에게 연락','학교 상담 기록 확인'])await select(page,name);
  await page.getByRole('button',{name:'조사 마무리 · 대응 선택 →'}).click();await page.getByRole('button',{name:/^조사 결과를 바탕으로 신입 보호/}).click();await confirm(page);
  await nextMonth(page);await select(page,'기부 프로젝트');await confirm(page);
  await nextMonth(page);await page.getByRole('button',{name:/^단체 예능 출연하기/}).click();await confirm(page);
  await nextMonth(page);await select(page,'15,000석');await select(page,'10만원');await confirm(page);
  await nextMonth(page);await page.getByRole('button',{name:/^겹치는 일정 거절/}).click();await confirm(page);
  await nextMonth(page);await page.getByRole('button',{name:route==='domestic'?/^제안 거절/:/^제안 수락/}).click();await confirm(page);
  await nextMonth(page);await interviews(page);
  if(route==='domestic')await select(page,'몇 곳을 선택해서 간다');
  else {await page.getByRole('button',{name:/^훈련 실시/}).click();await page.getByRole('button',{name:/^현지 감성/}).click();}
  await confirm(page);await nextMonth(page);
  if(route==='domestic') {await select(page,'대표곡');await page.getByLabel('콘서트 홍보 멘트').fill('우리의 첫 단독 콘서트에서 함께 만나요!');}
  else {await expect(page.getByRole('button',{name:'대화 마무리 · 대응 선택 →'})).toBeDisabled();for(let i=0;i<3;i++)await chat(page,'감정적 대응은 하지 말고 공식 자료로 해명하자.');await page.getByRole('button',{name:'대화 마무리 · 대응 선택 →'}).click();await select(page,'팩트 해명');}
  await confirm(page);await nextMonth(page);await page.getByRole('button',{name:/^1만 석/}).click();await confirm(page);
  await nextMonth(page);await select(page,'대중 친화 콘셉트');await select(page,'밝은 팝 타이틀');const funds=(await state(page)).stats.funds_won;
  await expect(page.getByRole('status')).toContainText(`남은 배분 가능 자금 ${funds.toLocaleString()}원`);await page.getByLabel('제작 (원)').fill(String(funds*0.3));await expect(page.getByRole('status')).toContainText(`남은 배분 가능 자금 ${(funds*0.7).toLocaleString()}원`);await page.getByLabel('홍보 (원)').fill(String(funds*0.3));await page.getByLabel('예비비 (원)').fill(String(funds*0.4));await expect(page.getByRole('status')).toContainText('남은 배분 가능 자금 0원');await checkLayout(page);await page.screenshot({path:info.outputPath('22-album.png'),fullPage:true});
  await confirm(page);expect((await state(page)).results[22]).toBe('success');await nextMonth(page);await select(page,'그룹 활동을 마무리하고 싶다');await confirm(page);
  await expect(page.getByRole('region',{name:'결말로 전환 중'})).toBeVisible();await expect(page.getByRole('heading',{name:'해피엔딩 · 계속되는 우리의 무대'})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'해피엔딩 · 계속되는 우리의 무대'})).toBeVisible();await checkLayout(page);await page.screenshot({path:info.outputPath('24-ending.png'),fullPage:true});
  const end=await state(page);expect(end.stats.funds_won).toBeGreaterThan(2e9);expect(end.renew).toBe(false);
});
test('13개월 단서 없이 결정하면 14개월 대신 탈퇴 엔딩',async({page})=>{
  const s=createPart4(undefined,'national');await seed(page,{...s,phase:'decision'});await page.getByRole('button',{name:/^조사 결과를 바탕으로 신입 보호/}).click();await confirm(page);await page.getByRole('button',{name:'탈퇴 이후의 이야기 →'}).click();await expect(page.getByRole('heading',{name:'끝내 지키지 못한 자리'})).toBeVisible();expect((await state(page)).month).toBe(13);
});
for(const [id,name,folder] of [['seoyeon','여울','yeoul'],['jiwoo','사야','saya']])test(`${name} 글·댓글 사진과 면담 화자 연결`,async({page})=>{
  await seed(page,{...createPart4(undefined,'national'),newcomer:{id,name},target:id,phase:'post'});await expect(page.getByAltText(`${name} 과거 논란 게시물`)).toHaveAttribute('src',`/images/characters/${folder}/past-rumor.png`);await page.getByRole('button',{name:'백하연의 보고 듣기 →'}).click();await page.getByRole('button',{name:'여론 보기 →'}).click();await expect(page.getByAltText(`${name} 논란에 달린 댓글`)).toHaveAttribute('src',`/images/characters/${folder}/rumor-comments.png`);await page.getByRole('button',{name:'신입과 면담하기 →'}).click();await expect(page.locator('.dialogue-header h2')).toHaveText(name);
});
test('저장 실패·다른 화면 충돌·손상 저장에서 진행과 원본 보존',async({page})=>{
  await seed(page,{...createPart4(undefined,'national'),phase:'interviews'});await page.locator('#part4-chat').fill('저장 오류 후에도 남아야 하는 입력');
  await page.evaluate(key=>{const old=Storage.prototype.setItem;Object.assign(window,{restorePart4Storage:()=>{Storage.prototype.setItem=old;}});Storage.prototype.setItem=function(k,v){if(k===key)throw new Error('저장 테스트 오류');return old.call(this,k,v);};},part4StorageKey('e2e-part4'));
  await page.getByRole('button',{name:/전송$/}).click();await expect(page.getByRole('alert')).toContainText('저장 테스트 오류');expect((await state(page)).chats).toHaveLength(0);await expect(page.locator('#part4-chat')).toHaveValue('저장 오류 후에도 남아야 하는 입력');
  await page.evaluate(()=>{(window as unknown as {restorePart4Storage:()=>void}).restorePart4Storage();});await page.getByRole('button',{name:/전송$/}).click();expect((await state(page)).chats).toHaveLength(1);
  await page.locator('#part4-chat').fill('예전 화면 입력');await page.evaluate(key=>{const s=JSON.parse(localStorage.getItem(key)!);s.revision++;s.draft.text='다른 화면의 최신 초안';localStorage.setItem(key,JSON.stringify(s));},part4StorageKey('e2e-part4'));
  await page.getByRole('button',{name:/전송$/}).click();await expect(page.getByRole('alert')).toContainText('다른 화면');expect((await state(page)).chats).toHaveLength(1);await page.reload();await expect(page.locator('#part4-chat')).toHaveValue('다른 화면의 최신 초안');
  await page.evaluate(key=>localStorage.setItem(key,'{"broken":true}'),part4StorageKey('e2e-part4'));await page.reload();await expect(page.getByRole('alert')).toContainText('저장');expect(await page.evaluate(key=>localStorage.getItem(key),part4StorageKey('e2e-part4'))).toBe('{"broken":true}');
});
test('해외 20개월 7회 제한과 모호한 지침 확인 후 감정적 대응 실패',async({page})=>{
  await seed(page,{...createPart4(undefined,'national'),month:20,route:'overseas',phase:'interviews',target:'baek_hayeon'});
  for(let i=0;i<7;i++)await chat(page,'지금 어떤 상황인가요?');await expect(page.locator('#part4-chat')).toBeDisabled();await page.getByRole('button',{name:'대화 마무리 · 대응 선택 →'}).click();await select(page,'법적 대응');await expect(page.getByRole('button',{name:'선택 확인 →'})).toBeDisabled();await select(page,'감정적인 맞대응을 실행');await confirm(page);expect((await state(page)).results[20]).toBe('failure');
});
for(const ending of ['ordinary','forgotten'] as const)test(`${ending} 재계약 의향에도 다른 후일담으로 마무리`,async({page})=>{
  const s=createPart4(undefined,'national');await seed(page,{...s,month:24,route:'domestic',phase:'decision',stats:ending==='ordinary'?{...s.stats,funds_won:1800000000}:{...s.stats,funds_won:300000000,teamwork:30,awareness:20,fans:30000}});await select(page,'재계약하고 활동을 이어가고 싶다');await confirm(page);await expect(page.getByRole('heading',{name:ending==='ordinary'?'평범한 엔딩 · 각자의 다음 장':'잊혀진 그룹 엔딩 · 조용히 남은 이름'})).toBeVisible();expect((await state(page)).ending).toBe(ending);
});
