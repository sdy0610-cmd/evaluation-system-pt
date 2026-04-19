const XLSX = require('xlsx');
const fs = require('fs');

const wb = XLSX.readFile('기업명단_샘플.xlsx');
const ws = wb.Sheets['대상'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

const hdr = rows[0];
const iNo = hdr.indexOf('과제번호');
const iDiv = hdr.indexOf('분과');

// 분과값 고유 목록
const divSet = new Set();
rows.slice(1).forEach(r => { if (r[iDiv]) divSet.add(r[iDiv]); });
console.log('분과 고유값:', [...divSet]);

// 분과 매핑 (Excel 분과명 → DB division_label)
const DIV_MAP = {
  '공예ㆍ디자인-1': 'CD-1',
  '기계ㆍ소재-1': 'MM-1',
  '바이오ㆍ의료ㆍ생명-1': 'BM-1',
  '바이오ㆍ의료ㆍ생명-2': 'BM-2',
  '바이오ㆍ의료ㆍ생명-3': 'BM-3',
  '바이오ㆍ의료ㆍ생명-4': 'BM-4',
  '에너지ㆍ자원-1': 'ER-1',
  '전기ㆍ전자-1': 'EE-1',
  '정보ㆍ통신-1': 'IT-1',
  '정보ㆍ통신-2': 'IT-2',
  '정보ㆍ통신-3': 'IT-3',
  '정보ㆍ통신-4': 'IT-4',
  '정보ㆍ통신-5': 'IT-5',
  '정보ㆍ통신-6': 'IT-6',
  '정보ㆍ통신-7': 'IT-7',
  '정보ㆍ통신-8': 'IT-8',
  '정보ㆍ통신-9': 'IT-9',
  '화공ㆍ섬유-1': 'CT-1',
};

// SQL 생성
const lines = [];
rows.slice(1).forEach(r => {
  const projectNo = r[iNo];
  const divExcel = r[iDiv];
  if (!projectNo || !divExcel) return;
  const divLabel = DIV_MAP[divExcel];
  if (!divLabel) { console.warn('매핑 없음:', divExcel); return; }
  lines.push(
    `UPDATE startup_companies SET division_id = ` +
    `(SELECT id FROM startup_divisions WHERE year=2026 AND division_label='${divLabel}' LIMIT 1) ` +
    `WHERE year=2026 AND project_no='${String(projectNo).trim()}';`
  );
});

const sql = lines.join('\n');
fs.writeFileSync('scripts/update-company-divisions.sql', sql, 'utf8');
console.log(`\n✅ ${lines.length}개 기업 분과 매칭 SQL 생성 → scripts/update-company-divisions.sql`);
