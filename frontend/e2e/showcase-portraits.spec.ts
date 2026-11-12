import {test,expect} from '@playwright/test';

// Use real API transitions and the normal App entry, with an isolated owner cookie.
for (const [slot,id,folder,name] of [['a','hyerin','ido','이도'],['b','seoyeon','yeoul','여울'],['c','jiwoo','saya','사야']]) {
 test(`${name} 쇼케이스 사진은 실제 저장·복원과 PC 가로 배치를 유지한다`,async({page,context},info)=>{
  async function post(path:string,data:unknown){const r=await context.request.post('/api'+path,{data});expect(r.ok(),await r.text()).toBe(true);return r.json();}
  let game=await post('/games',{character_id:'a',scenario:'part2'});
  async function send(action_id:string|null,extra:Record<string,unknown>={}){game=(await post('/games/'+game.game_id+'/turns',{request_id:crypto.randomUUID(),state_version:game.version,input_type:action_id?'action':'chat',action_id,text:'',...extra})).game;}
  for(let i=0;i<3;i++)await send('finish_interview');
  await send('select_'+slot);await send('train_variety');await send('rule_meeting');
  async function interview(target:string,text:string){await send(null,{input_type:'conversation',conversation_mode:'private',target_character_id:target});await send(null,{text});}
  for(const member of [id,'dahyun','haram','yuna'])await interview(member,'함께 준비하자. 필요한 도움을 이야기해줘.');
  await send(null,{input_type:'conversation',conversation_mode:'public'});
  await send('confirm_month_plan',{stop_after_month_one:true});await send('start_month_two');
  for(const member of game.center_interviews.members)await interview(member.character_id,'포지션에 대한 생각을 들려줘');
  await send('finish_center_interviews');await send('stop_reprimand');
  for(const member of game.center_interviews.members)await interview(member.character_id,'함께 준비하자. 방금 어떤 마음이었어?');
  await send('mediate_rehearsal');expect(game.event.id).toBe('p2_m04_showcase');
  await page.goto('/');
  await page.evaluate(({game})=>{
   localStorage.setItem('prom-story-game',game.game_id);localStorage.setItem('prom-active-save','story');
   const opening=game.event_openings.find((o:{event_id:string})=>o.event_id===game.event.id);
   if(opening.after_turn_id)localStorage.setItem(`prom-server-monthly:${game.game_id}:${game.event.id}:result:${opening.after_turn_id}`,'read');
  },{game});
  await page.reload();await page.getByRole('button',{name:'이야기 이어하기',exact:true}).click();
  await page.locator('.server-part-two .monthly-buttons .primary-button').click();
  const img=page.locator('.interview-portrait img');
  await expect(img).toHaveAttribute('src',`/images/characters/${folder}/stage-surprised.webp`);
  await img.evaluate(i=>(i as HTMLImageElement).decode());
  const sizes=info.project.name==='desktop'?[{width:1440,height:1000},{width:1366,height:768}]:[{width:390,height:844}];
  for(const size of sizes){
   await page.setViewportSize(size);
   const stage=page.locator('.server-part-two');
   if(size.width>1000){
    await expect(stage).not.toHaveClass(/portrait-stacked/);
    await expect.poll(()=>stage.evaluate(s=>{const p=s.querySelector('.interview-portrait')!.getBoundingClientRect();const d=s.querySelector('.interview-dock')!.getBoundingClientRect();return d.left>=p.right-1;})).toBe(true);
   }
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   await expect(stage).toHaveCSS('background-image',/stage\.webp/);
   await page.screenshot({path:info.outputPath(`showcase-${folder}-${size.width}.png`),fullPage:true});
  }
  await page.reload();await page.getByRole('button',{name:'이야기 이어하기',exact:true}).click();
  await expect(img).toHaveAttribute('src',`/images/characters/${folder}/stage-surprised.webp`);
 });
}
