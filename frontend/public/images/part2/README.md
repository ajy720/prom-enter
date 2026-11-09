# Part 2 임시 이미지

실제 인물 사진을 사용하지 않는 교체용 SVG다. 기존 도입·면담 사진은 변경하지 않는다.

- `person-placeholder.svg`: 신입·백하연의 임시 인물 자리
- `room-placeholder.svg`: 월별 사건의 임시 배경
- 경로 매핑: `frontend/src/part2Content.ts`의 `part2Visuals`

실제 사진을 적용할 때 해당 경로 매핑을 인물별·장면별로 확장한다. API 화자·인물 ID나 서버 상태를 이미지 경로에 맞춰 바꾸지 않는다.
