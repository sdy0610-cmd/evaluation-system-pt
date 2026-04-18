/**
 * 실제 `발표평가 위원 배정_기존 양식.xlsx`를 파싱하여
 * 샘플 Excel 파일들을 생성한다.
 *
 * 출력 파일 (pt 작업폴더 + presentation 작업폴더 양쪽):
 *   - sample-data/평가위원_샘플.xlsx
 *   - sample-data/분과구성_참고.xlsx
 * pt 작업폴더 전용:
 *   - 분과구성_2026_12개.xlsx
 *
 * 실행: node scripts/generate-real-sample-data.mjs
 */

import * as XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PT_ROOT = path.join(__dirname, '..');
const PRES_ROOT = path.join(PT_ROOT, '..', 'startup-presentation-evaluation-system');
const SOURCE = path.join(PT_ROOT, '발표평가 위원 배정_기존 양식.xlsx');

// ────────────────────────────────────────────────────────────
// 분과명 → (TECH 코드, 분과번호) 매핑
// ────────────────────────────────────────────────────────────
const DIVISION_MAP = {
  '정보통신1': { code: 'IT', idx: 1, name: '정보·통신 1' },
  '정보통신2': { code: 'IT', idx: 2, name: '정보·통신 2' },
  '정보통신3': { code: 'IT', idx: 3, name: '정보·통신 3' },
  '정보통신4': { code: 'IT', idx: 4, name: '정보·통신 4' },
  '정보통신5': { code: 'IT', idx: 5, name: '정보·통신 5' },
  '전기전자': { code: 'EE', idx: 1, name: '전기·전자' },
  '기계소재': { code: 'MM', idx: 1, name: '기계·소재' },
  '화공섬유': { code: 'CT', idx: 1, name: '화공·섬유' },
  '공예디자인': { code: 'CD', idx: 1, name: '공예·디자인' },
  '바이오의료생명1': { code: 'BM', idx: 1, name: '바이오·의료·생명 1' },
  '바이오의료생명2': { code: 'BM', idx: 2, name: '바이오·의료·생명 2' },
  '에너지자원': { code: 'ER', idx: 1, name: '에너지·자원' },
};

const normalize = s => String(s || '').replace(/\s+/g, '').replace(/[·ㆍ・]/g, '');

function parseSupportTypes(raw) {
  const s = String(raw || '');
  const types = [];
  if (s.includes('지역기반')) types.push('지역기반');
  if (s.includes('대학발')) types.push('대학발');
  if (s.includes('실험실')) types.push('실험실');
  return types;
}

// Excel 직렬 날짜 → YYYY-MM-DD (1900-01-01 기준, 윤년 버그 보정 포함)
function excelDate(v) {
  if (typeof v !== 'number' || v <= 0) return '';
  const ms = Math.round((v - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// ────────────────────────────────────────────────────────────
// 1. 원본 파일 파싱
// ────────────────────────────────────────────────────────────
console.log('📖 원본 파일 읽기:', SOURCE);
const srcBuf = fs.readFileSync(SOURCE);
const srcWb = XLSX.read(srcBuf, { type: 'buffer' });
const srcWs = srcWb.Sheets[srcWb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(srcWs, { header: 1, defval: '' });

// 헤더 행 탐색: col[0] 값이 DIVISION_MAP 키와 일치하는 행
const sections = []; // { startRow, label, code, idx, name, supportTypes }
for (let i = 0; i < rows.length; i++) {
  const key = normalize(rows[i][0]);
  if (DIVISION_MAP[key]) {
    // 다음 몇 줄에서 지원유형 괄호 라인 탐색
    let supportLine = '';
    for (let j = i + 1; j < Math.min(i + 4, rows.length); j++) {
      const c0 = String(rows[j][0] || '');
      if (c0.includes('(') && c0.includes(')')) {
        supportLine = c0;
        break;
      }
    }
    sections.push({
      startRow: i,
      dataStartRow: i, // 섹션 헤더 행 자체에 첫 번째 위원 정보가 있음
      ...DIVISION_MAP[key],
      label: `${DIVISION_MAP[key].code}-${DIVISION_MAP[key].idx}`,
      supportTypes: parseSupportTypes(supportLine),
      supportRaw: supportLine,
    });
  }
}

// 각 섹션별 데이터 범위 확정 (다음 섹션 직전까지)
for (let s = 0; s < sections.length; s++) {
  sections[s].endRow = (s + 1 < sections.length) ? sections[s + 1].startRow - 1 : rows.length - 1;
}

// 각 섹션에서 위원 추출
const allEvaluators = [];
sections.forEach(sec => {
  let order = 0;
  for (let r = sec.dataStartRow; r <= sec.endRow; r++) {
    const row = rows[r];
    const name = String(row[4] || '').trim();
    if (!name) continue; // 산업기술분류 연속 행은 스킵
    order += 1;
    allEvaluators.push({
      section: sec,
      order,
      id: `eval_${sec.code}_${sec.idx}_${order}`,
      affiliation: String(row[2] || '').trim(),
      title: String(row[3] || '').trim(),
      name,
      birth: excelDate(row[5]),
      gender: String(row[6] || '').trim(),
      kstartupId: String(row[7] || '').trim(),
      qualification: String(row[8] || '').trim(),
      techCategory: String(row[9] || '').trim(),
      youth: String(row[10] || '').trim(),
      email: String(row[11] || '').trim(),
      phone: String(row[12] || '').trim(),
      contactPerson: String(row[13] || '').trim(),
      techConfirm: String(row[14] || '').trim(),
      acceptStatus: String(row[15] || '').trim(),
      note: String(row[16] || '').trim(),
    });
  }
});

console.log(`✅ 파싱 완료: 분과 ${sections.length}개, 평가위원 ${allEvaluators.length}명`);
sections.forEach(s => {
  const n = allEvaluators.filter(e => e.section === s).length;
  console.log(`   ${s.label.padEnd(6)} ${s.name.padEnd(15)} [${s.supportTypes.join(', ') || '-'}] ${n}명`);
});

// ────────────────────────────────────────────────────────────
// 2. 평가위원_샘플.xlsx 생성
// ────────────────────────────────────────────────────────────
function buildEvaluatorWorkbook() {
  const headers = [
    '아이디', '이름', '비밀번호', '분과라벨', '분과명', '위원순서',
    '소속', '직위', '이메일', '연락처', '성별', '자격구분', '비고',
  ];
  const data = [headers];
  allEvaluators.forEach(ev => {
    data.push([
      ev.id,
      ev.name,
      '1234',
      ev.section.label,
      ev.section.name,
      ev.order,
      ev.affiliation,
      ev.title,
      ev.email,
      ev.phone,
      ev.gender,
      ev.qualification,
      ev.note,
    ]);
  });

  // 안내 행
  data.push([]);
  data.push(['[안내] 아이디 규칙: eval_{TECH}_{분과번호}_{위원순서}   예) eval_IT_1_1']);
  data.push(['[안내] TECH 코드: IT(정보·통신), MM(기계·소재), BM(바이오·의료·생명), EE(전기·전자), ER(에너지·자원), CT(화공·섬유), CD(공예·디자인), CS(문화·서비스)']);
  data.push(['[안내] 원본: 발표평가 위원 배정_기존 양식.xlsx 를 파싱하여 자동 생성됨']);

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 8 },
    { wch: 32 }, { wch: 12 }, { wch: 26 }, { wch: 16 }, { wch: 6 }, { wch: 12 }, { wch: 20 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '평가위원');
  return wb;
}

const evalWb = buildEvaluatorWorkbook();

// ────────────────────────────────────────────────────────────
// 3. 분과구성_참고.xlsx 생성 (12개 분과)
// ────────────────────────────────────────────────────────────
function buildDivisionWorkbook() {
  const headers = [
    '분과라벨', '분과명', 'TECH코드', '지원유형', '점수방식', '위원수', '비고',
  ];
  const data = [headers];
  sections.forEach(s => {
    const n = allEvaluators.filter(e => e.section === s).length;
    data.push([
      s.label,
      s.name,
      s.code,
      s.supportTypes.join(', ') || '-',
      '최고최저제외',
      n,
      s.supportRaw,
    ]);
  });
  data.push([]);
  data.push(['[안내] 분과라벨 형식: {TECH}-{분과번호}   예) IT-1, BM-2, EE-1']);
  data.push(['[안내] 지원유형: 지역기반 / 대학발 / 실험실 (복수 가능)']);
  data.push(['[안내] 점수방식: 최고최저제외(권장) - 위원 3명 이상일 때 최고·최저 1건씩 제외 후 평균']);

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 10 }, { wch: 20 }, { wch: 10 }, { wch: 24 }, { wch: 14 }, { wch: 8 }, { wch: 30 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '분과구성');

  // 관리자 계정 시트
  const adminSheet = XLSX.utils.aoa_to_sheet([
    ['아이디', '이름', '비밀번호', '역할'],
    ['admin', '관리자', 'admin1234', 'admin'],
  ]);
  XLSX.utils.book_append_sheet(wb, adminSheet, '관리자계정');
  return wb;
}

const divWb = buildDivisionWorkbook();

// ────────────────────────────────────────────────────────────
// 4. 출력
// ────────────────────────────────────────────────────────────
function writeTo(root, name, wb) {
  const outDir = path.join(root, 'sample-data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, name);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  fs.writeFileSync(out, buf);
  console.log('   →', out);
}

console.log('\n📝 평가위원_샘플.xlsx 출력:');
writeTo(PT_ROOT, '평가위원_샘플.xlsx', evalWb);
writeTo(PRES_ROOT, '평가위원_샘플.xlsx', evalWb);

console.log('\n📝 분과구성_참고.xlsx 출력:');
writeTo(PT_ROOT, '분과구성_참고.xlsx', divWb);
writeTo(PRES_ROOT, '분과구성_참고.xlsx', divWb);

// 분과구성_2026_12개.xlsx — pt 작업폴더 루트에 별도 생성
const divOut12 = path.join(PT_ROOT, '분과구성_2026_12개.xlsx');
fs.writeFileSync(divOut12, XLSX.write(divWb, { type: 'buffer', bookType: 'xlsx' }));
console.log('\n📝 분과구성_2026_12개.xlsx 출력:');
console.log('   →', divOut12);

console.log('\n✅ 완료');
