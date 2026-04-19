const XLSX = require('xlsx');

// 분과구성 파일 파싱
const wb = XLSX.readFile('분과구성_2026_12개.xlsx');
console.log('시트목록:', wb.SheetNames);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
console.log('헤더:', JSON.stringify(rows[0]));
console.log('헤더2:', JSON.stringify(rows[1]));
rows.slice(0, 10).forEach((r, i) => console.log('Row'+(i+1)+':', JSON.stringify(r)));
console.log('전체 행수:', rows.length);
