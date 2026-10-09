# EH Locker System — 프로젝트 현황 (Claude Code 인계용)

에브리아워 스터디카페(성수점 placeSeq 5333 / 구의점 5348) 사물함 만료 관리 웹앱.
CS system / IoT system과 같은 구조: 단일 `index.html`(GitHub Pages) + Apps Script 웹앱(백엔드).

## 1. 배포 구조
| 구성 | 위치 |
|---|---|
| 프론트 | https://everyhour365.github.io/EH_Locker/ (레포 `everyhour365/EH_Locker`, 공개, main 브랜치 루트) |
| 백엔드 | Apps Script 프로젝트 "EH Locker System" (스크립트 ID `16DoqmDWufp454xfvIicCchm6OOimDHaWjYBDt-ERztHeEjHW-vAgqoQR`, clasp 연결) |
| 웹앱 URL | `index.html`의 `GAS_URL` 참고 (배포 ID `AKfycbyumEL_p516n7f8gZx36gB5H7v3j4kQWfCup5Q3_0LY7uIWmyaTbme978USqhg0Y292gw`, 현재 @5) |
| 접속 키 | `apps-script/Config.js`의 `ACCESS_KEY_DEFAULT` (로컬 전용). 앱 ⚙ 설정에 입력 |
| 계정 | `apps-script/Config.js`의 `SM_ACCOUNTS` (스터디모아 관리자 계정, **git 제외**) |

## 2. 폴더 구조
```
EH_Locker_system/
├─ index.html              프론트 전체 (HTML+CSS+JS 단일 파일)
├─ CLAUDE.md               이 문서
├─ .gitignore              Config.js, .clasp.json, node_modules 제외
└─ apps-script/
   ├─ Code.js              웹앱 백엔드 (doPost: lockers / markSent)
   ├─ appsscript.json      웹앱 설정 (USER_DEPLOYING, ANYONE_ANONYMOUS, Asia/Seoul)
   ├─ Config.js            ⚠ git 제외 — 계정/접속 키. clasp push로만 올라감
   └─ .clasp.json          ⚠ git 제외 — 스크립트 ID
```
- clasp 실행파일은 `EH_dashboard/node_modules/.bin/clasp` (v3.4.1) 사용. 이 폴더에는 설치 안 함. 로그인은 이미 되어 있음.

## 3. 동작
- 지점 탭(성수/구의) + 사물함 격자. 만료 **D-3 ~ 만료 후 14일** 칸은 빨간 점선("확인 필요"). 칸을 탭하면 목록의 해당 행으로 이동.
- 목록 행: 번호 · 이용자 · D-N/N일 경과 · 만료일 · 연장 시 만료일(+28일) · 연장 횟수.
- **[문자]**: 누르면 문구를 클립보드에 복사(토스트 "문구 복사됨") + 문자앱이 번호·문구가 채워진 채 열림(`sms:`, iOS는 `&body=`) + GAS에 발송 기록. 행에 `✓ 문자 MM-DD HH:mm` 표시.
- **[문구]**: 문구만 복사. **[연장하기 ↗]**: 스터디모아 어드민 사물함 페이지(연장은 수동). **↻**: 캐시 우회 새로고침. 3분마다 자동 갱신.
- ⚙ 설정(기기별 localStorage): 접속 키 / 금액 / 계좌 / 문구. 기본 문구는 `index.html`의 `DEFAULT_TPL` (금액 1만 원, 계좌 카카오뱅크 3333-25-0277947 포아워스).
- `GAS_URL`이 비면 데모 데이터로 동작(UI 테스트용).

## 4. 백엔드 핵심 (apps-script/Code.js)
- 스터디모아 로그인 → `GET /api/locker/{placeSeq}?incUsage=true`. 토큰 1시간 캐시(Script Properties `TOKEN_<지점>`), 401 시 재로그인.
- 응답 캐시 120초(`fresh:true`면 우회) — 스터디모아 호출량 최소화(비공식 API라 계정 제재 리스크 관리).
- `lastKnown`: 사물함은 **만료되면 usage에서 이용자(이름/번호)가 사라짐** → 조회할 때마다 마지막으로 본 이용자를 `LAST_KNOWN_<지점>` 속성에 보관. 보관 시작 이전에 만료된 칸은 "이용자 정보 없음".
- `SENT_LOG`: 문자 발송 기록(키 `지점|칸번호|만료일`), 60일 보관.
- 접속 키 검사: Script Properties `ACCESS_KEY` 우선, 없으면 `Config.js`의 `ACCESS_KEY_DEFAULT`. 계정도 속성 → Config.js 순.
- 프론트→GAS는 `fetch(GAS_URL, {method:'POST', body: JSON.stringify(...)})` (프리플라이트 없는 단순 요청, IoT와 동일). **curl로 테스트할 때는** `-L` 없이 POST 후 `redirect_url`을 GET으로 따라가야 함.

## 5. 배포 방법
- 프론트: `git add -A && git commit && git push` → Pages 자동 반영 (1~2분).
- 백엔드: `cd apps-script && clasp push -f && clasp deploy -i <배포ID> -d "설명"` (같은 URL 유지, `-i` 필수).
- ⚠ **Apps Script 에디터에서 코드를 직접 수정하지 말 것.** clasp push가 덮어쓰고, 저장 안 한 편집은 새로고침하면 사라짐. 수정은 항상 로컬 파일에서.
- ⚠ Script Properties에 값을 넣어도 사용자가 저장을 못 한 사례가 있어 계정/키는 `Config.js` 방식으로 운영 중.

## 6. 운영 결정 / 메모
- 연장은 자동화하지 않음(스터디모아 어드민 수동 연장). 비공식 쓰기 API 리스크 때문.
- 알림톡은 스터디모아가 D-3 / D-1 / 당일 3회 발송 중(결제 링크·계좌 없음, 당일 템플릿 "17번번" 오타). 이 앱은 그 이후 입금 안내 문자를 보조.
- 14일 보관 후 폐기 정책은 알림톡 문구에 이미 있음. 앱의 14일 표시 한도(`OVERDUE_LIMIT`)도 이에 맞춤.
- 기존 EH_dashboard의 좌석 탭 사물함 UI(`LockerGrid`)는 변경하지 않음. 이 앱은 대시보드와 독립.
- 공개 레포라 `index.html`에는 GAS URL과 입금 계좌 문구가 포함됨. 이용자 정보는 접속 키 없이는 내려가지 않음.

## 7. 알려진 이슈 / 다음 후보
- 문자앱 `sms:` 링크(번호+문구 자동 채움)는 실제 iPhone에서 확인 필요.
- 구의 5·15번 등 보관 이전에 만료된 칸은 이용자 불명(앞으로는 자동 보관).
- 후보: 발송 이력 보기, 만료 알림 푸시(Slack), 연체 14일 초과 칸 별도 표시, 금액을 사물함 상품별로 구분, 접속 키 변경 방법 정리.
