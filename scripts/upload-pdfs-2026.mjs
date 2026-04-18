/**
 * candidates companies/ 폴더의 PDF 219개를 Supabase Storage 에 업로드하고
 * 각 기업 레코드의 file_path 를 갱신한다.
 *
 * 파일명 규칙: {과제번호}_{대표자}_사업계획서.pdf
 * 업로드 이름: {과제번호}.pdf
 *
 * 사전 조건: SUPABASE_SERVICE_ROLE 환경변수 설정
 * 실행: SUPABASE_SERVICE_ROLE=xxx node scripts/upload-pdfs-2026.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PT_ROOT = path.join(__dirname, '..');
const PDF_DIR = path.join(PT_ROOT, 'candidates companies');

const SUPABASE_URL = 'https://ednggeibiexrzvuoimjg.supabase.co';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const BUCKET = 'startup-companies';
const YEAR = 2026;

if (!SERVICE_ROLE) {
  console.error('❌ SUPABASE_SERVICE_ROLE 환경변수가 필요합니다.');
  process.exit(1);
}

const authHeaders = (extra = {}) => ({
  apikey: SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
  ...extra,
});

// ───────────────────────────────────────────────────────────
// 1) PDF 파일 목록 수집 & project_no 추출
// ───────────────────────────────────────────────────────────
const files = fs.readdirSync(PDF_DIR).filter(f => f.toLowerCase().endsWith('.pdf'));
console.log(`📂 발견된 PDF: ${files.length}개`);

const items = files.map(f => {
  const m = f.match(/^(\d+)_/);
  return { file: f, projectNo: m ? m[1] : null };
}).filter(i => i.projectNo);

console.log(`🔢 과제번호 파싱 성공: ${items.length}개\n`);

// ───────────────────────────────────────────────────────────
// 2) 이미 업로드된 파일 스킵 (HEAD 요청)
// ───────────────────────────────────────────────────────────
async function existsInStorage(key) {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/info/${BUCKET}/${key}`,
    { headers: authHeaders() }
  );
  return res.ok;
}

// ───────────────────────────────────────────────────────────
// 3) 업로드
// ───────────────────────────────────────────────────────────
async function uploadFile(localPath, storageKey) {
  const body = fs.readFileSync(localPath);
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storageKey}`,
    {
      method: 'POST',
      headers: authHeaders({
        'Content-Type': 'application/pdf',
        'x-upsert': 'true',
      }),
      body,
    }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

// ───────────────────────────────────────────────────────────
// 4) DB file_path 업데이트 (단일)
// ───────────────────────────────────────────────────────────
async function updateFilePath(projectNo, key) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/startup_companies?project_no=eq.${projectNo}&year=eq.${YEAR}`,
    {
      method: 'PATCH',
      headers: authHeaders({
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      }),
      body: JSON.stringify({ file_path: key }),
    }
  );
  if (!res.ok) throw new Error(`PATCH ${projectNo}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

// ───────────────────────────────────────────────────────────
// main
// ───────────────────────────────────────────────────────────
(async () => {
  let uploaded = 0, skipped = 0, failed = 0;
  const dbPatches = [];

  for (let i = 0; i < items.length; i++) {
    const { file, projectNo } = items[i];
    const storageKey = `${projectNo}.pdf`;
    const localPath = path.join(PDF_DIR, file);
    const sizeKB = Math.round(fs.statSync(localPath).size / 1024);

    try {
      // 이미 있으면 스킵 (but still update DB)
      const exists = await existsInStorage(storageKey);
      if (exists) {
        skipped++;
        process.stdout.write(`\r[${i + 1}/${items.length}] ⏭  ${storageKey} (${sizeKB}KB) 이미 존재                    `);
      } else {
        await uploadFile(localPath, storageKey);
        uploaded++;
        process.stdout.write(`\r[${i + 1}/${items.length}] ⬆  ${storageKey} (${sizeKB}KB) 업로드                      `);
      }
      dbPatches.push({ projectNo, key: storageKey });
    } catch (e) {
      failed++;
      console.log(`\n   ❌ ${file}: ${e.message}`);
    }
  }

  console.log(`\n\n📊 업로드 결과: ⬆ ${uploaded}건 / ⏭ 스킵 ${skipped}건 / ❌ 실패 ${failed}건`);
  console.log(`\n💾 DB file_path 업데이트 중... (${dbPatches.length}건)`);

  let dbOk = 0, dbFail = 0;
  for (let i = 0; i < dbPatches.length; i++) {
    const p = dbPatches[i];
    try {
      await updateFilePath(p.projectNo, p.key);
      dbOk++;
      process.stdout.write(`\r   [${i + 1}/${dbPatches.length}] ${p.projectNo} ✓   `);
    } catch (e) {
      dbFail++;
      console.log(`\n   ❌ ${p.projectNo}: ${e.message}`);
    }
  }
  console.log(`\n\n✅ DB 업데이트 완료: ${dbOk}건 / 실패 ${dbFail}건`);

  // 검증: file_path 가 설정된 기업 수 확인
  const verify = await fetch(
    `${SUPABASE_URL}/rest/v1/startup_companies?year=eq.${YEAR}&file_path=not.is.null&select=project_no`,
    { headers: authHeaders() }
  );
  const rows = await verify.json();
  console.log(`\n🔍 현재 file_path 가 설정된 기업: ${rows.length}개 / 전체 219개`);
})();
