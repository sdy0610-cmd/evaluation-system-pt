import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import type { Division, TechField, Evaluator, Company, BonusPoint, Evaluation, EvalCriterion } from '../types';

// ── Score calculation ────────────────────────────────────────────────────────
// 5명 위원 중 최고점·최저점 제외 후 나머지 3점 평균
export function calculateAvgScore(scores: (number | null | undefined)[]): number {
  const valid = scores.filter((s): s is number => s !== null && s !== undefined && !isNaN(s));
  if (valid.length === 0) return 0;
  if (valid.length < 5) {
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
    return Math.round(avg * 100) / 100;
  }
  // 5인 이상: 최고점·최저점 각 1개 제외 후 나머지 평균
  const sorted = [...valid].sort((a, b) => a - b);
  const middle = sorted.slice(1, sorted.length - 1);
  const avg = middle.reduce((a, b) => a + b, 0) / middle.length;
  return Math.round(avg * 100) / 100;
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export async function login(id: string, password: string): Promise<Evaluator> {
  const { data, error } = await supabase
    .from('startup_evaluators')
    .select('*')
    .eq('id', id.trim())
    .eq('password', password)
    .single();
  if (error || !data) throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
  if (data.division_id) {
    const { data: div } = await supabase
      .from('startup_divisions')
      .select('*')
      .eq('id', data.division_id)
      .single();
    return { ...data, division: div ?? undefined } as Evaluator;
  }
  return data as Evaluator;
}

// ── Divisions ────────────────────────────────────────────────────────────────
export async function getDivisions(year: number): Promise<Division[]> {
  const { data, error } = await supabase
    .from('startup_divisions')
    .select('*')
    .eq('year', year)
    .order('division_label');
  if (error) throw error;
  return data || [];
}

export async function upsertDivision(division: Partial<Division> & { year: number }): Promise<Division> {
  const { data, error } = await supabase
    .from('startup_divisions')
    .upsert(division, { onConflict: division.id ? 'id' : 'year,division_label' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDivision(id: string): Promise<void> {
  const { error } = await supabase.from('startup_divisions').delete().eq('id', id);
  if (error) throw error;
}

// ── Tech Fields ──────────────────────────────────────────────────────────────
export async function getTechFields(year: number): Promise<TechField[]> {
  const { data, error } = await supabase
    .from('startup_tech_fields')
    .select('*')
    .eq('year', year);
  if (error) throw error;
  return data || [];
}

export async function upsertTechField(field: Partial<TechField>): Promise<TechField> {
  const { data, error } = await supabase
    .from('startup_tech_fields')
    .upsert(field, { onConflict: field.id ? 'id' : 'year,field_name' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTechField(id: string): Promise<void> {
  const { error } = await supabase.from('startup_tech_fields').delete().eq('id', id);
  if (error) throw error;
}

// ── Evaluators ───────────────────────────────────────────────────────────────
export async function getEvaluators(year: number): Promise<Evaluator[]> {
  const [evRes, divRes] = await Promise.all([
    supabase.from('startup_evaluators').select('*').eq('year', year)
      .order('division_id', { nullsFirst: true })
      .order('evaluator_order', { nullsFirst: true }),
    supabase.from('startup_divisions').select('*').eq('year', year),
  ]);
  if (evRes.error) throw evRes.error;
  const divMap: Record<string, Division> = {};
  (divRes.data || []).forEach(d => { divMap[d.id] = d; });
  return (evRes.data || []).map(e => ({
    ...e,
    password: undefined,
    division: e.division_id ? divMap[e.division_id] : undefined,
  }));
}

export async function upsertEvaluator(evaluator: Partial<Evaluator>): Promise<Evaluator> {
  const { data, error } = await supabase
    .from('startup_evaluators')
    .upsert(evaluator, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEvaluator(id: string): Promise<void> {
  const { error } = await supabase.from('startup_evaluators').delete().eq('id', id);
  if (error) throw error;
}

// ── Companies ────────────────────────────────────────────────────────────────
export async function getCompanies(year: number, divisionId?: string): Promise<Company[]> {
  let query = supabase.from('startup_companies').select('*').eq('year', year);
  if (divisionId) query = query.eq('division_id', divisionId);
  const [coRes, divRes] = await Promise.all([
    query.order('project_no'),
    supabase.from('startup_divisions').select('*').eq('year', year),
  ]);
  if (coRes.error) throw coRes.error;
  const divMap: Record<string, Division> = {};
  (divRes.data || []).forEach(d => { divMap[d.id] = d; });
  return (coRes.data || []).map(c => ({
    ...c,
    division: c.division_id ? divMap[c.division_id] : undefined,
  }));
}

export async function upsertCompany(company: Partial<Company>): Promise<Company> {
  const { division, ...rest } = company as any;
  const { data, error } = await supabase
    .from('startup_companies')
    .upsert(rest, { onConflict: 'project_no' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function bulkUpsertCompanies(companies: Partial<Company>[]): Promise<void> {
  if (companies.length === 0) return;
  const ids = companies.map(c => c.project_no).filter(Boolean) as string[];
  const { data: existing } = await supabase
    .from('startup_companies').select('project_no').in('project_no', ids);
  const existingSet = new Set((existing || []).map((e: any) => e.project_no));

  const cleaned = companies.map(({ division, ...rest }: any) => {
    if (existingSet.has(rest.project_no)) {
      const { stage, ...noStage } = rest;
      return noStage;
    }
    return rest;
  });
  for (let i = 0; i < cleaned.length; i += 100) {
    const chunk = cleaned.slice(i, i + 100);
    const { error } = await supabase
      .from('startup_companies')
      .upsert(chunk, { onConflict: 'project_no' });
    if (error) throw error;
  }
}

export async function updateCompany(projectNo: string, updates: Partial<Company>): Promise<void> {
  const { division, ...rest } = updates as any;
  const { error } = await supabase
    .from('startup_companies')
    .update(rest)
    .eq('project_no', projectNo);
  if (error) throw error;
}

// ── Bonus Points ─────────────────────────────────────────────────────────────
export async function getBonusPointsBulk(companyIds: string[]): Promise<BonusPoint[]> {
  if (companyIds.length === 0) return [];
  const { data, error } = await supabase
    .from('startup_bonus_points')
    .select('*')
    .limit(10000)
    .in('company_id', companyIds);
  if (error) throw error;
  return data || [];
}

export async function upsertBonusPoint(bp: Partial<BonusPoint>): Promise<void> {
  const { error } = await supabase
    .from('startup_bonus_points')
    .upsert(bp, { onConflict: 'company_id,bonus_type' });
  if (error) throw error;
}

// ── Evaluations ──────────────────────────────────────────────────────────────
export async function getEvaluations(params: {
  companyIds?: string[];
  evaluatorId?: string;
  type?: string;
}): Promise<Evaluation[]> {
  // Chunk large companyId lists to avoid URL length limits
  if (params.companyIds && params.companyIds.length > 200) {
    const chunks: string[][] = [];
    for (let i = 0; i < params.companyIds.length; i += 200)
      chunks.push(params.companyIds.slice(i, i + 200));
    const results = await Promise.all(chunks.map(ids => getEvaluations({ ...params, companyIds: ids })));
    return results.flat();
  }

  const PAGE_SIZE = 1000;
  let allEvs: any[] = [];
  let from = 0;
  while (true) {
    let query = supabase
      .from('startup_evaluations')
      .select('*')
      .range(from, from + PAGE_SIZE - 1);
    if (params.companyIds && params.companyIds.length > 0)
      query = query.in('company_id', params.companyIds);
    if (params.evaluatorId)
      query = query.eq('evaluator_id', params.evaluatorId);
    if (params.type)
      query = query.eq('evaluation_type', params.type);
    const { data, error } = await query;
    if (error) throw error;
    const batch = data || [];
    allEvs = allEvs.concat(batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  const evs = allEvs;
  if (evs.length === 0) return [];
  const evalIds = [...new Set(evs.map(e => e.evaluator_id))];
  const { data: evalData } = await supabase
    .from('startup_evaluators')
    .select('id, name, evaluator_order')
    .limit(1000)
    .in('id', evalIds);
  const evalMap: Record<string, { id: string; name: string; evaluator_order: number }> = {};
  (evalData || []).forEach(e => { evalMap[e.id] = e; });
  return evs.map(e => ({ ...e, evaluator: evalMap[e.evaluator_id] }));
}

export async function saveEvaluation(ev: Partial<Evaluation>): Promise<Evaluation> {
  const { evaluator, ...rest } = ev as any;
  const { data, error } = await supabase
    .from('startup_evaluations')
    .upsert(rest, { onConflict: 'company_id,evaluator_id,evaluation_type' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEvaluation(id: number): Promise<void> {
  const { error } = await supabase.from('startup_evaluations').delete().eq('id', id);
  if (error) throw error;
}

export async function adjustScore(
  id: number,
  adjustedScore: number,
  adjustedBy: string,
  reason: string
): Promise<void> {
  const { error } = await supabase
    .from('startup_evaluations')
    .update({
      adjusted_score: adjustedScore,
      adjusted_by: adjustedBy,
      adjusted_at: new Date().toISOString(),
      adjustment_reason: reason,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function toggleKnockout(id: number, isKnockout: boolean): Promise<void> {
  const { error } = await supabase
    .from('startup_evaluations')
    .update({ is_knockout: isKnockout })
    .eq('id', id);
  if (error) throw error;
}

export async function confirmEvaluations(
  companyIds: string[],
  evalType: string,
  confirmedBy: string
): Promise<void> {
  if (companyIds.length === 0) return;
  const { error } = await supabase
    .from('startup_evaluations')
    .update({ is_confirmed: true, confirmed_at: new Date().toISOString() })
    .in('company_id', companyIds)
    .eq('evaluation_type', evalType);
  if (error) throw error;
  void confirmedBy;
}

// ── Settings / Snapshot ───────────────────────────────────────────────────────
export async function resetYearEvalData(year: number): Promise<void> {
  // Delete evaluations and bonus points via company IDs
  const { data: cos } = await supabase.from('startup_companies').select('project_no').eq('year', year);
  const ids = (cos || []).map((c: any) => c.project_no);
  if (ids.length > 0) {
    await supabase.from('startup_evaluations').delete().in('company_id', ids);
    await supabase.from('startup_bonus_points').delete().in('company_id', ids);
  }
  // Delete companies, evaluators (non-admin), divisions, tech fields, criteria
  await supabase.from('startup_companies').delete().eq('year', year);
  await supabase.from('startup_evaluators').delete().eq('year', year).neq('role', 'admin');
  await supabase.from('startup_eval_criteria').delete().eq('year', year);
  const { data: divs } = await supabase.from('startup_divisions').select('id').eq('year', year);
  if (divs && divs.length > 0) {
    const divIds = divs.map((d: any) => d.id);
    await supabase.from('startup_tech_fields').delete().in('division_id', divIds);
  }
  await supabase.from('startup_divisions').delete().eq('year', year);
}

export async function exportYearEvalData(year: number): Promise<object> {
  const { data: cos } = await supabase.from('startup_companies').select('*').eq('year', year);
  const ids = (cos || []).map((c: any) => c.project_no);
  const [evRes, bpRes] = await Promise.all([
    ids.length > 0
      ? supabase.from('startup_evaluations').select('*').in('company_id', ids)
      : Promise.resolve({ data: [] }),
    supabase.from('startup_bonus_points').select('*').eq('year', year),
  ]);
  return {
    version: 1,
    year,
    exported_at: new Date().toISOString(),
    companies: cos || [],
    evaluations: (evRes as any).data || [],
    bonus_points: (bpRes as any).data || [],
  };
}

export async function importYearEvalData(data: any): Promise<void> {
  if (data.companies?.length > 0) {
    for (let i = 0; i < data.companies.length; i += 100) {
      const { error } = await supabase.from('startup_companies').upsert(data.companies.slice(i, i + 100), { onConflict: 'project_no' });
      if (error) throw error;
    }
  }
  if (data.evaluations?.length > 0) {
    for (let i = 0; i < data.evaluations.length; i += 100) {
      const { error } = await supabase.from('startup_evaluations').upsert(data.evaluations.slice(i, i + 100), { onConflict: 'company_id,evaluator_id,evaluation_type' });
      if (error) throw error;
    }
  }
  if (data.bonus_points?.length > 0) {
    for (let i = 0; i < data.bonus_points.length; i += 100) {
      const { error } = await supabase.from('startup_bonus_points').upsert(data.bonus_points.slice(i, i + 100), { onConflict: 'company_id,bonus_type' });
      if (error) throw error;
    }
  }
}

// ── Eval Criteria ─────────────────────────────────────────────────────────────
export async function getEvalCriteria(year: number, evalType: string): Promise<EvalCriterion[]> {
  const { data, error } = await supabase
    .from('startup_eval_criteria')
    .select('*')
    .eq('year', year)
    .eq('eval_type', evalType)
    .order('section_no')
    .order('sort_order');
  if (error) throw error;
  return data || [];
}

export async function upsertEvalCriterion(c: Partial<EvalCriterion>): Promise<EvalCriterion> {
  const { data, error } = await supabase
    .from('startup_eval_criteria')
    .upsert(c, { onConflict: c.id ? 'id' : 'year,eval_type,item_key' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEvalCriterion(id: number): Promise<void> {
  const { error } = await supabase.from('startup_eval_criteria').delete().eq('id', id);
  if (error) throw error;
}

// ── File Storage ─────────────────────────────────────────────────────────────
export function getFileUrl(filePath: string): string {
  if (!filePath) return '';
  if (filePath.startsWith('http')) return filePath;
  const { data } = supabase.storage.from('startup-companies').getPublicUrl(filePath);
  return data?.publicUrl || '';
}

export async function uploadCompanyDoc(file: File, companyId: string, year: number): Promise<string> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
  const safe = `${companyId}_${Date.now()}${ext ? '.' + ext : ''}`;
  const path = `${year}/docs/${companyId}/${safe}`;
  const { error } = await supabase.storage.from('startup-companies').upload(path, file, { upsert: true });
  if (error) throw new Error(`업로드 실패: ${error.message}`);
  return path;
}

export async function getCompanyFiles(companyIds: string[]): Promise<import('../types').CompanyFile[]> {
  if (!companyIds.length) return [];
  const { data, error } = await supabase
    .from('startup_company_files')
    .select('*')
    .in('company_id', companyIds)
    .order('uploaded_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function addCompanyFile(cf: Omit<import('../types').CompanyFile, 'id' | 'uploaded_at'>): Promise<import('../types').CompanyFile> {
  const { data, error } = await supabase.from('startup_company_files').insert(cf).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCompanyFile(id: number): Promise<void> {
  const { error } = await supabase.from('startup_company_files').delete().eq('id', id);
  if (error) throw error;
}

export async function listBucketFiles(): Promise<{ path: string; name: string; size: number }[]> {
  const result: { path: string; name: string; size: number }[] = [];

  async function listFolder(prefix: string) {
    const { data, error } = await supabase.storage
      .from('startup-companies')
      .list(prefix, { limit: 1000, offset: 0 });
    if (error) throw new Error(`스토리지 오류 [${prefix || 'root'}]: ${error.message}`);
    if (!data) return;
    for (const item of data) {
      const isFolder = !item.id || item.metadata == null;
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (isFolder) {
        await listFolder(fullPath);
      } else {
        result.push({ path: fullPath, name: item.name, size: item.metadata?.size || 0 });
      }
    }
  }

  await listFolder('');
  return result;
}

export async function bulkAddCompanyFiles(entries: Omit<import('../types').CompanyFile, 'id' | 'uploaded_at'>[]): Promise<void> {
  if (!entries.length) return;
  const { error } = await supabase.from('startup_company_files').upsert(entries, { onConflict: 'company_id,file_path' });
  if (error) throw error;
}

// ── Eval Templates ───────────────────────────────────────────────────────────
export async function getTemplates(type: string): Promise<import('../types').EvalTemplate[]> {
  const { data, error } = await supabase
    .from('startup_eval_templates')
    .select('*')
    .eq('type', type)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveTemplate(t: Omit<import('../types').EvalTemplate, 'id' | 'created_at'>): Promise<import('../types').EvalTemplate> {
  const { data, error } = await supabase.from('startup_eval_templates').insert(t).select().single();
  if (error) throw error;
  return data;
}

export async function deleteTemplate(id: number): Promise<void> {
  const { error } = await supabase.from('startup_eval_templates').delete().eq('id', id);
  if (error) throw error;
}

// ── Grade Settings ───────────────────────────────────────────────────────────
export async function getGradeSettings(year: number): Promise<import('../types').GradeSetting[]> {
  const { data, error } = await supabase
    .from('startup_grade_settings')
    .select('*')
    .eq('year', year)
    .order('min_score', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveGradeSettings(year: number, settings: Omit<import('../types').GradeSetting, 'id'>[]): Promise<void> {
  await supabase.from('startup_grade_settings').delete().eq('year', year);
  if (settings.length > 0) {
    const { error } = await supabase.from('startup_grade_settings').insert(
      settings.map((s, i) => ({ ...s, year, sort_order: i }))
    );
    if (error) throw error;
  }
}

export function getGradeForScore(score: number, grades: import('../types').GradeSetting[]): import('../types').GradeSetting | null {
  const sorted = [...grades].sort((a, b) => b.min_score - a.min_score);
  return sorted.find(g => score >= g.min_score) || null;
}

// ── Extra Opinion Fields ─────────────────────────────────────────────────────
export async function getExtraOpinionFields(year: number): Promise<import('../types').ExtraOpinionField[]> {
  const { data, error } = await supabase
    .from('startup_extra_opinion_fields')
    .select('*')
    .eq('year', year)
    .order('recruit_type')
    .order('sort_order');
  if (error) throw error;
  return data || [];
}

export async function upsertExtraOpinionField(field: import('../types').ExtraOpinionField): Promise<import('../types').ExtraOpinionField> {
  const payload: Record<string, unknown> = {
    year: field.year,
    recruit_type: field.recruit_type,
    field_label: field.field_label,
    sort_order: field.sort_order,
  };
  if (field.id) payload.id = field.id;
  const { data, error } = await supabase
    .from('startup_extra_opinion_fields')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteExtraOpinionField(id: number): Promise<void> {
  const { error } = await supabase.from('startup_extra_opinion_fields').delete().eq('id', id);
  if (error) throw error;
}

// ── Excel Parsing (Company Import) ───────────────────────────────────────────
const COL_MAP: Record<string, string> = {
  '과제번호': 'project_no',
  '대표자명': 'representative',
  '평가기준': 'startup_stage',
  '업력': 'startup_stage',           // 실제 업로드 양식 컬럼명
  '모집공고': 'recruit_type',
  '지원유형(모집공고)': 'recruit_type', // 실제 업로드 양식 컬럼명
  '지원유형': 'recruit_type',
  '청/중장년': 'age_group',
  '성별': 'gender',
  '이메일': 'email',
  '로그인ID': 'login_id',
  '연락처': 'contact_phone',
  '사원수(고용)': 'employees',        // 실제 업로드 양식 컬럼명
  '휴대전화': 'contact_mobile',
  '자택주소': 'address',
  '과제명': 'project_title',
  '창업지역': 'region',
  '지원분야': 'support_field',
  '전문기술분야': 'tech_field',
  '정보통신세부분야': 'ict_sub_field',
  '매출액': 'revenue',
  '사원수': 'employees',
  '요건검토': 'requirement_check',
  '비고': 'notes',
  '분과': '_div_raw',
  '분과명': '_div_raw',
  '분과라벨': '_div_label_raw',
};
const NUM_FIELDS = new Set(['revenue', 'employees', 'revenue_target', 'employment_target', 'investment_target']);

// Normalize middle-dot variants (ㆍ U+318D, · U+00B7, • U+2022, ・ U+FF65) to ·
function normDot(s: string): string {
  return s.replace(/[\u318D\u2022\uFF65]/g, '\u00B7');
}

// Helper: find division_id by name or label (case-insensitive, partial match, dot-normalized)
function resolveDivisionId(raw: string, divisions: Division[]): string | null {
  const q = normDot(raw.trim().toLowerCase());
  const norm = (s: string) => normDot(s.toLowerCase());
  // strip trailing number suffix for looser match (e.g. "공예·디자인 1" → "공예·디자인")
  const qBase = q.replace(/\s+\d+$/, '').trim();
  return (
    divisions.find(d => norm(d.division_name) === q)?.id ||
    divisions.find(d => norm(d.division_label) === q)?.id ||
    divisions.find(d => norm(d.division_name) === qBase)?.id ||
    divisions.find(d => norm(d.division_name).includes(q) || q.includes(norm(d.division_name)))?.id ||
    divisions.find(d => norm(d.division_name).includes(qBase) || qBase.includes(norm(d.division_name)))?.id ||
    null
  );
}

export async function parseCompanyExcel(
  file: File,
  year: number,
  divisions: Division[] = []
): Promise<{ parsed: Partial<Company>[]; errors: string[] }> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const sheetName = wb.SheetNames.includes('대상') ? '대상' : wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];

        if (rows.length < 2) { resolve({ parsed: [], errors: ['데이터가 없습니다.'] }); return; }

        // Find header row
        let hIdx = 0;
        for (let i = 0; i < Math.min(5, rows.length); i++) {
          if ((rows[i] as unknown[])?.some(c => String(c ?? '').includes('과제번호'))) { hIdx = i; break; }
        }

        const headers = (rows[hIdx] as unknown[]).map(h => String(h ?? '').trim());
        const parsed: Partial<Company>[] = [];
        const errors: string[] = [];

        for (let i = hIdx + 1; i < rows.length; i++) {
          const row = rows[i] as unknown[];
          if (!row || (row as unknown[]).every(c => c === null || c === undefined || c === '')) continue;

          const co: Partial<Company> & { _div_raw?: string; _div_label_raw?: string } = { year };
          let projectNo = '';

          headers.forEach((header, j) => {
            const val = row[j];
            if (val === null || val === undefined) return;
            const field = COL_MAP[header];
            if (!field) return;
            if (field === 'project_no') {
              projectNo = String(val).trim();
              co.project_no = projectNo;
            } else if (NUM_FIELDS.has(field)) {
              const n = typeof val === 'number' ? val : parseInt(String(val).replace(/[^0-9]/g, ''), 10);
              if (!isNaN(n)) (co as Record<string, unknown>)[field] = n;
            } else {
              const s = String(val).trim();
              if (s && s !== '-' && s.toLowerCase() !== 'none') (co as Record<string, unknown>)[field] = s;
            }
          });

          // Resolve division_id from raw name/label columns
          if (divisions.length > 0) {
            const rawName = co._div_raw;
            const rawLabel = co._div_label_raw;
            const divId = (rawName && resolveDivisionId(rawName, divisions)) ||
                          (rawLabel && resolveDivisionId(rawLabel, divisions)) || null;
            if (divId) co.division_id = divId;
          }
          delete co._div_raw;
          delete co._div_label_raw;

          if (!projectNo) {
            projectNo = `AUTO-${year}-${String(parsed.length + 1).padStart(4, '0')}`;
            co.project_no = projectNo;
          }
          if (!co.project_title) co.project_title = '';
          if (!co.tech_field) co.tech_field = '';
          if (!co.representative) co.representative = '';
          co.stage = '서류';

          // Parse legend / exclusion / exemption from notes
          const notes = co.notes || '';
          if (notes.includes('레전드')) co.is_legend = true;
          const exMatch = notes.match(/제외[：:]\s*([^,\n]+)/);
          if (exMatch) { co.is_excluded = true; co.exclusion_reason = exMatch[1].trim(); }
          const exmMatch = notes.match(/서류평가면제\((.+?)\)/);
          if (exmMatch) { co.is_doc_exempt = true; co.doc_exempt_reason = exmMatch[1]; }

          parsed.push(co);
        }

        resolve({ parsed, errors });
      } catch (err) {
        resolve({ parsed: [], errors: [`파싱 오류: ${(err as Error).message}`] });
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// ── Excel Export ─────────────────────────────────────────────────────────────
export function exportResultsExcel(
  companies: Company[],
  evaluators: Evaluator[],
  evaluations: Evaluation[],
  bonusPoints: BonusPoint[],
  year: number
): void {
  const wb = XLSX.utils.book_new();

  // evaluator_id → order map
  const orderMap: Record<string, number> = {};
  evaluators.forEach(e => { if (e.evaluator_order) orderMap[e.id] = e.evaluator_order; });

  // company → type → order → score
  const evalMap: Record<string, Record<string, Record<number, number>>> = {};
  evaluations.forEach(ev => {
    if (!evalMap[ev.company_id]) evalMap[ev.company_id] = {};
    if (!evalMap[ev.company_id][ev.evaluation_type]) evalMap[ev.company_id][ev.evaluation_type] = {};
    const ord = orderMap[ev.evaluator_id] || 0;
    const sc = ev.adjusted_score ?? ev.score ?? 0;
    evalMap[ev.company_id][ev.evaluation_type][ord] = sc;
  });

  // company → bonus total
  const bonusMap: Record<string, number> = {};
  bonusPoints.forEach(bp => { bonusMap[bp.company_id] = (bonusMap[bp.company_id] || 0) + bp.points; });

  for (const evalType of ['서류', '발표']) {
    const header = ['과제번호', '대표자명', '과제명', '전문기술분야', '분과',
                    '위원1', '위원2', '위원3', '위원4', '위원5', '평점', '가점', '최종점수', '순위', '결과', '비고'];
    const rows: unknown[][] = [header];

    const computed = companies
      .filter(c => !c.is_excluded)
      .map(c => {
        const ev = evalMap[c.project_no]?.[evalType] || {};
        const scores: (number | null)[] = [1, 2, 3, 4, 5].map(i => ev[i] ?? null);
        const avg = calculateAvgScore(scores);
        const bonus = bonusMap[c.project_no] || 0;
        return { c, scores, avg, bonus, final: avg + bonus };
      })
      .sort((a, b) => b.final - a.final)
      .map((item, idx) => ({ ...item, rank: idx + 1 }));

    computed.forEach(({ c, scores, avg, bonus, final, rank }) => {
      rows.push([c.project_no, c.representative, c.project_title, c.tech_field,
                 c.division?.division_label || '',
                 ...scores.map(s => s ?? ''),
                 avg || '', bonus || '', final || '', rank, c.result || '', c.notes || '']);
    });

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), `${evalType}평가`);
  }

  // 종합 시트
  const summaryHeader = ['구분', '분과명', '위원장', '대상', '면제', '통과', '예비', '탈락'];
  const summaryRows: unknown[][] = [summaryHeader];
  const divMap: Record<string, Company[]> = {};
  companies.forEach(c => {
    const lbl = c.division?.division_label || '미배정';
    if (!divMap[lbl]) divMap[lbl] = [];
    divMap[lbl].push(c);
  });
  Object.entries(divMap).sort(([a], [b]) => a.localeCompare(b)).forEach(([lbl, cs]) => {
    summaryRows.push([lbl, cs[0]?.division?.division_name || '', cs[0]?.division?.chair_name || '',
      cs.length, cs.filter(c => c.is_doc_exempt).length,
      cs.filter(c => c.result === '통과').length, cs.filter(c => c.result === '예비').length,
      cs.filter(c => c.result === '탈락').length]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), '종합');

  // 통과 시트
  const passHeader = ['순번', '과제번호', '대표자명', '과제명', '전문기술분야', '분과', '결과', '비고'];
  const passRows: unknown[][] = [passHeader];
  companies.filter(c => c.result === '통과' || c.result === '예비')
    .forEach((c, idx) => passRows.push([idx + 1, c.project_no, c.representative, c.project_title,
      c.tech_field, c.division?.division_label || '', c.result || '', c.notes || '']));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(passRows), '통과');

  XLSX.writeFile(wb, `선발결과_${year}년도.xlsx`);
}
