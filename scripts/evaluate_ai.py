"""Repeatable fixtures. Default is offline; paid calls require an explicit double opt-in."""
import argparse
import json
import os
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from app.ai.context import build_context, build_dialogue_context, scope_actor
from app.ai.director import character_direction
from app.ai.providers import DemoProvider, OpenAIProvider, PROMPT_VERSION, validate_analysis, validate_dialogue
from app.models import Dialogue, State


def evaluate(provider):
    analysis_cases=json.loads((ROOT/'backend/tests/fixtures/ai_turns.json').read_text())
    dialogue_cases=json.loads((ROOT/'backend/tests/fixtures/dialogue_cases.json').read_text())
    results=[]
    for case in analysis_cases:
        start=time.perf_counter()
        try:
            state=State(game_id='evaluation',character_id='a',event_id=case['event'])
            context,_=build_context(state,[],case['text'])
            output=validate_analysis(provider.analyze(case['text'],context),case['text'],context)
            checks=[output.action_id==case['action'], output.needs_clarification==case.get('clarify',False)]
            if 'kind' in case: checks.append(output.utterance_kind==case['kind'])
            if 'criterion' in case: checks.append(any(a.criterion_id==case['criterion'] and a.status=='met' for a in output.assessments))
            if case.get('no_criterion'): checks.append(not output.assessments)
            results.append({'stage':'analysis','input':case['text'],'passed':all(checks),'output':output.model_dump(),'elapsed_seconds':round(time.perf_counter()-start,3)})
        except Exception as exc:
            results.append({'stage':'analysis','input':case['text'],'passed':False,'error_type':type(exc).__name__})
    for case in dialogue_cases:
        start=time.perf_counter()
        try:
            state=State(game_id='evaluation',character_id=case['character_id'],event_id=case['event_id'])
            state.stats.trust=case['trust']; state.stats.fatigue=case['fatigue']
            actor=build_dialogue_context(state,[],case['text'],facts=case['facts'])
            messages=[]
            for role in actor.allowed_speakers:
                view=scope_actor(actor,state,case['text'],role,[])
                part=validate_dialogue(provider.generate(case['text'],view,character_direction(state,'pending'),case['facts'],False),view)
                messages.extend(part.messages)
            output=Dialogue(messages=messages)
            results.append({'stage':'dialogue','id':case['id'],'passed':True,'output':output.model_dump(),
                            'human_review_required':True,'review_rubric':case['review'], 'elapsed_seconds':round(time.perf_counter()-start,3)})
        except Exception as exc:
            results.append({'stage':'dialogue','id':case['id'],'passed':False,'error_type':type(exc).__name__})
    return {'provider':provider.name,'prompt_version':PROMPT_VERSION,
            'passed':sum(r['passed'] for r in results),'total':len(results),'results':results}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--provider',choices=['demo','openai'],default='demo')
    parser.add_argument('--allow-paid',action='store_true')
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    if args.provider=='openai':
        if not args.allow_paid:
            parser.error('실제 모델 평가는 과금됩니다. 명시적으로 --allow-paid를 지정해야 합니다.')
        from dotenv import load_dotenv
        load_dotenv(ROOT/'backend/.env')
        if not os.getenv('OPENAI_API_KEY') or not os.getenv('OPENAI_MODEL'):
            parser.error('OPENAI_API_KEY와 OPENAI_MODEL이 필요합니다.')
        provider=OpenAIProvider.from_env()
    else:
        provider=DemoProvider()
    result=evaluate(provider)
    if args.output:
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({key:value for key,value in result.items() if key!='results'},ensure_ascii=False))
    return 0 if result['passed']==result['total'] else 1


if __name__=='__main__':
    raise SystemExit(main())
