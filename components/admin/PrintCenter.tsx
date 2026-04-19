import React, { useEffect, useState } from 'react';
import {
  getCompanies, getDivisions, getEvaluators, getEvaluations, getEvalCriteria,
} from '../../services/api';
import type { Company, Division, Evaluator, Evaluation, EvalCriterion } from '../../types';
import { Printer, Settings, X, RotateCcw } from 'lucide-react';

interface CriteriaSection {
  section: number;
  name: string;
  total: number;
  items: { key: string; name: string; max: number }[];
}

function buildSections(items: EvalCriterion[]): CriteriaSection[] {
  const map: Record<number, CriteriaSection> = {};
  items.forEach(c => {
    if (!map[c.section_no]) map[c.section_no] = { section: c.section_no, name: c.section_name, total: 0, items: [] };
    map[c.section_no].items.push({ key: c.item_key, name: c.item_name, max: c.item_max });
    map[c.section_no].total += c.item_max;
  });
  return Object.values(map)
    .sort((a, b) => a.section - b.section)
    .map(s => ({ ...s, items: s.items.sort((a, b) => a.key.localeCompare(b.key)) }));
}

export interface PrintTemplate {
  subtitle: string;
  mainTitle: string;
  university: string;
  labelSupportType: string;
  labelOrg: string;
  labelItem: string;
  labelDivision: string;
  thSection: string;
  thContent: string;
  thMax: string;
  thScore: string;
  totalLabel: string;
  opinionLabel: string;
  confirmText: string;
  footer: string;
}

const DEFAULT_TEMPLATE: PrintTemplate = {
  subtitle: '「{year}년 창업중심대학 지원사업」',
  mainTitle: '(예비)창업기업 선정평가 {evalType}평가표',
  university: '성균관대학교',
  labelSupportType: '지 원 유 형',
  labelOrg: '주 관 기 관 명',
  labelItem: '아 이 템 명',
  labelDivision: '분 과 구 분',
  thSection: '세부평가',
  thContent: '평가내용',
  thMax: '배점',
  thScore: '점수',
  totalLabel: '최 종 점 수',
  opinionLabel: '평 가 의 견',
  confirmText: '본인은 {year}년 창업중심대학 지원사업 참여기업 선정평가에 참여함에 있어 공정하게 평가하였으며, 평가 결과에 이상이 없음을 확인합니다.',
  footer: '주관기관장 귀하',
};

const TEMPLATE_STORAGE_KEY = 'print_template';

function loadTemplate(): PrintTemplate {
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (raw) return { ...DEFAULT_TEMPLATE, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_TEMPLATE };
}

interface TemplateField {
  key: keyof PrintTemplate;
  label: string;
  hint?: string;
}

const TEMPLATE_FIELDS: TemplateField[] = [
  { key: 'subtitle', label: '부제목', hint: '{year} → 연도 자동 치환' },
  { key: 'mainTitle', label: '주제목', hint: '{year}, {evalType} → 자동 치환' },
  { key: 'university', label: '주관기관명' },
  { key: 'labelSupportType', label: '메타 레이블: 지원유형' },
  { key: 'labelOrg', label: '메타 레이블: 주관기관명' },
  { key: 'labelItem', label: '메타 레이블: 아이템명' },
  { key: 'labelDivision', label: '메타 레이블: 분과구분' },
  { key: 'thSection', label: '점수표 헤더: 세부평가' },
  { key: 'thContent', label: '점수표 헤더: 평가내용' },
  { key: 'thMax', label: '점수표 헤더: 배점' },
  { key: 'thScore', label: '점수표 헤더: 점수' },
  { key: 'totalLabel', label: '합계 행 레이블' },
  { key: 'opinionLabel', label: '평가의견 레이블' },
  { key: 'confirmText', label: '서약 문구', hint: '{year} → 자동 치환' },
  { key: 'footer', label: '하단 수신자' },
];

interface Props {
  year: number;
  user: Evaluator;
}

type EvalTypeTab = '서류' | '발표';

export default function PrintCenter({ year, user }: Props) {
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [docSections, setDocSections] = useState<CriteriaSection[]>([]);
  const [presSections, setPresSections] = useState<CriteriaSection[]>([]);
  const [selectedDivId, setSelectedDivId] = useState('');
  const [evalType, setEvalType] = useState<EvalTypeTab>('발표');
  const [companyEvalFilter, setCompanyEvalFilter] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [template, setTemplate] = useState<PrintTemplate>(loadTemplate);
  const [tplDraft, setTplDraft] = useState<PrintTemplate>(loadTemplate);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getDivisions(year),
      getEvalCriteria(year, '서류'),
      getEvalCriteria(year, '발표'),
    ]).then(([divs, docC, presC]) => {
      setDivisions(divs);
      setDocSections(buildSections(docC));
      setPresSections(buildSections(presC));
      if (divs.length > 0) setSelectedDivId(divs[0].id);
      setLoading(false);
    });
  }, [year]);

  useEffect(() => {
    if (!selectedDivId) return;
    Promise.all([
      getCompanies(year, selectedDivId),
      getEvaluators(year),
    ]).then(async ([cos, evs]) => {
      const activeCos = cos.filter(c => !c.is_excluded && (
        evalType === '서류' ? true : (c.stage === '발표' || c.stage === '완료')
      ));
      const allEvals = activeCos.length > 0
        ? await getEvaluations({ companyIds: activeCos.map(c => c.project_no) })
        : [];
      setCompanies(activeCos);
      setEvaluators(evs.filter(e => e.division_id === selectedDivId && e.role !== 'admin')
        .sort((a, b) => (a.evaluator_order || 0) - (b.evaluator_order || 0)));
      setEvaluations(allEvals.filter(ev => ev.evaluation_type === evalType));
    });
  }, [selectedDivId, evalType, year]);

  function applyTpl(s: string) {
    return s.replace(/\{year\}/g, String(year)).replace(/\{evalType\}/g, evalType);
  }

  function buildPrintHtml(cos: Company[], evs: Evaluator[]): string {
    const tpl = template;
    const sections = evalType === '서류' ? docSections : presSections;
    const div = divisions.find(d => d.id === selectedDivId);

    const evalMap: Record<string, Record<string, Evaluation>> = {};
    evaluations.forEach(ev => {
      if (!evalMap[ev.company_id]) evalMap[ev.company_id] = {};
      evalMap[ev.company_id][ev.evaluator_id] = ev;
    });

    const pages = cos.flatMap(co =>
      evs.map(ev => {
        const evaluation = evalMap[co.project_no]?.[ev.id];
        const ss = evaluation?.sub_scores as Record<string, number> | undefined;
        const finalScore = evaluation ? (evaluation.adjusted_score ?? evaluation.score ?? 0) : 0;

        const scoreRows = sections.length > 0
          ? sections.flatMap((sec, si) =>
              sec.items.map((item, ii) => {
                const itemScore = ss?.[item.key] ?? '';
                const secCell = ii === 0
                  ? `<td class="sec-cell" rowspan="${sec.items.length}">${sec.section}. ${sec.name}<br/><span style="font-size:10px">(${sec.total}점)</span></td>`
                  : '';
                return `<tr>${secCell}<td class="item-left">${item.key}. ${item.name}</td><td class="pts">${item.max}</td><td class="pts">${itemScore !== '' ? itemScore : ''}</td></tr>`;
              })
            ).join('')
          : `<tr><td colspan="3">총점</td><td class="pts">${finalScore}</td></tr>`;

        const totalRow = `<tr class="total-row"><td colspan="3" style="text-align:right;font-weight:bold">${tpl.totalLabel}</td><td class="pts" style="font-weight:bold">${evaluation ? finalScore : ''}</td></tr>`;

        const opinionSection = evaluation?.comment
          ? `<td class="opinion-area">${evaluation.comment}</td>`
          : `<td class="opinion-area" style="color:#ccc">평가 의견을 입력하세요.</td>`;

        const univNote = co.recruit_type === '대학발' ? `
          <tr><td style="padding:4px 8px;font-size:10px;color:#555;border-top:1px solid #ddd">
            ※ 지역주력산업 일치 여부: ${evaluation?.region_match === true ? '일치' : evaluation?.region_match === false ? '불일치' : '　　　　'}
            &nbsp;&nbsp;&nbsp; 의견: ${evaluation?.region_match_comment || '　　　　　　　　　　　　　　　　　　　　'}
          </td></tr>` : '';

        return `<div class="page">
  <div class="title-box">
    <div class="sub">${applyTpl(tpl.subtitle)}</div>
    <div class="main">${applyTpl(tpl.mainTitle)}</div>
  </div>
  <table class="meta">
    <tr>
      <td class="label" width="120">${tpl.labelSupportType}</td>
      <td colspan="3">${co.recruit_type || '①지역기반 / ②대학발 / ③실험실창업'}</td>
    </tr>
    <tr>
      <td class="label">${tpl.labelOrg}</td>
      <td width="200">${tpl.university}</td>
      <td class="label" width="100">과 제 번 호</td>
      <td>${co.project_no}</td>
    </tr>
    <tr>
      <td class="label">${tpl.labelItem}</td>
      <td colspan="3">${co.project_title}</td>
    </tr>
    <tr>
      <td class="label">${tpl.labelDivision}</td>
      <td colspan="3">${div?.division_label || ''} (${div?.division_name || ''})</td>
    </tr>
  </table>
  <table class="score-tbl">
    <thead>
      <tr>
        <th width="160">${tpl.thSection}</th>
        <th>${tpl.thContent}</th>
        <th width="50">${tpl.thMax}</th>
        <th width="60">${tpl.thScore}</th>
      </tr>
    </thead>
    <tbody>
      ${scoreRows}
      ${totalRow}
    </tbody>
  </table>
  <table class="opinion-tbl">
    <tr><th>${tpl.opinionLabel}</th></tr>
    <tr>${opinionSection}</tr>
    ${univNote}
  </table>
  <div class="confirm">${applyTpl(tpl.confirmText)}</div>
  <div class="confirm-date">${year}년 &nbsp;&nbsp;&nbsp;&nbsp; 월 &nbsp;&nbsp;&nbsp;&nbsp; 일</div>
  <div class="sig-line">소속: ${ev.organization || '　　　　　　　　　　　　'} &nbsp;&nbsp; 직위: ${ev.position || '　　　　'} &nbsp;&nbsp; 평가위원: ${ev.name} &nbsp;&nbsp;&nbsp;&nbsp; (인)</div>
  <div class="sig-bottom">${tpl.footer}</div>
</div>`;
      })
    );

    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${year}년도 ${div?.division_name} ${evalType}평가표</title>
<style>
  body { font-family: 'Malgun Gothic', sans-serif; font-size: 11px; margin: 0; padding: 0; }
  @page { size: A4 portrait; margin: 15mm 12mm; }
  .page { page-break-after: always; padding: 0; }
  .page:last-child { page-break-after: auto; }
  .title-box { text-align: center; border: 2px solid #333; padding: 10px; margin-bottom: 10px; }
  .title-box .sub { font-size: 11px; color: #555; margin-bottom: 4px; }
  .title-box .main { font-size: 18px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { border: 1px solid #888; padding: 5px 7px; vertical-align: middle; }
  th { background: #f2f2f2; font-weight: 600; text-align: center; }
  td.label { background: #f5f5f5; font-weight: 600; text-align: center; white-space: nowrap; }
  td.sec-cell { background: #fafafa; font-weight: 600; text-align: center; font-size: 10.5px; }
  td.item-left { text-align: left; font-size: 10.5px; }
  td.pts { text-align: center; }
  td.opinion-area { min-height: 80px; height: 80px; padding: 8px; text-align: left; vertical-align: top; }
  tr.total-row td { background: #e8f0fe; }
  .confirm { margin-top: 14px; font-size: 10.5px; line-height: 1.6; }
  .confirm-date { margin-top: 8px; font-size: 11px; }
  .sig-line { margin-top: 12px; font-size: 11px; }
  .sig-bottom { margin-top: 10px; text-align: right; font-size: 11px; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
<button class="no-print" onclick="window.print()" style="margin:10px;padding:8px 20px;background:#1a56db;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">인쇄</button>
${pages.join('\n')}
</body>
</html>`;
  }

  function getEvsForCompany(coId: string) {
    const sel = companyEvalFilter[coId];
    return sel ? evaluators.filter(e => e.id === sel) : evaluators;
  }

  function printCompany(co: Company) {
    const win = window.open('', '_blank');
    if (!win) return;
    const html = buildPrintHtml([co], getEvsForCompany(co.project_no));
    win.document.write(html);
    win.document.close();
  }

  function printAll() {
    const win = window.open('', '_blank');
    if (!win) return;
    const html = buildPrintHtml(companies, evaluators);
    win.document.write(html);
    win.document.close();
  }

  function openTplModal() {
    setTplDraft({ ...template });
    setTplModalOpen(true);
  }

  function saveTpl() {
    setTemplate({ ...tplDraft });
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(tplDraft));
    setTplModalOpen(false);
  }

  function resetTpl() {
    if (!confirm('기본값으로 초기화할까요?')) return;
    setTplDraft({ ...DEFAULT_TEMPLATE });
  }

  const div = divisions.find(d => d.id === selectedDivId);

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">로딩 중...</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">평가표 인쇄</h1>
          <p className="text-sm text-gray-500 mt-0.5">{year}년도 · 분과별 평가표 출력</p>
        </div>
      </div>

      {/* Division & type selectors */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-2 flex-wrap">
          {divisions.map(d => (
            <button
              key={d.id}
              onClick={() => { setSelectedDivId(d.id); setCompanyEvalFilter({}); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                selectedDivId === d.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:text-blue-600'
              }`}
            >
              {d.division_name}
            </button>
          ))}
        </div>
        <div className="ml-auto flex rounded-lg border border-gray-300 overflow-hidden">
          {(['서류', '발표'] as const).map(t => (
            <button
              key={t}
              onClick={() => setEvalType(t)}
              className={`px-4 py-2 text-sm transition-colors ${evalType === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {t}평가
            </button>
          ))}
        </div>
      </div>


      {/* Company list */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">
              {div?.division_name} — {evalType}평가 대상 기업
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">총 {companies.length}개 기업 · 평가위원 {evaluators.length}명</p>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={openTplModal}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              <Settings size={14} />양식 편집
            </button>
            {companies.length > 0 && evaluators.length > 0 && (
              <button
                onClick={printAll}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Printer size={15} />전체 인쇄 ({companies.length * evaluators.length}매)
              </button>
            )}
          </div>
        </div>

        {companies.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">
            {evalType === '발표' ? '발표평가 대상 기업이 없습니다.' : '서류평가 대상 기업이 없습니다.'}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {companies.map((co, idx) => {
              const selEvalId = companyEvalFilter[co.project_no] || '';
              const printCount = selEvalId ? 1 : evaluators.length;
              return (
                <div key={co.project_no} className="flex items-center px-6 py-3 gap-3 hover:bg-gray-50">
                  <span className="w-6 text-xs text-gray-400 shrink-0">{idx + 1}</span>
                  <span className="w-24 text-xs text-gray-500 shrink-0">{co.project_no}</span>
                  <span className="w-20 text-sm text-gray-700 shrink-0 truncate">{co.representative}</span>
                  <span className="flex-1 text-sm text-gray-900 min-w-0 truncate">{co.project_title}</span>
                  <select
                    value={selEvalId}
                    onChange={e => setCompanyEvalFilter(prev => ({ ...prev, [co.project_no]: e.target.value }))}
                    className="shrink-0 w-40 border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">전체 ({evaluators.length}명)</option>
                    {evaluators.map(ev => (
                      <option key={ev.id} value={ev.id}>{ev.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => printCompany(co)}
                    disabled={evaluators.length === 0}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-xs hover:bg-gray-100 disabled:opacity-40 transition-colors"
                  >
                    <Printer size={12} />인쇄 ({printCount}매)
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Template edit modal */}
      {tplModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">평가표 양식 편집</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={resetTpl}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <RotateCcw size={12} />기본값
                </button>
                <button onClick={() => setTplModalOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              {TEMPLATE_FIELDS.map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {f.label}
                    {f.hint && <span className="ml-1 text-gray-400 font-normal">({f.hint})</span>}
                  </label>
                  {f.key === 'confirmText' ? (
                    <textarea
                      rows={3}
                      value={tplDraft[f.key]}
                      onChange={e => setTplDraft(prev => ({ ...prev, [f.key]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  ) : (
                    <input
                      type="text"
                      value={tplDraft[f.key]}
                      onChange={e => setTplDraft(prev => ({ ...prev, [f.key]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setTplModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={saveTpl}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
