# EH Locker System — 프로젝트 현황

에브리아워 사물함 만료 관리 웹앱. CS system / IoT system과 같은 구조 (단일 `index.html` 정적 사이트 + Apps Script 웹앱).

## 구조
| 구성 | 내용 |
|---|---|
| 프론트 | `index.html` 단일 파일 (GitHub Pages 배포 예정, 레포 미생성) |
| 백엔드 | `apps-script/Code.js` — 스터디모아 사물함 조회 + 마지막 이용자 보관 + 문자 발송 기록 |
| 상태 | GAS 배포 완료(@1, 배포 ID `AKfycbyumEL_p516n7f8gZx36gB5H7v3j4kQWfCup5Q3_0LY7uIWmyaTbme978USqhg0Y292gw`), `index.html`에 `GAS_URL` 반영. GitHub 미배포. 스크립트 속성(계정·ACCESS_KEY)·권한 승인은 사용자 작업 |
| Apps Script | https://script.google.com/d/16DoqmDWufp454xfvIicCchm6OOimDHaWjYBDt-ERztHeEjHW-vAgqoQR/edit (clasp, `apps-script/.clasp.json`) |

## 화면 / 동작
- 지점 탭(성수/구의) + 사물함 격자. 만료 D-3 ~ 만료 후 14일 칸은 빨간 점선(확인 필요), 탭하면 아래 목록으로 이동.
- 목록 행: 번호·이용자·D-N/N일 경과·만료일·연장 시 만료일(+28일)·연장 횟수.
- **[문자]**: 누르면 문구가 클립보드에 복사되고(토스트 "문구 복사됨") 문자앱이 번호+문구가 채워진 채 열림 → 발송만 누르면 됨. 누르면 GAS에 발송 기록(✓ 문자 MM-DD HH:mm) 저장.
- **[문구]**: 문구만 복사. **[연장하기 ↗]**: 스터디모아 어드민 사물함 페이지(수동 연장). **↻**: 캐시 우회 새로고침.
- ⚙ 설정(기기별 localStorage): 접속 키, 금액, 계좌, 문자 문구. 기본 문구는 `DEFAULT_TPL` (금액 1만 원, 카카오뱅크 3333-25-0277947 포아워스).
- 만료되면 스터디모아 usage에서 이용자(이름/번호)가 사라지므로 GAS가 마지막으로 본 값을 `LAST_KNOWN_<지점>` 속성에 보관. 보관 이전에 만료된 칸은 "이용자 정보 없음".

## 남은 작업 (사용자) — 1·4는 완료
- 코드 수정 후: `cd apps-script && clasp push -f && clasp deploy -i AKfycbyumEL_p516n7f8gZx36gB5H7v3j4kQWfCup5Q3_0LY7uIWmyaTbme978USqhg0Y292gw` (URL 유지)

## 최초 배포 순서 (참고)
1. `cd apps-script && npx clasp create --type webapp --title "EH Locker System" --rootDir .` (또는 script.google.com에서 새 프로젝트 → Code.js/appsscript.json 붙여넣기)
2. 스크립트 속성: `SM_ID_SEONGSU` `SM_PW_SEONGSU` `SM_ID_GUUI` `SM_PW_GUUI` `ACCESS_KEY` (스터디모아 계정은 코드에 넣지 말 것)
3. 에디터에서 `debugRun` 1회 실행(권한 승인) → "이용 N/M" 로그 확인
4. 웹앱 배포 (실행: 나, 액세스: 모든 사용자) → URL을 `index.html`의 `GAS_URL`에 입력
5. GitHub 레포 생성 후 Pages 배포, 폰 홈 화면에 추가. 첫 접속 시 ⚙에서 접속 키 입력
- 이후 코드 수정 배포는 IoT처럼 `clasp deploy -i <배포ID>`로 URL 유지.

## 메모
- 연장은 자동화하지 않음(스터디모아 비공식 쓰기 API 리스크). 어드민에서 수동 연장 후 ↻.
- 기존 EH_dashboard 사물함 UI는 변경하지 않음 (좌석 탭 `LockerGrid` 원본 유지).
