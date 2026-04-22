import React, { useEffect, useRef, useState } from 'react';
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
  subtitle: '「2026년 창업중심대학 지원사업」',
  mainTitle: '(예비)창업기업 선정평가 발표평가표',
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
  confirmText: '본인은 2026년 창업중심대학 지원사업 참여기업 선정평가에 참여함에 있어 공정하게 평가하였으며, 평가 결과에 이상이 없음을 확인합니다.',
  footer: '주관기관장 귀하',
};

const STORAGE_KEY = 'print_template_v2';

function loadTemplate(): PrintTemplate {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_TEMPLATE, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_TEMPLATE };
}

interface Props {
  year: number;
  user: Evaluator;
}

type EvalTypeTab = '서류' | '발표';


function SimpleField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-600 mb-1">{label}</div>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

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
  const [selectedEvalIds, setSelectedEvalIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [template, setTemplate] = useState<PrintTemplate>(loadTemplate);
  const [draft, setDraft] = useState<PrintTemplate>(loadTemplate);
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const [printDate, setPrintDate] = useState(todayStr);
  const [printDateModal, setPrintDateModal] = useState<{ company?: Company } | null>(null);
  const printIframeRef = useRef<HTMLIFrameElement>(null);

  function setDraftField<K extends keyof PrintTemplate>(key: K, value: PrintTemplate[K]) {
    setDraft(prev => ({ ...prev, [key]: value }));
  }

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
      const divEvs = evs.filter(e => e.division_id === selectedDivId && e.role !== 'admin')
        .sort((a, b) => (a.evaluator_order || 0) - (b.evaluator_order || 0));
      setEvaluators(divEvs);
      setSelectedEvalIds(new Set(divEvs.map(e => e.id)));
      setEvaluations(allEvals.filter(ev => ev.evaluation_type === evalType));
    });
  }, [selectedDivId, evalType, year]);

  function buildPrintHtml(cos: Company[], evs: Evaluator[], dateStr?: string): string {
    const tpl = template;
    const sections = evalType === '서류' ? docSections : presSections;
    const div = divisions.find(d => d.id === selectedDivId);

    const evalMap: Record<string, Record<string, Evaluation>> = {};
    evaluations.forEach(ev => {
      if (!evalMap[ev.company_id]) evalMap[ev.company_id] = {};
      evalMap[ev.company_id][ev.evaluator_id] = ev;
    });

    const pages = evs.flatMap(ev =>
      cos.map(co => {
        const evaluation = evalMap[co.project_no]?.[ev.id];
        const ss = evaluation?.sub_scores as Record<string, number> | undefined;
        const finalScore = evaluation ? (evaluation.adjusted_score ?? evaluation.score ?? 0) : 0;

        const scoreRows = sections.length > 0
          ? sections.flatMap((sec, _si) =>
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

        const xo = (evaluation?.extra_opinions as Record<string, string>) || {};
        const univNote = co.recruit_type?.includes('대학발') ? `
          <tr><td style="padding:4px 8px;font-size:10px;color:#555;border-top:1px solid #ddd">
            ※ 지역주력산업 일치 여부: ${xo['주력산업_일치여부'] || '　　　　'}
            &nbsp;&nbsp;&nbsp; 의견: ${xo['주력산업_의견'] || '　　　　　　　　　　　　　　　　　　　　'}
          </td></tr>` : '';

        return `<div class="page">
  <div class="title-box">
    <div class="sub">${tpl.subtitle}</div>
    <div class="main">${tpl.mainTitle}</div>
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
  <div class="confirm">${tpl.confirmText}</div>
  <div class="confirm-date">${dateStr ? dateStr.replace(/-/g, '년 ').replace(/년 (\d+)년 (\d+)$/, '년 $1월 $2일') : `${year}년 &nbsp;&nbsp;&nbsp;&nbsp; 월 &nbsp;&nbsp;&nbsp;&nbsp; 일`}</div>
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
    setPrintDate(todayStr());
    setPrintDateModal({ company: co });
  }

  function printAll() {
    setPrintDate(todayStr());
    setPrintDateModal({});
  }

  function doPrint(dateStr: string) {
    const modal = printDateModal;
    setPrintDateModal(null);
    if (!modal) return;
    const iframe = printIframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    if (modal.company) {
      doc.write(buildPrintHtml([modal.company], getEvsForCompany(modal.company.project_no), dateStr));
    } else {
      const filteredEvs = evaluators.filter(e => selectedEvalIds.has(e.id));
      doc.write(buildPrintHtml(companies, filteredEvs.length > 0 ? filteredEvs : evaluators, dateStr));
    }
    doc.close();
    setTimeout(() => iframe.contentWindow?.print(), 300);
  }

  function openModal() {
    setDraft({ ...template });
    setTplModalOpen(true);
  }

  function saveTpl() {
    setTemplate({ ...draft });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    setTplModalOpen(false);
  }

  function resetDraft() {
    if (!confirm('기본값으로 초기화할까요?')) return;
    setDraft({ ...DEFAULT_TEMPLATE });
  }

  const div = divisions.find(d => d.id === selectedDivId);

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">로딩 중...</div>;

  return (
    <div className="p-8">
      <iframe ref={printIframeRef} style={{ display: 'none' }} title="print-frame" />
      {printDateModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80">
            <h3 className="font-bold text-gray-900 mb-1">인쇄 날짜 선택</h3>
            <p className="text-xs text-gray-500 mb-4">평가표에 기재할 날짜를 선택하세요.</p>
            <input
              type="date"
              value={printDate}
              onChange={e => setPrintDate(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setPrintDateModal(null)} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={() => doPrint(printDate)} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">인쇄</button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">평가표 인쇄</h1>
          <p className="text-sm text-gray-500 mt-0.5">{year}년도 · 분과별 평가표 출력</p>
        </div>
      </div>

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

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">
              {div?.division_name} — {evalType}평가 대상 기업
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">총 {companies.length}개 기업 · 평가위원 {evaluators.length}명</p>
          </div>
          <div className="flex items-center gap-3 ml-auto flex-wrap justify-end">
            {evaluators.length > 0 && (
              <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedEvalIds.size === evaluators.length}
                    onChange={e => setSelectedEvalIds(e.target.checked ? new Set(evaluators.map(ev => ev.id)) : new Set())}
                    className="w-3.5 h-3.5 accent-blue-600"
                  />
                  전체
                </label>
                <div className="w-px h-4 bg-gray-300" />
                {evaluators.map(ev => (
                  <label key={ev.id} className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={selectedEvalIds.has(ev.id)}
                      onChange={e => setSelectedEvalIds(prev => {
                        const next = new Set(prev);
                        e.target.checked ? next.add(ev.id) : next.delete(ev.id);
                        return next;
                      })}
                      className="w-3.5 h-3.5 accent-blue-600"
                    />
                    위원{ev.evaluator_order}
                  </label>
                ))}
              </div>
            )}
            <button
              onClick={openModal}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              <Settings size={14} />양식 편집
            </button>
            {companies.length > 0 && evaluators.length > 0 && (
              <button
                onClick={printAll}
                disabled={selectedEvalIds.size === 0}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Printer size={15} />전체 인쇄 ({companies.length * selectedEvalIds.size}매)
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
                  onClick={resetDraft}
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
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">제목</div>
              <SimpleField label="부제목" value={draft.subtitle} onChange={v => setDraftField('subtitle', v)} />
              <SimpleField label="주제목" value={draft.mainTitle} onChange={v => setDraftField('mainTitle', v)} />

              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">기본 정보</div>
              <SimpleField label="주관기관명" value={draft.university} onChange={v => setDraftField('university', v)} />
              <div className="grid grid-cols-2 gap-3">
                <SimpleField label="지원유형 레이블" value={draft.labelSupportType} onChange={v => setDraftField('labelSupportType', v)} />
                <SimpleField label="주관기관명 레이블" value={draft.labelOrg} onChange={v => setDraftField('labelOrg', v)} />
                <SimpleField label="아이템명 레이블" value={draft.labelItem} onChange={v => setDraftField('labelItem', v)} />
                <SimpleField label="분과구분 레이블" value={draft.labelDivision} onChange={v => setDraftField('labelDivision', v)} />
              </div>

              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">점수표 헤더</div>
              <div className="grid grid-cols-4 gap-3">
                <SimpleField label="세부평가" value={draft.thSection} onChange={v => setDraftField('thSection', v)} />
                <SimpleField label="평가내용" value={draft.thContent} onChange={v => setDraftField('thContent', v)} />
                <SimpleField label="배점" value={draft.thMax} onChange={v => setDraftField('thMax', v)} />
                <SimpleField label="점수" value={draft.thScore} onChange={v => setDraftField('thScore', v)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <SimpleField label="합계 행 레이블" value={draft.totalLabel} onChange={v => setDraftField('totalLabel', v)} />
                <SimpleField label="평가의견 레이블" value={draft.opinionLabel} onChange={v => setDraftField('opinionLabel', v)} />
              </div>

              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">서약 / 하단</div>
              <div>
                <div className="text-xs font-medium text-gray-600 mb-1">서약 문구</div>
                <textarea
                  rows={3}
                  value={draft.confirmText}
                  onChange={e => setDraftField('confirmText', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <SimpleField label="하단 수신자" value={draft.footer} onChange={v => setDraftField('footer', v)} />
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
