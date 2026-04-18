const URL_ = 'https://ednggeibiexrzvuoimjg.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkbmdnZWliaWV4cnp2dW9pbWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MDMyNDYsImV4cCI6MjA5MTM3OTI0Nn0.qRqcM7JsgnjQeAlXtYd5unbVQwV8Ezl5KONB2Gf4JBg';

const h = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// 1) 전체 역할 분포
const all = await (await fetch(
  `${URL_}/rest/v1/startup_evaluators?year=eq.2026&select=id,name,role`,
  { headers: h }
)).json();

const byRole = {};
all.forEach(r => { byRole[r.role] = (byRole[r.role] || 0) + 1; });
console.log('2026 역할 분포:', byRole);
console.log('총 인원:', all.length);

// 2) admin 전용
const admins = await (await fetch(
  `${URL_}/rest/v1/startup_evaluators?year=eq.2026&role=eq.admin&select=id,name,password,role,affiliation`,
  { headers: h }
)).json();
console.log('\nadmin 계정:', admins);

// 3) year 무관하게 admin 전체
const allAdmins = await (await fetch(
  `${URL_}/rest/v1/startup_evaluators?role=eq.admin&select=id,name,password,role,year`,
  { headers: h }
)).json();
console.log('\n전체 연도 admin:', allAdmins);
