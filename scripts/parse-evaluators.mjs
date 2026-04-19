import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, '..', '평가위원_샘플.xlsx');

const wb = XLSX.readFile(file);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

console.log('=== 헤더 ===');
console.log(JSON.stringify(rows[0]));
console.log('\n=== 첫 5행 ===');
rows.slice(1, 6).forEach((r, i) => console.log(`Row ${i+2}:`, JSON.stringify(r)));
console.log('\n전체 행 수:', rows.length);
