/**
 * 2026년 프로덕션 시드:
 *   1) 누락된 IT-6/7/8 분과 추가
 *   2) 기업 220건 업서트 (서류평가 결과_260409_최종.xlsx → '발표평가 대상자 전체 명단' 시트)
 *   3) 평가위원 82명 업서트 (발표평가 위원 배정_기존 양식.xlsx)
 *
 * 실행: node scripts/seed-production-2026.mjs
 */

import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PT_ROOT = path.join(__dirname, '..');

const SUPABASE_URL = 'https://ednggeibiexrzvuoimjg.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkbmdnZWliaWV4cnp2dW9pbWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MDMyNDYsImV4cCI6MjA5MTM3OTI0Nn0.qRqcM7JsgnjQeAlXtYd5unbVQwV8Ezl5KONB2Gf4JBg';

const YEAR = 2026;

const authHeaders = () => ({
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
});

async function sb(method, pathAndQuery, body, prefer = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      ...authHeaders(),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

// ───────────────────────────────────────────────────────────
// 정규화 헬퍼 (중점/공백/하이픈 제거)
// ───────────────────────────────────────────────────────────
const norm = s => String(s || '').replace(/[\s·ㆍ・\-_]/g, '').toLowerCase();

// ───────────────────────────────────────────────────────────
// 1) IT-6, IT-7, IT-8 분과 추가 (이미 있으면 merge)
// ───────────────────────────────────────────────────────────
async function ensureExtraDivisions() {
  console.log('\n━━━ [1/3] 분과 추가 (IT-6, IT-7, IT-8) ━━━');
  const extra = [
    { division_label: 'IT-6', division_name: '정보·통신 6', support_type: '지역기반' },
    { division_label: 'IT-7', division_name: '정보·통신 7', support_type: '지역기반' },
    { division_label: 'IT-8', division_name: '정보·통신 8', support_type: '대학발' },
  ];
  for (const d of extra) {
    await sb(
      'POST',
      'startup_divisions?on_conflict=year,division_label',
      { ...d, year: YEAR, score_method: '최고최저제외' },
      'resolution=merge-duplicates,return=representation'
    );
    console.log(`   ✅ ${d.division_label} ${d.division_name}`);
  }
}

async function loadDivisionMap() {
  const list = await sb('GET', `startup_divisions?year=eq.${YEAR}&select=id,division_label,division_name`);
  // label/name 정규화 → id 매핑
  const map = new Map();
  list.forEach(d => {
    map.set(norm(d.division_label), d.id);
    map.set(norm(d.division_name), d.id);
  });
  return { list, map };
}

// ───────────────────────────────────────────────────────────
// 2) 기업 명단 업서트
// ───────────────────────────────────────────────────────────
// '정보ㆍ통신1' → IT-1 / '바이오ㆍ의료ㆍ생명2' → BM-2 ... 매핑용 보조
const DIV_LABEL_FROM_NAME = {
  '정보통신1': 'IT-1', '정보통신2': 'IT-2', '정보통신3': 'IT-3', '정보통신4': 'IT-4',
  '정보통신5': 'IT-5', '정보통신6': 'IT-6', '정보통신7': 'IT-7', '정보통신8': 'IT-8',
  '전기전자': 'EE-1',
  '기계소재': 'MM-1',
  '화공섬유': 'CT-1',
  '공예디자인': 'CD-1',
  '바이오의료생명1': 'BM-1', '바이오의료생명2': 'BM-2',
  '에너지자원': 'ER-1',
};

function normalizeRecruitType(raw) {
  const s = String(raw || '').replace(/\s+/g, '');
  if (!s) return null;
  if (s.includes('지역')) return '지역기반';
  if (s.includes('대학')) return '대학발';
  if (s.includes('실험') || s.includes('실특')) return '실험실';
  return null;
}

function normalizeAgeGroup(raw) {
  const s = String(raw || '').trim();
  if (s.includes('청년')) return '청년';
  if (s.includes('중장년') || s.includes('장년')) return '중장년';
  return null;
}

async function seedCompanies(divMap) {
  console.log('\n━━━ [2/3] 기업 업서트 ━━━');
  const src = path.join(PT_ROOT, '2026년 창업중심대학 서류평가 결과_260409_최종.xlsx');
  const wb = XLSX.read(fs.readFileSync(src), { type: 'buffer' });
  const sheet = wb.Sheets['발표평가 대상자 전체 명단'];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // header: 과제번호, 대표자명, 이메일, 특이사항, 과제명, 공고구분, 사전검토, 청/중장년,
  //         전문기술분야, 분과, 순위, 위원1..5, 평점, 점수, 과락, 평가의견
  const companies = [];
  const unmapped = new Set();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const projectNo = String(r[0] || '').trim();
    if (!projectNo) continue;

    const divNameRaw = String(r[9] || '').trim();
    const divKey = norm(divNameRaw);
    // 먼저 직접 정규화 매칭, 그다음 보조 테이블 → label
    let divisionId = divMap.get(divKey) || null;
    if (!divisionId) {
      const labelFromName = DIV_LABEL_FROM_NAME[divKey];
      if (labelFromName) divisionId = divMap.get(norm(labelFromName)) || null;
    }
    if (!divisionId) unmapped.add(divNameRaw);

    companies.push({
      project_no: projectNo,
      year: YEAR,
      representative: String(r[1] || '').trim(),
      email: String(r[2] || '').trim() || null,
      notes: String(r[3] || '').trim() || null,
      project_title: String(r[4] || '').trim(),
      recruit_type: normalizeRecruitType(r[5]),
      is_doc_exempt: String(r[6] || '').includes('면제'),
      age_group: normalizeAgeGroup(r[7]),
      tech_field: String(r[8] || '').trim(),
      division_id: divisionId,
      stage: '발표',
    });
  }

  if (unmapped.size > 0) {
    console.log(`   ⚠️ 매칭 실패 분과명: ${Array.from(unmapped).join(', ')}`);
  }
  console.log(`   총 ${companies.length}건 — 업서트 중...`);

  // 50건씩 배치 업서트
  const BATCH = 50;
  let ok = 0;
  for (let i = 0; i < companies.length; i += BATCH) {
    const chunk = companies.slice(i, i + BATCH);
    await sb(
      'POST',
      'startup_companies?on_conflict=project_no',
      chunk,
      'resolution=merge-duplicates,return=minimal'
    );
    ok += chunk.length;
    process.stdout.write(`\r   진행: ${ok} / ${companies.length}`);
  }
  console.log(`\n   ✅ 기업 ${ok}건 업서트 완료`);

  // 분과별 집계 출력
  const cnt = {};
  companies.forEach(c => {
    const key = c.division_id || '(미매칭)';
    cnt[key] = (cnt[key] || 0) + 1;
  });
  console.log('\n   분과별 분포:');
  // id → label 역맵
  const idToLabel = new Map();
  (await sb('GET', `startup_divisions?year=eq.${YEAR}&select=id,division_label`))
    .forEach(d => idToLabel.set(d.id, d.division_label));
  Object.entries(cnt)
    .map(([id, n]) => [idToLabel.get(id) || id, n])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .forEach(([lbl, n]) => console.log(`      ${String(lbl).padEnd(10)} ${n}건`));
}

// ───────────────────────────────────────────────────────────
// 3) 평가위원 82명 업서트
// ───────────────────────────────────────────────────────────
const DIVISION_MAP_SRC = {
  '정보통신1': { code: 'IT', idx: 1 }, '정보통신2': { code: 'IT', idx: 2 },
  '정보통신3': { code: 'IT', idx: 3 }, '정보통신4': { code: 'IT', idx: 4 },
  '정보통신5': { code: 'IT', idx: 5 },
  '전기전자': { code: 'EE', idx: 1 }, '기계소재': { code: 'MM', idx: 1 },
  '화공섬유': { code: 'CT', idx: 1 }, '공예디자인': { code: 'CD', idx: 1 },
  '바이오의료생명1': { code: 'BM', idx: 1 }, '바이오의료생명2': { code: 'BM', idx: 2 },
  '에너지자원': { code: 'ER', idx: 1 },
};

function parseEvaluators() {
  const src = path.join(PT_ROOT, '발표평가 위원 배정_기존 양식.xlsx');
  const wb = XLSX.read(fs.readFileSync(src), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });

  const sections = [];
  for (let i = 0; i < rows.length; i++) {
    const key = norm(rows[i][0]);
    if (DIVISION_MAP_SRC[key]) {
      sections.push({
        startRow: i,
        ...DIVISION_MAP_SRC[key],
        label: `${DIVISION_MAP_SRC[key].code}-${DIVISION_MAP_SRC[key].idx}`,
      });
    }
  }
  for (let s = 0; s < sections.length; s++) {
    sections[s].endRow = (s + 1 < sections.length) ? sections[s + 1].startRow - 1 : rows.length - 1;
  }
  const out = [];
  sections.forEach(sec => {
    let order = 0;
    for (let r = sec.startRow; r <= sec.endRow; r++) {
      const row = rows[r];
      const name = String(row[4] || '').trim();
      if (!name) continue;
      order += 1;
      out.push({
        id: `eval_${sec.code}_${sec.idx}_${order}`,
        name,
        password: '1234',
        role: 'evaluator',
        affiliation: String(row[2] || '').trim() || null,
        divisionLabel: sec.label,
        evaluator_order: order,
        email: String(row[11] || '').trim() || null,
        phone: String(row[12] || '').trim() || null,
      });
    }
  });
  return out;
}

async function seedEvaluators(divMap) {
  console.log('\n━━━ [3/3] 평가위원 업서트 ━━━');
  const evs = parseEvaluators();
  const payload = evs.map(e => ({
    id: e.id,
    year: YEAR,
    name: e.name,
    password: e.password,
    role: e.role,
    affiliation: e.affiliation,
    division_id: divMap.get(norm(e.divisionLabel)) || null,
    evaluator_order: e.evaluator_order,
    email: e.email,
    phone: e.phone,
  }));

  const missing = payload.filter(p => !p.division_id);
  if (missing.length) {
    console.log(`   ⚠️ 분과 ID 매칭 실패 ${missing.length}건`);
  }
  console.log(`   총 ${payload.length}명 — 업서트 중...`);

  const BATCH = 25;
  let ok = 0;
  for (let i = 0; i < payload.length; i += BATCH) {
    const chunk = payload.slice(i, i + BATCH);
    await sb(
      'POST',
      'startup_evaluators?on_conflict=id',
      chunk,
      'resolution=merge-duplicates,return=minimal'
    );
    ok += chunk.length;
    process.stdout.write(`\r   진행: ${ok} / ${payload.length}`);
  }
  console.log(`\n   ✅ 평가위원 ${ok}명 업서트 완료`);

  // 분과별 집계
  const cnt = {};
  payload.forEach(e => {
    cnt[e.division_id || '(미매칭)'] = (cnt[e.division_id || '(미매칭)'] || 0) + 1;
  });
  const idToLabel = new Map();
  (await sb('GET', `startup_divisions?year=eq.${YEAR}&select=id,division_label`))
    .forEach(d => idToLabel.set(d.id, d.division_label));
  console.log('\n   분과별 인원:');
  Object.entries(cnt)
    .map(([id, n]) => [idToLabel.get(id) || id, n])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .forEach(([lbl, n]) => console.log(`      ${String(lbl).padEnd(10)} ${n}명`));
}

// ───────────────────────────────────────────────────────────
// main
// ───────────────────────────────────────────────────────────
(async () => {
  try {
    await ensureExtraDivisions();
    const { map: divMap } = await loadDivisionMap();
    await seedCompanies(divMap);
    await seedEvaluators(divMap);
    console.log('\n✅ 전체 시드 완료');
  } catch (e) {
    console.error('\n❌ 에러:', e.message);
    process.exit(1);
  }
})();
