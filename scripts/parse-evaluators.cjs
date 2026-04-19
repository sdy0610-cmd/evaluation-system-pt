const XLSX = require('xlsx');
const wb = XLSX.readFile('평가위원_샘플.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
console.log('헤더:', JSON.stringify(rows[0]));
rows.slice(1, 10).forEach((r, i) => console.log('Row'+(i+2)+':', JSON.stringify(r)));
console.log('전체 행수:', rows.length);
