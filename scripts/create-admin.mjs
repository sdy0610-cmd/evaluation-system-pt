/**
 * 관리자 계정 1건 생성 (id=admin, role=admin)
 * 이미 있으면 비밀번호만 갱신 (upsert).
 */
const URL_ = 'https://ednggeibiexrzvuoimjg.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkbmdnZWliaWV4cnp2dW9pbWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MDMyNDYsImV4cCI6MjA5MTM3OTI0Nn0.qRqcM7JsgnjQeAlXtYd5unbVQwV8Ezl5KONB2Gf4JBg';

const row = {
  id: 'admin',
  year: 2026,
  name: '관리자',
  password: 'skku5651',
  role: 'admin',
};

const res = await fetch(`${URL_}/rest/v1/startup_evaluators?on_conflict=id`, {
  method: 'POST',
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=representation',
  },
  body: JSON.stringify(row),
});
const text = await res.text();
if (!res.ok) {
  console.error('❌', res.status, text);
  process.exit(1);
}
console.log('✅ 업서트 결과:', text);

// 검증
const verify = await (await fetch(
  `${URL_}/rest/v1/startup_evaluators?id=eq.admin&select=id,name,role,year,password`,
  { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }
)).json();
console.log('🔍 현재 DB 상태:', verify);
