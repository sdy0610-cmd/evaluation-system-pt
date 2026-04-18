-- =============================================
-- 창업중심대학 참여기업 선발 시스템 DB 스키마
-- Supabase > SQL Editor 에서 실행하세요
-- =============================================

-- 1. 분과
CREATE TABLE IF NOT EXISTS startup_divisions (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  year           INTEGER NOT NULL,
  division_label TEXT NOT NULL,   -- 'A', 'B', 'C', 'D' 또는 '정보통신1' 등
  division_name  TEXT NOT NULL,   -- '정보·통신', '기계·소재 / 에너지·자원'
  chair_name     TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(year, division_label)
);

-- 2. 전문기술분야 (분과 내 복수 가능)
CREATE TABLE IF NOT EXISTS startup_tech_fields (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  year        INTEGER NOT NULL,
  division_id UUID REFERENCES startup_divisions(id) ON DELETE CASCADE,
  field_name  TEXT NOT NULL,
  UNIQUE(year, field_name)
);

-- 3. 평가위원
CREATE TABLE IF NOT EXISTS startup_evaluators (
  id              TEXT PRIMARY KEY,
  year            INTEGER NOT NULL DEFAULT 2025,
  name            TEXT NOT NULL,
  password        TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'evaluator', -- 'evaluator' | 'admin'
  division_id     UUID REFERENCES startup_divisions(id),
  evaluator_order INTEGER,   -- 1~5, 분과 내 위원 순서
  email           TEXT,
  phone           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 기본 관리자 계정 (최초 1회)
INSERT INTO startup_evaluators (id, year, name, password, role)
VALUES ('admin', 2025, '관리자', 'admin123', 'admin')
ON CONFLICT (id) DO NOTHING;

-- 4. 지원기업
CREATE TABLE IF NOT EXISTS startup_companies (
  project_no          TEXT PRIMARY KEY,
  year                INTEGER NOT NULL,
  representative      TEXT NOT NULL DEFAULT '',
  birth_info          TEXT,
  gender              TEXT,
  age_group           TEXT,        -- '청년' | '중장년'
  startup_stage       TEXT,        -- '예비' | '초기' | '도약'
  recruit_type        TEXT,        -- '①권역 내 일반형' 등
  region              TEXT,
  support_field       TEXT,        -- '제조' | '지식서비스'
  tech_field          TEXT NOT NULL DEFAULT '',
  ict_sub_field       TEXT,        -- SW, 제조 등 (정보통신 한정)
  division_id         UUID REFERENCES startup_divisions(id),
  revenue             BIGINT,
  employees           INTEGER,
  contact_phone       TEXT,
  contact_mobile      TEXT,
  email               TEXT,
  login_id            TEXT,
  address             TEXT,
  project_title       TEXT NOT NULL DEFAULT '',
  is_legend           BOOLEAN DEFAULT FALSE,
  is_excluded         BOOLEAN DEFAULT FALSE,
  exclusion_reason    TEXT,
  is_doc_exempt       BOOLEAN DEFAULT FALSE,
  doc_exempt_reason   TEXT,
  employment_target   INTEGER,
  revenue_target      BIGINT,
  investment_target   BIGINT,
  requirement_check   TEXT,
  eval_date           TEXT,
  notes               TEXT,
  stage               TEXT DEFAULT '서류',   -- '서류' | '발표' | '완료'
  result              TEXT,                  -- '통과' | '예비' | '탈락'
  file_path           TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 가점
CREATE TABLE IF NOT EXISTS startup_bonus_points (
  id          BIGSERIAL PRIMARY KEY,
  company_id  TEXT REFERENCES startup_companies(project_no) ON DELETE CASCADE,
  year        INTEGER NOT NULL,
  bonus_type  TEXT NOT NULL,   -- '가점1' | '가점2' | '가점3'
  reason      TEXT,
  points      NUMERIC(5,2) DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, bonus_type)
);

-- 6. 평가 결과
CREATE TABLE IF NOT EXISTS startup_evaluations (
  id                 BIGSERIAL PRIMARY KEY,
  company_id         TEXT REFERENCES startup_companies(project_no) ON DELETE CASCADE,
  evaluator_id       TEXT REFERENCES startup_evaluators(id),
  evaluation_type    TEXT NOT NULL,        -- '서류' | '발표'
  score              NUMERIC(5,2),         -- 0~100점
  comment            TEXT,                 -- 평가의견 (자유서술)
  is_knockout        BOOLEAN DEFAULT FALSE,
  adjusted_score     NUMERIC(5,2),         -- 관리자 수정 점수
  adjusted_by        TEXT,
  adjusted_at        TIMESTAMPTZ,
  adjustment_reason  TEXT,
  is_confirmed       BOOLEAN DEFAULT FALSE,
  confirmed_at       TIMESTAMPTZ,
  submitted_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, evaluator_id, evaluation_type)
);

-- =============================================
-- Storage 버킷: Supabase Dashboard > Storage 에서 수동 생성
-- 버킷명: startup-companies (Public 버킷으로 설정)
-- PDF 파일명 형식: {과제번호}.pdf  예) 20318135.pdf
-- =============================================

-- RLS 비활성화 (내부 관리자 전용 시스템)
ALTER TABLE startup_divisions    DISABLE ROW LEVEL SECURITY;
ALTER TABLE startup_tech_fields  DISABLE ROW LEVEL SECURITY;
ALTER TABLE startup_evaluators   DISABLE ROW LEVEL SECURITY;
ALTER TABLE startup_companies    DISABLE ROW LEVEL SECURITY;
ALTER TABLE startup_bonus_points DISABLE ROW LEVEL SECURITY;
ALTER TABLE startup_evaluations  DISABLE ROW LEVEL SECURITY;
