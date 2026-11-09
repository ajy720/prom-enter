import test from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from '../src/api.ts';

test('면담 API 연결 실패는 명확한 오류이며 성공 응답으로 대체하지 않는다',async t=>{
  t.mock.method(globalThis,'fetch',async()=>{throw new TypeError('Failed to fetch');});
  await assert.rejects(api('/games',{scenario:'part2',character_id:'a'}),error=>error instanceof ApiError && error.status===0 && error.message.includes('서버에 연결하지 못했습니다'));
});
test('프록시의 빈 500 응답을 서버 오류로 표시한다',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response('',{status:500}));
  await assert.rejects(api('/games',{}),error=>error instanceof ApiError && error.status===500 && error.message.includes('서버 요청을 완료하지 못했습니다'));
});
test('실제 모델 오류와 버전 충돌의 서버 메시지·상태를 보존한다',async t=>{
  for(const status of [409,502]) {
    t.mock.method(globalThis,'fetch',async()=>Response.json({error:'원래 서버 오류 안내'},{status}));
    await assert.rejects(api('/games/example/turns',{}),error=>error instanceof ApiError && error.status===status && error.message==='원래 서버 오류 안내');
    t.mock.restoreAll();
  }
});
test('취소된 요청은 연결 실패로 바꾸지 않는다',async t=>{
  const aborted=new DOMException('Aborted','AbortError');
  t.mock.method(globalThis,'fetch',async()=>{throw aborted;});
  await assert.rejects(api('/catalog'),error=>error===aborted);
});
test('정상 면담 응답과 소유자 쿠키·요청 본문은 그대로 전달한다',async t=>{
  let sent;
  t.mock.method(globalThis,'fetch',async(url,options)=>{sent={url,options};return Response.json({game_id:'saved-game'});});
  assert.deepEqual(await api('/games',{character_id:'a',scenario:'part2'}),{game_id:'saved-game'});
  assert.equal(sent.url,'/api/games');assert.equal(sent.options.credentials,'same-origin');assert.equal(sent.options.method,'POST');
  assert.deepEqual(JSON.parse(sent.options.body),{character_id:'a',scenario:'part2'});
});
