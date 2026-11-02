"""Talk to any of the seven personas without starting the game server or frontend."""
import argparse
import os
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from dotenv import load_dotenv
from app.ai.persona import PersonaOptions, PersonaSession, resolve_character
from app.ai.profiles import PROFILES
from app.ai.providers import DemoProvider, OpenAIProvider

HELP='''/characters              캐릭터 목록
/character 이름 또는 ID   캐릭터 변경 (대화 초기화)
/profile                 현재 캐릭터의 기본 설정과 말투
/knowledge               현재 인물이 대화에서 사용할 수 있는 정보 (개발용)
/trust 0~100             테스트용 신뢰도
/fatigue 0~100           테스트용 피로도
/scene 상황              테스트 장면 설정
/reset                   대화와 습득 정보 전체 초기화
/save 파일.json          대화 내보내기 (기존 파일 덮어쓰기 안 함)
/config                  모델·effort 확인 (키는 표시하지 않음)
/quit                    종료'''


def characters():
    for index,profile in enumerate(PROFILES.values()):
        print(f"{index}. {profile['name']} ({profile['id']})")


def safe_error(exc):
    # SDK error bodies can include invalid credentials. Never echo the raw exception.
    kind=type(exc).__name__
    if kind=='AuthenticationError': return 'API 인증에 실패했습니다. backend/.env의 키를 확인해주세요.'
    if kind=='RateLimitError': return 'API 사용 한도 또는 요청 한도에 도달했습니다.'
    if kind in {'APITimeoutError','APIConnectionError'}: return 'API 연결 또는 응답 시간이 초과됐습니다. 다시 시도할 수 있습니다.'
    if kind=='BadRequestError': return '모델·effort·구조화 출력 설정을 API가 거부했습니다. 지원 설정을 확인해주세요.'
    return f'응답을 완료하지 못했습니다 ({kind}). 이 입력은 대화 기록에 추가하지 않았습니다.'


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--character',help='예: 백하연, 여울, yeoul, ido, saya 또는 0~6')
    parser.add_argument('--provider',choices=['openai','demo'],default='openai')
    parser.add_argument('--message',help='한 번만 질문하고 종료')
    parser.add_argument('--trust',type=int,default=35)
    parser.add_argument('--fatigue',type=int,default=20)
    parser.add_argument('--scene',default='대표와의 첫 면담. 서로 인사하고 현재의 고민을 이야기한다.')
    parser.add_argument('--list',action='store_true',help='캐릭터 목록만 출력. API 호출 없음')
    parser.add_argument('--check',action='store_true',help='설정 유무만 점검. API 호출 없음')
    parser.add_argument('--output',type=Path,help='종료 시 대화 기록을 새 JSON 파일에 저장')
    args=parser.parse_args()
    load_dotenv(ROOT/'backend/.env')
    if args.list:
        characters(); return 0
    if args.check:
        print('API 키: '+('설정됨' if os.getenv('OPENAI_API_KEY','').strip() else '없음'))
        print('모델: '+(os.getenv('OPENAI_MODEL','').strip() or '없음'))
        print('effort: '+(os.getenv('OPENAI_REASONING_EFFORT','').strip() or '미지정 (모델 기본값)'))
        return 0
    try:
        options=PersonaOptions(trust=args.trust,fatigue=args.fatigue,scene=args.scene)
        selected=args.character
        if not selected:
            if args.message or not sys.stdin.isatty():
                selected='baek_hayeon'
            else:
                characters()
                selected=input('대화할 캐릭터 [기본: 백하연]: ').strip() or 'baek_hayeon'
        selected=resolve_character(selected)
        provider=OpenAIProvider.from_env() if args.provider=='openai' else DemoProvider()
        session=PersonaSession(provider,selected,options)
    except ValueError as exc:
        # Local configuration errors contain only our fixed messages, not SDK payloads.
        print(str(exc),file=sys.stderr); return 2
    print(f"[{session.profile.name}] {provider.name} / 모델 {getattr(provider,'model','없음')} / effort {getattr(provider,'reasoning_effort',None) or '미지정'}")
    print('실제 모델 모드: 질문마다 생성 요청 1회가 과금됩니다.' if provider.name=='openai' else '데모 모드: 실제 AI 페르소나 품질을 검증하는 응답이 아닙니다.')

    def ask(text):
        try:
            dialogue=session.chat(text)
            for message in dialogue.messages:
                print(f'\n{session.profile.name}: {message.text}\n')
            return True
        except Exception as exc:
            print(safe_error(exc),file=sys.stderr)
            return False

    if args.message is not None:
        if not ask(args.message): return 1
    else:
        print('명령은 /help, 종료는 /quit 입니다.')
        while True:
            try: text=input('대표님> ').strip()
            except (EOFError,KeyboardInterrupt):
                print(); break
            if not text: continue
            if not text.startswith('/'):
                ask(text); continue
            command,_,value=text.partition(' ')
            try:
                if command in {'/quit','/exit'}: break
                elif command=='/help': print(HELP)
                elif command=='/characters': characters()
                elif command=='/character':
                    session.switch(value); print(session.profile.name+' (대화 초기화)')
                elif command=='/reset': session.reset(); print('대화와 습득 정보를 초기화했습니다.')
                elif command=='/knowledge':
                    for record in session.context('').knowledge:
                        print(f'[{record.id}] {record.title}: {record.text} (종류={record.kind}, 출처={record.source})')
                elif command=='/profile':
                    print(session.profile.basic_profile+'\n\n'+session.profile.persona+'\n\n'+session.profile.speech_style)
                elif command in {'/trust','/fatigue'}:
                    session.configure(**{command[1:]:int(value)}); print(f'{command[1:]}={value}')
                elif command=='/scene': session.configure(scene=value); print('장면을 변경했습니다.')
                elif command=='/config': print(f"provider={provider.name}, model={getattr(provider,'model',None)}, effort={getattr(provider,'reasoning_effort',None)}, trust={session.options.trust}, fatigue={session.options.fatigue}")
                elif command=='/save':
                    session.save(Path(value)); print('대화 기록을 저장했습니다.')
                else: print('/help에서 명령을 확인해주세요.')
            except (ValueError,OSError): print('명령 값이나 저장 경로를 확인해주세요. 기존 파일은 덮어쓰지 않습니다.')
    if args.output:
        try: session.save(args.output)
        except OSError:
            print('대화 기록을 저장하지 못했습니다. 경로 또는 기존 파일을 확인해주세요.',file=sys.stderr); return 1
    return 0


if __name__=='__main__':
    raise SystemExit(main())
