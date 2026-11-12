# 4개월차 데뷔 뮤직비디오

2026-11-12 사용자 제공 영상의 웹 재생용 사본이다. 원본은 수정하지 않는다.

| 선발 ID | 웹 파일 | 제공 원본 |
|---|---|---|
| `hyerin` (이도) | `ido.mp4` | `PromU_이도.mp4` |
| `seoyeon` (여울) | `yeoul.mp4` | `PromU_여울.mp4` |
| `jiwoo` (사야) | `saya.mp4` | `PromU_saya.mp4` |

원본 위치는 제공 당시 `C:/Users/kely1/Downloads/`다. 이도 압축본을 사용자가 확인한 후 동일 설정을 세 버전에 적용했다. MP4는 각각 약 75~79MB이며 전체 길이를 유지한다. JPG는 영상 3초 지점의 미리보기다.

FFmpeg로 갱신한다. `INPUT.mp4`와 `MEMBER`를 위 표에 맞춰 바꾼다.

```sh
ffmpeg -i INPUT.mp4 -map 0:v:0 -map 0:a:0 -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a copy -movflags +faststart MEMBER.mp4
ffmpeg -ss 3 -i MEMBER.mp4 -frames:v 1 -q:v 2 MEMBER.jpg
ffmpeg -v error -i MEMBER.mp4 -f null -
```

해상도와 프레임 수는 원본을 유지하고 음성은 재압축하지 않는다. 영상 파일과 미리보기를 함께 갱신하고 PC·모바일 브라우저의 실제 재생을 확인한다. 웹 서버는 MP4의 범위 요청을 지원해야 탐색과 이어받기가 원활하다.
