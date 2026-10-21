# 공개 빌드와 실제 배포

선택한 구성은 **GitHub → Cloudflare Pages + Supabase**입니다.

- 소스 저장소: https://github.com/wjdwngus2056-jpg/StoneShard-BuildPlanner
- Cloudflare Pages: 화면과 게임 이미지 배포
- Supabase: Google 로그인, 공개 빌드 저장, 작성자 권한
- 개발용 브라우저 저장: 기존대로 유지. 공개하기를 누르기 전에는 서버에 빌드를 보내지 않습니다.

현재 코드와 배포용 파일 생성은 준비되어 있습니다. 계정/프로젝트를 아직 생성하지 않았으므로 실제 서비스 연결과 배포는 완료되지 않았습니다. 설정이 비어 있을 때 공개 목록은 준비 중으로 표시하고 기존 빌더는 그대로 동작합니다.

## 1. Supabase 프로젝트 생성

1. https://supabase.com/dashboard 에 로그인하고 새 프로젝트를 만듭니다. 데이터베이스 비밀번호는 계정의 안전한 보관소에 저장합니다.
2. **SQL Editor**에서 `supabase/migrations/202610210001_published_builds.sql` 전체를 한 번 실행합니다.
3. 프로젝트의 **Connect / API Keys**에서 프로젝트 URL과 **publishable key**를 확인합니다. 기존 프로젝트의 `anon` 키도 지원합니다. `service_role`, `sb_secret_` 키, DB 비밀번호는 브라우저 설정이나 GitHub에 넣지 않습니다.

테이블은 공개된 빌드만 보관합니다. 비로그인 사용자도 열람할 수 있으며 작성·수정·삭제는 로그인한 작성자로 제한하는 RLS 정책을 포함합니다. 작성자 ID와 생성 시각은 클라이언트가 지정하거나 변경할 수 없도록 컬럼 권한도 제한했습니다. 개인 이메일은 공개 빌드 행에 저장하지 않습니다.

## 2. Cloudflare Pages에 GitHub 저장소 연결

1. https://dash.cloudflare.com 에 로그인합니다.
2. **Workers & Pages → Create application → Pages → Import an existing Git repository**에서 위 저장소를 연결합니다. Workers의 별도 서버 템플릿 대신 **Pages**를 선택합니다.
3. 다음 값을 사용합니다.

| 설정 | 값 |
|---|---|
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `node scripts/build-static.cjs --require-cloud` |
| Build output directory | `dist` |
| Root directory | 저장소 루트 |

4. 빌드 환경 변수에 아래 두 값을 넣습니다. 두 값은 브라우저에서 사용하는 공개 설정이며, 빌드 시 `dist/cloud-config.js`로 생성됩니다.

| 환경 변수 | 값 |
|---|---|
| `SUPABASE_URL` | Supabase 프로젝트 URL (`https://프로젝트ID.supabase.co`) |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase의 publishable key 또는 기존 anon key |

`.node-version`으로 Node 22를 지정합니다. 패키지 설치 단계는 필요 없습니다. `dist`에는 실제 사이트 파일과 이미지 3종 디렉터리만 복사하며 개발 자료·테스트·SQL·로컬 캐시·환경 파일은 배포하지 않습니다.

5. 최초 배포 후 생성된 `https://프로젝트이름.pages.dev` 주소를 확인합니다. 이후 `main`에 올린 변경 사항은 Cloudflare에서 자동 배포합니다.

## 3. Google 로그인 연결

1. Supabase의 **Authentication → URL Configuration**에서 **Site URL**에 최종 Pages 주소를 넣습니다.
2. **Redirect URLs**에 `https://프로젝트이름.pages.dev/**`를 추가합니다. 커스텀 도메인을 사용하면 그 도메인도 별도로 등록합니다. 다른 사람의 Pages 주소까지 허용하는 와일드카드는 사용하지 않습니다.
3. Supabase의 **Authentication → Sign In / Providers → Google**에서 Google 로그인을 활성화합니다.
4. Google Cloud Console의 OAuth 설정에서 웹 애플리케이션 클라이언트를 생성하고, Supabase Google 설정에 표시된 **Callback URL**을 승인된 리디렉션 URI로 등록합니다. Google Client ID와 Client Secret은 **Supabase 설정 화면**에 입력합니다. 저장소나 채팅으로 전달할 필요가 없습니다.
5. Google OAuth 동의 화면을 일반 사용자가 로그인할 수 있는 게시 상태로 설정합니다. 테스트 상태에서는 등록한 테스트 계정만 사용할 수 있습니다.

앱은 Supabase JS `2.118.0`을 고정 버전으로 필요한 연결 시 불러오며 PKCE 로그인 흐름을 사용합니다. 로그인 후 공개 폼을 다시 보여주지만 자동 업로드하지 않습니다.

## 4. 연결 후 실제 확인

1. 로그아웃한 상태에서 공개 빌드 목록과 공유 주소를 열어봅니다.
2. 계정 A로 로그인해 임시 빌드를 공개합니다. 빌드 특징·장점·단점, 최종 장비·추천 인챈트·장비 설명, 스탯·스킬·문헌, 1~5티어 운영 설명과 힐다 기념품 선택이 그대로 보이는지 확인합니다.
3. 다른 브라우저/계정 B에서 같은 빌드를 열고 A의 빌드를 수정·삭제할 수 없는지 확인합니다.
4. A로 다시 로그인해 **내 공개 빌드 수정**으로 편집용 복사본을 열고, **공개하기 → 기존 빌드 수정**으로 업데이트합니다. 기존 공유 주소가 유지됩니다.
5. 임시 공개 빌드를 삭제한 뒤 목록과 공유 주소에서 사라졌는지 확인합니다. 개인 브라우저 저장본과 편집 중이던 빌드는 보존되어야 합니다.

현재 자동 테스트는 직렬화, 클라이언트의 작성자 필터·로그인 요구, 공개 열람 시 개인 초안 보존, 폼/목록 동작을 검증합니다. 실제 Supabase의 RLS·OAuth와 Cloudflare 도메인은 프로젝트 연결 전에는 검증할 수 없습니다. 이 단계가 끝나야 실제 공개 서비스 동작을 확인한 것입니다.

## 로컬 검증과 배포 파일 생성

```powershell
node --test tests/*.test.cjs
node scripts/build-static.cjs
```

설정 없이 두 번째 명령을 실행하면 연결 전 검토용 `dist`를 만듭니다. `--require-cloud`를 붙이면 공개 설정이 없거나 관리자 키가 들어간 경우 배포용 빌드를 중단합니다. 로컬 설정으로 연결을 확인하려면 `cloud-config.js`의 두 빈 문자열을 **공개 URL과 공개 키**로만 채우면 됩니다.

첫 배포 전 연결 값과 Google OAuth 설정은 각 계정의 소유자가 준비해야 합니다. 계정 비밀번호, Google Client Secret, Supabase 관리자 키는 전달하지 않아도 됩니다.

참고: [Cloudflare Git 연동](https://developers.cloudflare.com/pages/get-started/git-integration/), [Supabase Google 로그인](https://supabase.com/docs/guides/auth/social-login/auth-google), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
