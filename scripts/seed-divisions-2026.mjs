/**
 * 2026년 12개 분과를 Supabase (프로덕션) 에 업서트한다.
 * 기준 파일: 분과구성_2026_12개.xlsx → 발표평가 위원 배정_기존 양식.xlsx 에서 추출한 12개 분과
 *
 * 실행: node scripts/seed-divisions-2026.mjs
 */

const SUPABASE_URL = 'https://ednggeibiexrzvuoimjg.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkbmdnZWliaWV4cnp2dW9pbWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MDMyNDYsImV4cCI6MjA5MTM3OTI0Nn0.qRqcM7JsgnjQeAlXtYd5unbVQwV8Ezl5KONB2Gf4JBg';

// label, name, primary support_type, chair_name
// (schema 는 support_type 단일값 — 복합 분과는 주 유형만 기록)
const DIVISIONS = [
  { division_label: 'IT-1', division_name: '정보·통신 1',      support_type: '지역기반', chair_name: null },
  { division_label: 'IT-2', division_name: '정보·통신 2',      support_type: '지역기반', chair_name: null },
  { division_label: 'IT-3', division_name: '정보·통신 3',      support_type: '지역기반', chair_name: null },
  { division_label: 'IT-4', division_name: '정보·통신 4',      support_type: '대학발',   chair_name: null },
  { division_label: 'IT-5', division_name: '정보·통신 5',      support_type: '대학발',   chair_name: null },
  { division_label: 'EE-1', division_name: '전기·전자',        support_type: '지역기반', chair_name: null },
  { division_label: 'MM-1', division_name: '기계·소재',        support_type: '지역기반', chair_name: null },
  { division_label: 'CT-1', division_name: '화공·섬유',        support_type: '지역기반', chair_name: null },
  { division_label: 'CD-1', division_name: '공예·디자인',      support_type: '지역기반', chair_name: null },
  { division_label: 'BM-1', division_name: '바이오·의료·생명 1', support_type: '지역기반', chair_name: null },
  { division_label: 'BM-2', division_name: '바이오·의료·생명 2', support_type: '대학발',   chair_name: null },
  { division_label: 'ER-1', division_name: '에너지·자원',      support_type: '지역기반', chair_name: null },
];

const YEAR = 2026;

async function upsertDivision(d) {
  const body = { ...d, year: YEAR, score_method: '최고최저제외' };
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/startup_divisions?on_conflict=year,division_label`,
    {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(body),
    }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return JSON.parse(text);
}

(async () => {
  console.log(`📌 ${DIVISIONS.length}개 분과 업서트 시작 (year=${YEAR})\n`);
  let ok = 0, fail = 0;
  for (const d of DIVISIONS) {
    try {
      const result = await upsertDivision(d);
      const row = Array.isArray(result) ? result[0] : result;
      console.log(`   ✅ ${d.division_label.padEnd(5)} ${d.division_name.padEnd(18)} [${d.support_type}]  id=${row?.id?.slice(0, 8)}…`);
      ok++;
    } catch (e) {
      console.error(`   ❌ ${d.division_label}: ${e.message}`);
      fail++;
    }
  }
  console.log(`\n완료: 성공 ${ok}건, 실패 ${fail}건`);

  // 결과 검증
  const verify = await fetch(
    `${SUPABASE_URL}/rest/v1/startup_divisions?year=eq.${YEAR}&select=division_label,division_name,support_type&order=division_label`,
    { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
  );
  const list = await verify.json();
  console.log(`\n📋 현재 ${YEAR}년도 전체 분과 (${list.length}개):`);
  list.forEach(r => console.log(`   ${r.division_label.padEnd(8)} ${String(r.division_name).padEnd(18)} [${r.support_type || '-'}]`));
})();
