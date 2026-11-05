# ITM Card Studio — 운영 안내 (v1)

접속: https://p0emkite.github.io/IDOL-THE-MOMENT/studio.html

## 기능
- 사진·그룹 로고를 따로 업로드해 공통 등급 프레임과 동적으로 합성합니다.
- 그룹: 코드, 이름, 공통 로고. 그룹 로고는 카드에 자동 적용됩니다.
- 카드: 그룹, 멤버명, 시리즈, N/R/SR/SSR/UR, 사진, 확대/위치, 선택적 UR 풀아트, 임시저장/공개.
- 미리보기: 카드 안에서 이미지 드래그, 3개 크롭 조절 슬라이더, 5등급 전환, PNG 출력.
- 편집 체험은 로그인 없이도 가능하지만 저장·공개는 관리자로 등록된 ITM ID만 가능합니다.
- 5등급 각각 한 장 이상 공개되면 테스트 팩에서 실카드 팩으로 전환됩니다. 1장마다 N55/R28/SR12/SSR4/UR1% 독립 추첨입니다.
- 로그인 유저의 실카드 보유량은 서버, 게스트는 브라우저에 저장됩니다. 기존 테스트 도감은 보존됩니다.

## 관리자 계정 등록
관리자 ID는 보안상 임의 선정하지 않았습니다. 소유자가 자신의 ITM ID를 알려주면,
다음 SQL을 ITM 프로젝트 ENCORE-IDOL-CARDS 에서만 실행해 등록합니다:

    insert into private.itm_studio_admins(user_id)
    select id from auth.users
    where email='itm.<관리자ITM_ID>@accounts.itm.example'
      and raw_app_meta_data->>'itm_named_account'='true'
    on conflict(user_id) do nothing;

RTM의 RKBO-ONLINE 프로젝트에는 절대 실행하지 않습니다.

## 저장 및 보안
- ITM Supabase 전용 DB: itm_groups / itm_catalog / itm_card_inventory / itm_card_pack_rolls.
- 사진·로고는 공개형 itm-card-media 버킷에 저장. 업로드 권한은 관리자에게만 허용(RLS).
- 공개 버킷이므로 업로드된 이미지의 주소를 아는 사람은 볼 수 있습니다. 공개 전 보안이 필요한 이미지라면 별도 비공개 저장소가 필요합니다.
- 이미지 제한: PNG/JPEG/WebP, 최대 12MB. 클라이언트에 서비스 키는 노출하지 않습니다.
- 일반 이용자는 공개 카드만 조회할 수 있습니다. 서버 추첨은 보안 제어된 SQL 함수로 수행됩니다.

## 개발 파일
- studio.html, studio.css, studio.js: 관리자 제작 화면.
- card-frame.js: 카드 공통 프레임 및 크롭 렌더러.
- app.js: 공개 카드 로드, 실카드 서버 추첨·도감, 테스트 보존.
- supabase/itm_card_studio.sql: 새 DB/스토리지/RLS 스키마.
- tests/itm-browser-check.mjs: 스튜디오 접근, 프레임, 개봉, 모바일 회귀 검사.

실카드를 임시저장으로 바꾸면 신규 팩에 나오지 않으나 기존 획득 기록은 삭제하지 않습니다.
