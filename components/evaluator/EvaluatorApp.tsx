import React, { useEffect, useState } from 'react';
import {
  getCompanies, getEvaluations, saveEvaluation, getFileUrl, getEvalCriteria, getCompanyFiles,
  getGradeSettings, getEvaluators, calculateAvgScore
} from '../../services/api';
import type { Evaluator, Company, Evaluation, EvalCriterion, CompanyFile, GradeSetting } from '../../types';
import { LogOut, X, ExternalLink, CheckCircle, Clock, Star, FileCheck, Printer, BarChart2 } from 'lucide-react';
import GradeDashboard from '../admin/GradeDashboard';

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

interface Props {
  user: Evaluator;
  onLogout: () => void;
}

type Filter = 'all' | 'done' | 'todo';

export default function EvaluatorApp({ user, onLogout }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [docSections, setDocSections] = useState<CriteriaSection[]>([]);
  const [presSections, setPresSections] = useState<CriteriaSection[]>([]);
  const [companyFiles, setCompanyFiles] = useState<Record<string, CompanyFile[]>>({});
  const [activeFileIdx, setActiveFileIdx] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Company | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<'all' | '서류' | '발표'>('all');
  const [grades, setGrades] = useState<GradeSetting[]>([]);
  const [allEvals, setAllEvals] = useState<Evaluation[]>([]);
  const [allEvaluators, setAllEvaluators] = useState<Evaluator[]>([]);
  const [showStats, setShowStats] = useState(false);
  const [showModalStats, setShowModalStats] = useState(false);

  // Evaluation form state
  const [score, setScore] = useState('');
  const [subScores, setSubScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [regionMatch, setRegionMatch] = useState<boolean | null>(null);
  const [regionMatchComment, setRegionMatchComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');

  useEffect(() => {
    if (!user.division_id) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      getCompanies(user.year, user.division_id),
      getEvaluations({ evaluatorId: user.id }),
      getEvalCriteria(user.year, '서류'),
      getEvalCriteria(user.year, '발표'),
    ]).then(async ([cos, evs, docC, presC]) => {
      const active = cos.filter(c => !c.is_excluded);
      setCompanies(active);
      setEvaluations(evs);
      setDocSections(buildSections(docC));
      setPresSections(buildSections(presC));
      if (active.length > 0) {
        const [files, ae, evrs, gs] = await Promise.all([
          getCompanyFiles(active.map(c => c.project_no)),
          getEvaluations({ companyIds: active.map(c => c.project_no) }),
          getEvaluators(user.year),
          getGradeSettings(user.year),
        ]);
        const fm: Record<string, CompanyFile[]> = {};
        files.forEach(f => { if (!fm[f.company_id]) fm[f.company_id] = []; fm[f.company_id].push(f); });
        setCompanyFiles(fm);
        setAllEvals(ae);
        setAllEvaluators(evrs.filter(e => e.role !== 'admin'));
        setGrades(gs);
      }
      setLoading(false);
    });
  }, [user]);

  function getEvalForCompany(projectNo: string, type: string): Evaluation | undefined {
    return evaluations.find(e => e.company_id === projectNo && e.evaluation_type === type);
  }

  function getActiveEvalType(co: Company): '서류' | '발표' | null {
    if (co.is_doc_exempt && co.stage === '발표') return '발표';
    if (co.stage === '서류') return '서류';
    if (co.stage === '발표') return '발표';
    return null;
  }

  function isEvaluated(co: Company): boolean {
    const type = getActiveEvalType(co);
    if (!type) return true;
    return !!getEvalForCompany(co.project_no, type);
  }

  function openCompany(co: Company) {
    setSelected(co);
    const type = getActiveEvalType(co);
    if (type) {
      const ev = getEvalForCompany(co.project_no, type);
      if (ev?.sub_scores && Object.keys(ev.sub_scores).length > 0) {
        const ss = ev.sub_scores as Record<string, number>;
        setSubScores(ss);
        const total = Object.values(ss).reduce((a, b) => a + b, 0);
        setScore(String(total));
      } else {
        setSubScores({});
        setScore(ev?.score !== undefined && ev?.score !== null ? String(ev.score) : '');
      }
      setComment(ev?.comment || '');
      setRegionMatch(ev?.region_match ?? null);
      setRegionMatchComment(ev?.region_match_comment || '');
    } else {
      setScore('');
      setSubScores({});
      setComment('');
      setRegionMatch(null);
      setRegionMatchComment('');
    }
    setSubmitMsg('');
  }

  function handlePrintAllForms() {
    const activeSections = presSections.length > 0 ? presSections : docSections;
    const win = window.open('', '_blank');
    if (!win) return;

    const pages = companies.map(co => {
      const evalType = getActiveEvalType(co);
      if (!evalType) return '';
      const ev = getEvalForCompany(co.project_no, evalType);
      const ss = ev?.sub_scores as Record<string, number> | undefined;
      const sc = ev ? (ev.adjusted_score ?? ev.score ?? 0) : 0;
      const sections = evalType === '서류' ? docSections : presSections;

      const scoreRows = sections.length > 0
        ? sections.flatMap(sec =>
            sec.items.map((item, ii) => {
              const secCell = ii === 0
                ? `<td class="sec-cell" rowspan="${sec.items.length}">${sec.section}. ${sec.name}<br/><span style="font-size:10px">(${sec.total}점)</span></td>`
                : '';
              return `<tr>${secCell}<td class="item-left">${item.key}. ${item.name}</td><td class="pts">${item.max}</td><td class="pts">${ss?.[item.key] !== undefined ? ss[item.key] : ''}</td></tr>`;
            })
          ).join('')
        : `<tr><td colspan="3">총점</td><td class="pts">${sc}</td></tr>`;

      return `<div class="page">
  <div class="title-box">
    <div class="sub">「${user.year}년 창업중심대학 지원사업」</div>
    <div class="main">(예비)창업기업 선정평가 ${evalType}평가표</div>
  </div>
  <table class="meta">
    <tr><td class="label" width="120">지 원 유 형</td><td colspan="3">${co.recruit_type || ''}</td></tr>
    <tr><td class="label">주 관 기 관 명</td><td width="200">성균관대학교</td><td class="label" width="100">과 제 번 호</td><td>${co.project_no}</td></tr>
    <tr><td class="label">아 이 템 명</td><td colspan="3">${co.project_title}</td></tr>
    <tr><td class="label">분 과 구 분</td><td colspan="3">${user.division?.division_label || ''} (${user.division?.division_name || ''})</td></tr>
  </table>
  <table class="score-tbl">
    <thead><tr><th width="160">세부평가</th><th>평가내용</th><th width="50">배점</th><th width="60">점수</th></tr></thead>
    <tbody>
      ${scoreRows}
      <tr class="total-row"><td colspan="3" style="text-align:right;font-weight:bold">최 종 점 수</td><td class="pts" style="font-weight:bold">${ev ? sc : ''}</td></tr>
    </tbody>
  </table>
  <table class="opinion-tbl">
    <tr><th>평 가 의 견</th></tr>
    <tr><td class="opinion-area">${ev?.comment || ''}</td></tr>
    ${co.recruit_type === '대학발' ? `<tr><td style="padding:4px 8px;font-size:10px;color:#555">※ 지역주력산업 일치 여부: ${ev?.region_match === true ? '일치' : ev?.region_match === false ? '불일치' : '　　'} &nbsp;&nbsp; 의견: ${ev?.region_match_comment || ''}</td></tr>` : ''}
  </table>
  <div class="confirm">본인은 ${user.year}년 창업중심대학 지원사업 참여기업 선정평가에 참여함에 있어 공정하게 평가하였으며, 평가 결과에 이상이 없음을 확인합니다.</div>
  <div class="confirm-date">${user.year}년 &nbsp;&nbsp;&nbsp;&nbsp; 월 &nbsp;&nbsp;&nbsp;&nbsp; 일</div>
  <div class="sig-line">소속: ${user.organization || '　　　　　　　　　　　　'} &nbsp;&nbsp; 직위: ${user.position || '　　　　'} &nbsp;&nbsp; 평가위원: ${user.name} &nbsp;&nbsp;&nbsp;&nbsp; (인)</div>
  <div class="sig-bottom">주관기관장 귀하</div>
</div>`;
    }).join('\n');

    win.document.write(`<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<title>${user.year}년도 ${user.division?.division_name} 평가표</title>
<style>
  body{font-family:'Malgun Gothic',sans-serif;font-size:11px;margin:0;padding:0}
  @page{size:A4 portrait;margin:15mm 12mm}
  .page{page-break-after:always;padding:0}.page:last-child{page-break-after:auto}
  .title-box{text-align:center;border:2px solid #333;padding:10px;margin-bottom:10px}
  .title-box .sub{font-size:11px;color:#555;margin-bottom:4px}.title-box .main{font-size:18px;font-weight:bold}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}
  th,td{border:1px solid #888;padding:5px 7px;vertical-align:middle}
  th{background:#f2f2f2;font-weight:600;text-align:center}
  td.label{background:#f5f5f5;font-weight:600;text-align:center;white-space:nowrap}
  td.sec-cell{background:#fafafa;font-weight:600;text-align:center;font-size:10.5px}
  td.item-left{text-align:left;font-size:10.5px}td.pts{text-align:center}
  td.opinion-area{min-height:80px;height:80px;padding:8px;text-align:left;vertical-align:top}
  tr.total-row td{background:#e8f0fe}
  .confirm{margin-top:14px;font-size:10.5px;line-height:1.6}
  .confirm-date{margin-top:8px;font-size:11px}.sig-line{margin-top:12px;font-size:11px}
  .sig-bottom{margin-top:10px;text-align:right;font-size:11px}
  @media print{.no-print{display:none}}
</style></head><body>
<button class="no-print" onclick="window.print()" style="margin:10px;padding:8px 20px;background:#1a56db;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">인쇄</button>
${pages}
</body></html>`);
    win.document.close();
  }

  function handlePrintEvalForm() {
    if (!selected || !selectedEv) return;
    const sc = selectedEv.adjusted_score ?? selectedEv.score ?? 0;
    const ss = selectedEv.sub_scores as Record<string, number> | undefined;
    const win = window.open('', '_blank');
    if (!win) return;
    const activeSections = selectedEvalType === '서류' ? docSections : presSections;
    const subsHtml = ss && activeSections.length > 0 ? activeSections.map(sec => `
      <tr><td colspan="3" style="background:#f5f5f5;font-weight:bold;padding:4px 8px">${sec.section}. ${sec.name} (${sec.total}점)</td></tr>
      ${sec.items.map(it => `<tr><td style="padding:3px 8px;padding-left:20px">${it.key}. ${it.name}</td><td style="text-align:center">${it.max}점</td><td style="text-align:center">${ss[it.key] ?? 0}점</td></tr>`).join('')}
    `).join('') : `<tr><td colspan="2">점수</td><td style="text-align:center">${sc}점</td></tr>`;

    win.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<style>body{font-family:'Malgun Gothic',sans-serif;font-size:11px;margin:20px}
h2{text-align:center;font-size:15px;margin-bottom:4px}
.meta{text-align:center;font-size:11px;color:#555;margin-bottom:12px}
table{width:100%;border-collapse:collapse;margin-bottom:12px}
th,td{border:1px solid #999;padding:4px 6px}th{background:#eee}
.sig{margin-top:30px;font-size:11px}.no-print{margin:10px}
@media print{.no-print{display:none}}</style></head><body>
<button class="no-print" onclick="window.print()">인쇄</button>
<h2>${user.year}년도 창업중심대학 참여기업 선발 발표평가표</h2>
<div class="meta">분과: ${user.division?.division_name} &nbsp;|&nbsp; 평가위원: 위원${user.evaluator_order} ${user.name}</div>
<table>
  <tr><th>과제번호</th><td>${selected.project_no}</td><th>과제명</th><td colspan="3">${selected.project_title}</td></tr>
  <tr><th>대표자</th><td>${selected.representative}</td><th>지원유형</th><td colspan="3">${selected.recruit_type || '-'}</td></tr>
</table>
<table><thead><tr><th>평가항목</th><th>배점</th><th>점수</th></tr></thead><tbody>
${subsHtml}
<tr style="font-weight:bold;background:#e8f0fe"><td colspan="2">총 점</td><td style="text-align:center">${sc}점</td></tr>
</tbody></table>
<table><thead><tr><th>평가의견</th></tr></thead><tbody>
<tr><td style="min-height:60px;padding:8px">${selectedEv.comment || ''}</td></tr>
${selected.recruit_type === '대학발' ? `
<tr><th>지역주력산업 일치 여부</th></tr>
<tr><td>${selectedEv.region_match === true ? '✅ 일치' : selectedEv.region_match === false ? '❌ 불일치' : '-'}</td></tr>
<tr><th>지역주력산업 관련 의견</th></tr>
<tr><td style="min-height:40px;padding:8px">${selectedEv.region_match_comment || ''}</td></tr>` : ''}
</tbody></table>
<div class="sig">
  <p>위 평가 결과가 사실임을 확인합니다.</p>
  <p>평가일: ${user.year}년 &nbsp;&nbsp; 월 &nbsp;&nbsp; 일</p>
  <p>소속: ${user.organization || ''} &nbsp;&nbsp; 직위: ${user.position || ''} &nbsp;&nbsp; 평가위원: ${user.name} &nbsp;&nbsp;&nbsp;&nbsp; (서명)</p>
</div></body></html>`);
    win.document.close();
  }

  function setSubScore(key: string, val: number, max: number) {
    const clamped = Math.min(max, Math.max(0, val));
    setSubScores(prev => {
      const next = { ...prev, [key]: clamped };
      const total = Object.values(next).reduce((a, b) => a + b, 0);
      setScore(String(total));
      return next;
    });
  }

  async function handleSubmit() {
    if (!selected) return;
    const evalType = getActiveEvalType(selected);
    if (!evalType) return;
    const sc = parseFloat(score);
    if (isNaN(sc) || sc < 0 || sc > 100) {
      alert('0~100 사이의 점수를 입력하세요.');
      return;
    }
    const existingEv = getEvalForCompany(selected.project_no, evalType);
    if (existingEv?.is_confirmed) {
      alert('확정된 평가는 수정할 수 없습니다.');
      return;
    }
    setSubmitting(true);
    try {
      const saved = await saveEvaluation({
        company_id: selected.project_no,
        evaluator_id: user.id,
        evaluation_type: evalType,
        score: sc,
        sub_scores: Object.keys(subScores).length > 0 ? subScores : undefined,
        comment: comment.trim() || undefined,
        region_match: selected.recruit_type === '대학발' ? (regionMatch ?? undefined) : undefined,
        region_match_comment: selected.recruit_type === '대학발' ? (regionMatchComment.trim() || undefined) : undefined,
        submitted_at: new Date().toISOString(),
      });
      setEvaluations(prev => {
        const filtered = prev.filter(e => !(e.company_id === selected.project_no && e.evaluation_type === evalType));
        return [...filtered, saved];
      });
      setSubmitMsg('저장되었습니다.');
      setTimeout(() => setSubmitMsg(''), 3000);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const evaluated = companies.filter(c => isEvaluated(c));
  const progress = companies.length > 0 ? Math.round((evaluated.length / companies.length) * 100) : 0;

  const filtered = companies.filter(co => {
    if (filter === 'done' && !isEvaluated(co)) return false;
    if (filter === 'todo' && isEvaluated(co)) return false;
    if (stageFilter !== 'all' && co.stage !== stageFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        co.project_no.includes(q) ||
        co.representative.toLowerCase().includes(q) ||
        co.project_title.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const selectedEvalType = selected ? getActiveEvalType(selected) : null;
  const selectedEv = selected && selectedEvalType ? getEvalForCompany(selected.project_no, selectedEvalType) : undefined;
  const isConfirmed = selectedEv?.is_confirmed;

  // Build file list for selected company: uploaded docs first, fallback to file_path
  const selectedFiles: { name: string; url: string }[] = selected
    ? [
        ...(companyFiles[selected.project_no] || []).map(f => ({ name: f.file_name, url: getFileUrl(f.file_path) })),
        ...(selected.file_path && !(companyFiles[selected.project_no]?.length) ? [{ name: '사업계획서', url: getFileUrl(selected.file_path) }] : []),
      ]
    : [];
  const activeIdx = selected ? (activeFileIdx[selected.project_no] ?? 0) : 0;
  const pdfUrl = selectedFiles[activeIdx]?.url || '';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">로딩 중...</div>
      </div>
    );
  }

  if (!user.division_id) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium text-gray-700 mb-2">분과가 배정되지 않았습니다</div>
          <div className="text-sm text-gray-500">관리자에게 문의하세요.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="font-bold text-gray-900">창업중심대학 참여기업 평가</h1>
            <p className="text-xs text-gray-500">
              {user.year}년도 · {user.division?.division_name} · 위원{user.evaluator_order} {user.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-medium text-gray-700">{evaluated.length} / {companies.length} 완료</div>
            <div className="w-32 h-2 bg-gray-200 rounded-full mt-1">
              <div className="h-2 bg-blue-600 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <button
            onClick={() => setShowStats(s => !s)}
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors border ${showStats ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 border-gray-200'}`}
          >
            <BarChart2 size={15} />등급 현황
          </button>
          <button
            onClick={handlePrintAllForms}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
          >
            <Printer size={15} />분과 전체 인쇄
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <LogOut size={15} />로그아웃
          </button>
        </div>
      </header>

      {/* Grade distribution stats panel */}
      {showStats && (
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          {(() => {
            const divEvs = allEvaluators.filter(e => e.division_id === user.division_id).sort((a, b) => (a.evaluator_order || 0) - (b.evaluator_order || 0));
            const finalScores: Record<string, number> = {};
            companies.forEach(co => {
              const scores = divEvs.map(ev => {
                const e = allEvals.find(ev2 => ev2.company_id === co.project_no && ev2.evaluator_id === ev.id);
                return e ? (e.adjusted_score ?? e.score ?? null) : null;
              });
              const avg = calculateAvgScore(scores);
              if (avg > 0) finalScores[co.project_no] = avg;
            });
            return <GradeDashboard grades={grades} companies={companies} finalScores={finalScores} divisions={user.division ? [user.division] : []} showDivisions={false} />;
          })()}
        </div>
      )}

      {/* Evaluation modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 z-50 flex">
          <div className="flex flex-col bg-white w-full h-full md:flex-row">
            {/* Left: PDF viewer */}
            <div className="flex-1 bg-gray-800 flex flex-col">
              <div className="flex flex-col bg-gray-900">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="text-white text-sm font-medium">
                    {selected.project_no}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowModalStats(s => !s)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors border ${showModalStats ? 'bg-blue-600 text-white border-blue-500' : 'text-gray-300 border-gray-600 hover:bg-gray-700'}`}
                    >
                      <BarChart2 size={13} />등급 현황
                    </button>
                    <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white p-1">
                      <X size={18} />
                    </button>
                  </div>
                </div>
                {selectedFiles.length > 1 && (
                  <div className="flex overflow-x-auto border-t border-gray-700 px-2">
                    {selectedFiles.map((f, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveFileIdx(prev => ({ ...prev, [selected.project_no]: i }))}
                        className={`shrink-0 px-3 py-2 text-xs transition-colors border-b-2 ${
                          activeIdx === i
                            ? 'text-white border-blue-400'
                            : 'text-gray-400 border-transparent hover:text-gray-200'
                        }`}
                      >
                        {f.name.length > 24 ? f.name.slice(0, 22) + '…' : f.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {showModalStats && (
                <div className="bg-white border-b border-gray-200 overflow-y-auto max-h-72 p-3">
                  {(() => {
                    const divEvs = allEvaluators.filter(e => e.division_id === user.division_id).sort((a, b) => (a.evaluator_order || 0) - (b.evaluator_order || 0));
                    const finalScores: Record<string, number> = {};
                    companies.forEach(co => {
                      const scores = divEvs.map(ev => {
                        const e = allEvals.find(ev2 => ev2.company_id === co.project_no && ev2.evaluator_id === ev.id);
                        return e ? (e.adjusted_score ?? e.score ?? null) : null;
                      });
                      const avg = calculateAvgScore(scores);
                      if (avg > 0) finalScores[co.project_no] = avg;
                    });
                    return <GradeDashboard grades={grades} companies={companies} finalScores={finalScores} divisions={user.division ? [user.division] : []} showDivisions={false} />;
                  })()}
                </div>
              )}
              {pdfUrl ? (
                <iframe src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=1`} className="flex-1 w-full" title="사업계획서" />
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <div className="text-4xl mb-3">📄</div>
                    <div className="text-sm">PDF 파일이 없습니다</div>
                    <div className="text-xs text-gray-500 mt-1">관리자에게 업로드를 요청하세요</div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Evaluation form */}
            <div className="w-full md:w-96 flex flex-col bg-white border-l border-gray-200 overflow-y-auto">
              <div className="px-6 py-5 border-b border-gray-100">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">{selected.tech_field} · {selected.startup_stage}</p>
                    <h2 className="font-bold text-gray-900 leading-snug">{selected.project_title}</h2>
                    <p className="text-sm text-gray-600 mt-1">{selected.representative}</p>
                    <div className="flex gap-1.5 mt-2">
                      {selected.is_legend && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">
                          <Star size={10} />레전드
                        </span>
                      )}
                      {selected.is_doc_exempt && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">
                          <FileCheck size={10} />서류면제
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 p-1 md:hidden">
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="px-6 py-5 flex-1 space-y-5">
                {/* Eval type badge */}
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    selectedEvalType === '서류' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {selectedEvalType}평가
                  </span>
                  {isConfirmed && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                      <CheckCircle size={11} />확정됨
                    </span>
                  )}
                </div>

                {isConfirmed ? (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                    이 평가는 확정되어 수정할 수 없습니다.
                    <div className="mt-2 font-bold text-lg">{selectedEv?.adjusted_score ?? selectedEv?.score}점</div>
                  </div>
                ) : (
                  <>
                    {(() => {
                      const activeSections = selectedEvalType === '서류' ? docSections : presSections;
                      return activeSections.length > 0 ? (
                      <div className="space-y-4">
                        {activeSections.map(section => {
                          const sectionTotal = section.items.reduce((sum, it) => sum + (subScores[it.key] ?? 0), 0);
                          return (
                            <div key={section.section} className="border border-gray-200 rounded-xl overflow-hidden">
                              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                                <span className="text-sm font-semibold text-gray-700">
                                  {section.section}. {section.name}
                                </span>
                                <span className="text-sm font-bold text-blue-700">
                                  {sectionTotal} / {section.total}점
                                </span>
                              </div>
                              <div className="divide-y divide-gray-100">
                                {section.items.map(item => (
                                  <div key={item.key} className="px-4 py-3">
                                    <div className="flex items-center justify-between mb-1.5">
                                      <label className="text-xs text-gray-600">
                                        {item.key}. {item.name}
                                        <span className="ml-1 text-gray-400">(0~{item.max}점)</span>
                                      </label>
                                      <span className="text-sm font-bold text-blue-600 w-10 text-right">
                                        {subScores[item.key] ?? 0}
                                      </span>
                                    </div>
                                    <input
                                      type="range"
                                      min="0"
                                      max={item.max}
                                      step="0.5"
                                      value={subScores[item.key] ?? 0}
                                      onChange={e => setSubScore(item.key, parseFloat(e.target.value), item.max)}
                                      className="w-full accent-blue-600"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        <div className="flex items-center justify-between px-4 py-3 bg-blue-50 rounded-xl border border-blue-200">
                          <span className="text-sm font-semibold text-blue-800">총점</span>
                          <span className="text-2xl font-bold text-blue-700">{score || 0}점</span>
                        </div>
                      </div>
                      ) : null;
                    })()}
                    {(selectedEvalType === '서류' ? docSections : presSections).length === 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">점수 (0~100점)</label>
                        <div className="space-y-2">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={score || 0}
                            onChange={e => setScore(e.target.value)}
                            className="w-full accent-blue-600"
                          />
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={score}
                              onChange={e => setScore(e.target.value)}
                              placeholder="0~100"
                              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-500">점</span>
                            {score && <span className="ml-auto text-2xl font-bold text-blue-700">{score}</span>}
                          </div>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        평가의견 <span className="text-gray-400 font-normal">(선택사항)</span>
                      </label>
                      <textarea
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        rows={4}
                        placeholder="평가 의견을 자유롭게 입력하세요."
                        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                      <div className="text-right text-xs text-gray-400 mt-1">{comment.length}자</div>
                    </div>

                    {selected?.recruit_type === '대학발' && (
                      <div className="border border-amber-200 rounded-xl p-4 bg-amber-50 space-y-3">
                        <div className="text-sm font-semibold text-amber-800">대학발 추가 의견</div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-2">지역주력산업과 창업아이템 일치 여부</label>
                          <div className="flex gap-4">
                            {[{ val: true, label: '✅ 일치' }, { val: false, label: '❌ 불일치' }].map(({ val, label }) => (
                              <label key={String(val)} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name="regionMatch"
                                  checked={regionMatch === val}
                                  onChange={() => setRegionMatch(val)}
                                  className="accent-amber-600"
                                />
                                <span className="text-sm">{label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1.5">일치/불일치 관련 의견</label>
                          <textarea
                            value={regionMatchComment}
                            onChange={e => setRegionMatchComment(e.target.value)}
                            rows={3}
                            placeholder="지역주력산업과의 관련성에 대한 의견을 입력하세요."
                            className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none bg-white"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="px-6 pb-6 pt-2 border-t border-gray-100">
                {submitMsg && (
                  <div className="mb-3 p-2.5 bg-green-50 text-green-700 text-sm rounded-lg text-center">
                    {submitMsg}
                  </div>
                )}
                {isConfirmed && selectedEv && (
                  <button
                    onClick={handlePrintEvalForm}
                    className="w-full mb-3 flex items-center justify-center gap-2 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm hover:bg-gray-50"
                  >
                    <Printer size={14} />평가표 인쇄
                  </button>
                )}
                {!isConfirmed && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => setSelected(null)}
                      className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl text-sm hover:bg-gray-50"
                    >
                      닫기
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={submitting || !score || parseFloat(score) === 0}
                      className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {submitting ? '저장 중...' : selectedEv ? '수정 저장' : '평가 제출'}
                    </button>
                  </div>
                )}
                {selectedEv && !isConfirmed && (
                  <button
                    onClick={handlePrintEvalForm}
                    className="w-full mt-2 flex items-center justify-center gap-2 py-2 border border-gray-200 text-gray-500 rounded-xl text-xs hover:bg-gray-50"
                  >
                    <Printer size={12} />평가표 인쇄 (임시)
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Filters */}
        <div className="flex gap-3 mb-6 flex-wrap items-center">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="과제번호, 대표자, 과제명 검색"
            className="flex-1 min-w-48 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {[
              { key: 'all', label: '전체' },
              { key: 'todo', label: '미완료' },
              { key: 'done', label: '완료' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key as Filter)}
                className={`px-4 py-2 text-sm transition-colors ${filter === key ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {[
              { key: 'all', label: '전체단계' },
              { key: '서류', label: '서류' },
              { key: '발표', label: '발표' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStageFilter(key as any)}
                className={`px-3 py-2 text-sm transition-colors ${stageFilter === key ? 'bg-gray-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-sm text-gray-500">{filtered.length}개</span>
        </div>

        {/* Company cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(co => {
            const evalType = getActiveEvalType(co);
            const ev = evalType ? getEvalForCompany(co.project_no, evalType) : undefined;
            const done = isEvaluated(co);
            const confirmed = ev?.is_confirmed;

            return (
              <button
                key={co.project_no}
                onClick={() => openCompany(co)}
                className={`text-left p-5 rounded-xl border-2 transition-all hover:shadow-md ${
                  confirmed
                    ? 'border-green-300 bg-green-50'
                    : done
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-blue-300'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="font-mono text-xs text-gray-400">{co.project_no}</span>
                  <div className="flex items-center gap-1">
                    {co.is_legend && <Star size={13} className="text-amber-500" />}
                    {co.is_doc_exempt && <FileCheck size={13} className="text-purple-500" />}
                    {confirmed ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-green-600 text-white text-xs rounded-full">
                        <CheckCircle size={10} />확정
                      </span>
                    ) : done ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                        <CheckCircle size={10} />완료
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-200 text-gray-500 text-xs rounded-full">
                        <Clock size={10} />미완료
                      </span>
                    )}
                  </div>
                </div>
                <div className="font-semibold text-gray-900 text-sm mb-1 leading-snug">{co.project_title}</div>
                <div className="text-xs text-gray-500 mb-2">{co.representative}</div>
                <div className="flex items-center justify-between">
                  <div className="flex gap-1.5 flex-wrap">
                    {co.age_group && (
                      <span className={`px-1.5 py-0.5 text-xs rounded font-medium ${co.age_group === '청년' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>{co.age_group}</span>
                    )}
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">{co.tech_field}</span>
                    {evalType && (
                      <span className={`px-1.5 py-0.5 text-xs rounded ${
                        evalType === '서류' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'
                      }`}>{evalType}</span>
                    )}
                  </div>
                  {ev && ev.score !== undefined && (
                    <span className="font-bold text-blue-700">{ev.adjusted_score ?? ev.score}점</span>
                  )}
                </div>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <div className="col-span-full py-16 text-center text-gray-400">
              {companies.length === 0
                ? '배정된 기업이 없습니다. 관리자에게 문의하세요.'
                : '검색 결과가 없습니다.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
