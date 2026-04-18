# 채용 평가 시스템 - Railway 배포 및 운영 매뉴얼

---

## 목차
1. [최초 배포 (GitHub → Railway)](#1-최초-배포)
2. [Railway 환경변수 설정 (Supabase 연결)](#2-railway-환경변수-설정)
3. [Supabase 데이터베이스 초기 세팅](#3-supabase-데이터베이스-초기-세팅)
4. [지원자 파일 추가/변경 방법](#4-지원자-파일-추가변경-방법)
5. [평가위원 계정 관리](#5-평가위원-계정-관리)
6. [코드 수정 후 재배포](#6-코드-수정-후-재배포)
7. [문제 해결 (Troubleshooting)](#7-문제-해결)

---

## 1. 최초 배포

### 1-1. GitHub에 저장소 생성 및 푸시

1. GitHub(github.com)에 로그인
2. 우측 상단 `+` → `New repository` 클릭
3. 저장소 이름 입력 (예: `hr-recruitment-evaluation`) → `Create repository`
4. 로컬에서 아래 명령어 실행 (저장소 URL은 GitHub에서 복사)

```bash
cd "C:\Users\sensm\Desktop\12_기타문서\HR-recruitment-evaluation-system"
git remote add origin https://github.com/[내아이디]/[저장소이름].git
git branch -M main
git push -u origin main
```

### 1-2. Railway 프로젝트 생성

1. [railway.app](https://railway.app) 로그인
2. `New Project` 클릭
3. `Deploy from GitHub repo` 선택
4. 방금 생성한 GitHub 저장소 선택
5. Railway가 `railway.json`을 자동으로 인식하여 빌드 시작

> 빌드 완료까지 약 2~3분 소요됩니다.

### 1-3. 도메인 확인

- Railway 대시보드 → 프로젝트 클릭 → `Settings` → `Networking` → `Generate Domain`
- 생성된 URL (예: `https://hr-eval-xxxx.railway.app`)로 접속 확인

---

## 2. Railway 환경변수 설정

Supabase를 연결하려면 Railway에 환경변수를 등록해야 합니다.

1. Railway 대시보드 → 프로젝트 → 서비스 클릭
2. 상단 탭에서 `Variables` 클릭
3. 아래 두 변수를 추가:

| 변수명 | 값 | 위치 |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | `eyJh...` | Supabase → Project Settings → API → anon public |

4. 변수 저장 후 Railway가 자동으로 **재빌드/재배포** 진행

> 환경변수가 없으면 앱은 **테스트 모드(Mock Data)**로 동작합니다.
> 로그인 계정: `eval1` / `123`, `admin` / `admin`

---

## 3. Supabase 데이터베이스 초기 세팅

Supabase SQL Editor에서 아래 쿼리를 실행하세요.

### 3-1. evaluators 테이블 (평가위원 계정)

```sql
CREATE TABLE evaluators (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'evaluator'
);

-- 초기 계정 예시
INSERT INTO evaluators (id, name, password, role) VALUES
  ('eval1', '홍길동', '비밀번호1', 'evaluator'),
  ('eval2', '김평가', '비밀번호2', 'evaluator'),
  ('eval3', '이심사', '비밀번호3', 'evaluator'),
  ('admin', '관리자', '관리자비밀번호', 'admin');
```

### 3-2. evaluations 테이블 (평가 데이터)

```sql
CREATE TABLE evaluations (
  id BIGSERIAL PRIMARY KEY,
  applicant_id TEXT NOT NULL,
  evaluator_id TEXT NOT NULL,
  scores JSONB NOT NULL,
  total INTEGER NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  comment TEXT,
  UNIQUE (applicant_id, evaluator_id)
);
```

### 3-3. Row Level Security (RLS) 설정

```sql
-- evaluators 테이블: 읽기 허용
ALTER TABLE evaluators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_read" ON evaluators FOR SELECT USING (true);

-- evaluations 테이블: 읽기/쓰기 허용
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON evaluations USING (true) WITH CHECK (true);
```

---

## 4. 지원자 파일 추가/변경 방법

지원자 PDF는 **Google Drive**에 올려두고, 파일 ID를 코드에 등록합니다.

### 4-1. Google Drive에 PDF 업로드

1. Google Drive에 로그인
2. 지원자 PDF 파일 업로드
3. 파일 우클릭 → `공유` → `링크가 있는 모든 사용자` 로 권한 변경 (뷰어)
4. 파일 URL에서 ID 복사:
   - URL 형식: `https://drive.google.com/file/d/[파일ID]/view`
   - 파일 ID 예시: `1A79zCGrFTC9Xt1niLVv8oYgSVfDNppvX`

### 4-2. 코드에 파일 등록

[services/apiService.ts](services/apiService.ts) 파일의 `DRIVE_FILES` 배열을 수정합니다:

```typescript
const DRIVE_FILES = [
  { filename: "01. 홍길동.pdf", id: "구글드라이브파일ID" },
  { filename: "02. 김지원.pdf", id: "구글드라이브파일ID" },
  // 추가할 지원자...
];
```

- `filename`: 화면에 표시될 파일명 (형식: `번호. 이름.pdf`)
- `id`: Google Drive 파일 ID

수정 후 Git 커밋 & 푸시하면 Railway가 자동으로 재배포합니다.

---

## 5. 평가위원 계정 관리

### Supabase 사용 시 (권장)

Supabase 대시보드 → `Table Editor` → `evaluators` 테이블에서 직접 행을 추가/수정/삭제합니다.

| 컬럼 | 설명 |
|---|---|
| `id` | 로그인 아이디 (영문, 숫자) |
| `name` | 화면에 표시될 이름 |
| `password` | 로그인 비밀번호 (평문 저장) |
| `role` | `evaluator` 또는 `admin` |

### 테스트 모드(Mock Data) 사용 시

[services/apiService.ts](services/apiService.ts)의 `MOCK_EVALUATORS` 배열을 직접 수정합니다.

---

## 6. 코드 수정 후 재배포

Railway는 GitHub main 브랜치에 푸시하면 **자동으로 재배포**됩니다.

```bash
# 코드 수정 후
git add .
git commit -m "변경 내용 설명"
git push origin main
```

Railway 대시보드의 `Deployments` 탭에서 빌드 진행 상황을 확인할 수 있습니다.

---

## 7. 문제 해결

### 로그인 안 됨 (Supabase 연결 오류)
- Railway `Variables` 탭에서 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 값 재확인
- Supabase 대시보드에서 해당 프로젝트가 활성(Active) 상태인지 확인
- 환경변수 수정 후 Railway에서 `Redeploy` 버튼 클릭

### PDF가 표시되지 않음
- Google Drive 파일 공유 설정이 "링크가 있는 모든 사용자 - 뷰어"인지 확인
- `apiService.ts`의 파일 ID가 정확한지 확인

### 평가 데이터가 저장되지 않음
- Supabase `evaluations` 테이블이 생성되어 있는지 확인
- RLS(Row Level Security) 정책이 올바르게 설정되어 있는지 확인
- Supabase 대시보드 → `Logs` → `API` 탭에서 오류 메시지 확인

### Railway 빌드 실패
- Railway 대시보드 → 해당 Deploy 클릭 → `Build Logs` 확인
- `node_modules` 관련 오류 시 `package.json`의 의존성 버전 확인
