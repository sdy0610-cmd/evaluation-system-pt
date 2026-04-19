const XLSX = require('xlsx');
const wb = XLSX.readFile('기업명단_템플릿_2026_sample.xlsx');
console.log('시트목록:', wb.SheetNames);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
console.log('헤더:', JSON.stringify(rows[0]));
rows.slice(1, 5).forEach((r, i) => console.log('Row'+(i+2)+':', JSON.stringify(r)));

// tech_field 고유값 확인
const hdr = rows[0];
const techIdx = hdr.indexOf('전문기술분야');
const recruitIdx = hdr.indexOf('모집공고');
const techFields = new Set();
const recruits = new Set();
rows.slice(1).forEach(r => {
  if (r[techIdx]) techFields.add(r[techIdx]);
  if (r[recruitIdx]) recruits.add(r[recruitIdx]);
});
console.log('\n전문기술분야 목록:', [...techFields]);
console.log('모집공고 목록:', [...recruits]);
