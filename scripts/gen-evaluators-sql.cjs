const XLSX = require('xlsx');
const fs = require('fs');

const wb = XLSX.readFile('평가위원_샘플.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

const headers = rows[0];
const idxOf = (name) => headers.indexOf(name);

const iId = idxOf('아이디');
const iName = idxOf('이름');
const iPw = idxOf('비밀번호');
const iDiv = idxOf('분과라벨');
const iOrd = idxOf('위원순서');
const iEmail = idxOf('이메일');
const iPhone = idxOf('연락처');

const values = [];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || !r[iId]) continue;
  const id = String(r[iId]).trim();
  // 안내 행 제외
  if (id.startsWith('[') || !r[iName]) continue;
  const name = String(r[iName]).trim().replace(/'/g, "''");
  if (!name) continue;
  const pw = String(r[iPw] || '1234').trim().replace(/'/g, "''");
  const divLabel = String(r[iDiv] || '').trim();
  const ord = r[iOrd] ? Number(r[iOrd]) : null;
  const email = r[iEmail] ? String(r[iEmail]).trim().replace(/'/g, "''") : null;
  const phone = r[iPhone] ? String(r[iPhone]).trim().replace(/'/g, "''") : null;

  values.push(
    `('${id.replace(/'/g,"''")}', 2026, '${name}', '${pw}', 'evaluator', ` +
    `(SELECT id FROM startup_divisions WHERE year=2026 AND division_label='${divLabel}' LIMIT 1), ` +
    `${ord !== null ? ord : 'NULL'}, ` +
    `${email ? `'${email}'` : 'NULL'}, ` +
    `${phone ? `'${phone}'` : 'NULL'})`
  );
}

const sql = `-- 평가위원 ${values.length}명 INSERT\n` +
  `INSERT INTO startup_evaluators (id, year, name, password, role, division_id, evaluator_order, email, phone) VALUES\n` +
  values.join(',\n') + '\n' +
  `ON CONFLICT (id) DO UPDATE SET\n` +
  `  name = EXCLUDED.name, password = EXCLUDED.password,\n` +
  `  division_id = EXCLUDED.division_id, evaluator_order = EXCLUDED.evaluator_order,\n` +
  `  email = EXCLUDED.email, phone = EXCLUDED.phone;`;

fs.writeFileSync('scripts/insert-evaluators.sql', sql, 'utf8');
console.log(`✅ ${values.length}명 SQL 생성 완료 → scripts/insert-evaluators.sql`);
