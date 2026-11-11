import test from 'node:test';
import assert from 'node:assert/strict';
import { narrationText } from '../src/narrationText.ts';

test('선발 이름의 받침에 맞춰 나레이션 조사를 표시한다', () => {
  const text = '신입은 신입이 준비한 무대에서 신입을 소개하고 신입과 인사했다. 신입의 차례다.';
  assert.equal(narrationText(text, '이도'), '이도는 이도가 준비한 무대에서 이도를 소개하고 이도와 인사했다. 이도의 차례다.');
  assert.equal(narrationText(text, '여울'), '여울은 여울이 준비한 무대에서 여울을 소개하고 여울과 인사했다. 여울의 차례다.');
  assert.equal(narrationText('신입으로 합류했다.', '여울'), '여울로 합류했다.');
  assert.equal(narrationText('신입으로 합류했다.', '사야'), '사야로 합류했다.');
  assert.equal(narrationText('신입이라는 소개', '사야'), '사야라는 소개');
});

test('선발 전 문구와 다른 멤버 이름은 유지한다', () => {
  assert.equal(narrationText('신입을 선발한다.'), '신입을 선발한다.');
  assert.equal(narrationText('리안과 도하가 세인을 기다렸다.', '사야'), '리안과 도하가 세인을 기다렸다.');
});
