import type { Game } from './types';

export function PlayModeInfo({provider}: {provider: Game['provider']}) {
  return <details className="play-mode-info"><summary>플레이 정보</summary><p>{provider === 'demo'
    ? '현재 규칙 기반 데모 모드입니다. 대화는 실제 AI가 생성한 답변이 아닙니다.'
    : provider === 'fixture' ? '개발용 대화 예시입니다.' : '현재 실제 AI 모델과 대화하고 있습니다.'}</p></details>;
}
