const XLSX = require('xlsx');
const wb = XLSX.readFile('기업명단_샘플.xlsx');
const ws = wb.Sheets['대상'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
console.log('헤더:', JSON.stringify(rows[0]));
rows.slice(1, 4).forEach((r, i) => console.log('Row'+(i+2)+':', JSON.stringify(r)));
console.log('전체 행수:', rows.length);

// 분과 관련 컬럼 찾기
const hdr = rows[0];
hdr.forEach((h, i) => { if (h) console.log(`  [${i}] ${h}`); });
