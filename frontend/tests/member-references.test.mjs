import test from 'node:test';
import assert from 'node:assert/strict';
import { secretaryText } from '../src/narrationText.ts';
import { createPart3, part3Intro, part3Guidance } from '../src/part3State.ts';
import { createPart4 } from '../src/part4State.ts';
import { part4Intro } from '../src/part4Content.ts';

for (const [id, name] of [['hyerin','이도'], ['seoyeon','여울'], ['jiwoo','사야']]) {
  test(`${name} 선발 후 백하연 안내는 이름과 자연스러운 조사를 사용한다`, () => {
    assert.equal(secretaryText('신입과 신입이 원하는 방향을 논의합니다.', name), `${name} 씨와 ${name} 씨가 원하는 방향을 논의합니다.`);
    const third = {...createPart3(), newcomer:{id,name}};
    for (let month = 7; month <= 12; month++) {
      for (const line of part3Intro({...third, month})) {
        if (line.name === '백하연') assert.doesNotMatch(line.text, /신입/);
      }
      assert.doesNotMatch(part3Guidance({...third, month}), /신입/);
    }
    assert.match(part3Intro({...third,month:10}).find(line=>line.name==='백하연').text, new RegExp(`${name} 씨와 리안`));
    for (const route of ['domestic','overseas']) {
      const fourth = {...createPart4(undefined,'national'), newcomer:{id,name}, route};
      for (let month = 13; month <= 24; month++) {
        for (const line of part4Intro({...fourth,month})) {
          if (line.name === '백하연') assert.doesNotMatch(line.text, /신입/);
        }
      }
    }
    const speech = '신입 시절부터 응원해주신 팬 여러분 감사합니다.';
    assert.equal(part3Intro({...third,month:12,results:{11:'success'},speech})[1].text, speech);
  });
}


test('백하연이 직접 인용한 사용자 문장은 원문을 유지한다', () => {
  assert.equal(secretaryText('대표님은 “신입을 도와줘”라고 하셨습니다. 신입과 이야기하겠습니다.', '여울'),
    '대표님은 “신입을 도와줘”라고 하셨습니다. 여울 씨와 이야기하겠습니다.');
});
