import React, { useEffect, useState } from 'react';
import {
  getCompanies, getDivisions, getEvaluators, getEvaluations,
  getBonusPointsBulk, exportResultsExcel, calculateAvgScore
} from '../../services/api';
import type { Company, Division, Evaluator, Evaluation, BonusPoint } from '../../types';
import { Download, Printer } from 'lucide-react';

interface Props {
  year: number;
  user: Evaluator;
}

export default function Report({ year, user }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [bonusPoints, setBonusPoints] = useState<BonusPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [printDivId, setPrintDivId] = useState('');
  const [printEvalType, setPrintEvalType] = useState<'서류' | '발표'>('서류');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getCompanies(year),
      getDivisions(year),
      getEvaluators(year),
    ]).then(async ([cos, divs, evs]) => {
      setCompanies(cos);
      setDivisions(divs);
      setEvaluators(evs);
      if (cos.length > 0) {
        const [evData, bps] = await Promise.all([
          getEvaluations({ companyIds: cos.map(c => c.project_no) }),
          getBonusPointsBulk(cos.map(c => c.project_no)),
        ]);
        setEvaluations(evData);
        setBonusPoints(bps);
      }
      if (divs.length > 0) setPrintDivId(divs[0].id);
      setLoading(false);
    });
  }, [year]);

  async function handleExport() {
    setExporting(true);
    try {
      exportResultsExcel(companies, evaluators.filter(e => e.role !== 'admin'), evaluations, bonusPoints, year);
    } finally {
      setExporting(false);
    }
  }

  function handlePrintScorecard() {
    const div = divisions.find(d => d.id === printDivId);
    if (!div) return;

    const divEvs = evaluators
      .filter(e => e.division_id === printDivId && e.role !== 'admin')
      .sort((a, b) => (a.evaluator_order || 0) - (b.evaluator_order || 0));

    const divCos = companies.filter(c => c.division_id === printDivId && !c.is_excluded &&
      (printEvalType === '서류' ? true : (c.stage === '발표' || c.stage === '완료'))
    );

    const orderMap: Record<string, number> = {};
    divEvs.forEach(e => { if (e.evaluator_order) orderMap[e.id] = e.evaluator_order; });

    // company → evaluator_order → evaluation
    const evalMap: Record<string, Record<number, Evaluation>> = {};
    evaluations.filter(ev => ev.evaluation_type === printEvalType).forEach(ev => {
      const ord = orderMap[ev.evaluator_id] || 0;
      if (!evalMap[ev.company_id]) evalMap[ev.company_id] = {};
      evalMap[ev.company_id][ord] = ev;
    });

    const bonusMap: Record<string, number> = {};
    bonusPoints.forEach(bp => { bonusMap[bp.company_id] = (bonusMap[bp.company_id] || 0) + bp.points; });

    const win = window.open('', '_blank');
    if (!win) return;

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${year}년도 ${div.division_label}분과 ${printEvalType}평가 채점표</title>
<style>
  body { font-family: 'Malgun Gothic', sans-serif; font-size: 11px; margin: 0; padding: 0; }
  @page { size: A4 landscape; margin: 10mm; }
  .page { page-break-after: always; padding: 5mm; }
  .page:last-child { page-break-after: auto; }
  h2 { text-align: center; font-size: 16px; margin: 0 0 8px; }
  .meta { text-align: center; margin-bottom: 10px; font-size: 12px; color: #333; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { border: 1px solid #999; padding: 4px 6px; text-align: center; }
  th { background: #f0f0f0; font-weight: 600; }
  td.left { text-align: left; }
  .adj { text-decoration: line-through; color: #999; font-size: 9px; }
  .new { font-weight: bold; color: #1a56db; }
  .sig { margin-top: 20px; border: 1px solid #999; padding: 10px 20px; }
  .sig p { margin: 8px 0; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
<button class="no-print" onclick="window.print()" style="margin:10px;padding:8px 20px;background:#1a56db;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">인쇄</button>
${divEvs.map(ev => {
  const evEvals = divCos.map(co => ({
    co,
    evaluation: evalMap[co.project_no]?.[ev.evaluator_order!] || null,
  }));

  const rows = evEvals.map(({ co, evaluation }, idx) => {
    const score = evaluation ? (evaluation.adjusted_score ?? evaluation.score) : null;
    const origScore = evaluation?.score;
    const hasAdj = evaluation && evaluation.adjusted_score !== null && evaluation.adjusted_score !== undefined;
    return `<tr>
      <td>${idx + 1}</td>
      <td class="left">${co.project_no}</td>
      <td class="left">${co.representative}</td>
      <td class="left" style="max-width:150px">${co.project_title}</td>
      <td>${co.tech_field}</td>
      <td>${hasAdj ? `<span class="adj">${origScore}</span> <span class="new">${score}</span>` : (score ?? '-')}</td>
      <td>${(bonusMap[co.project_no] || 0) > 0 ? '+' + bonusMap[co.project_no] : '-'}</td>
      <td style="font-weight:bold">${score !== null ? ((score || 0) + (bonusMap[co.project_no] || 0)).toFixed(2) : '-'}</td>
      <td>${evaluation?.comment ? evaluation.comment.substring(0, 60) + (evaluation.comment.length > 60 ? '...' : '') : ''}</td>
    </tr>`;
  }).join('');

  return `<div class="page">
<h2>${year}년도 창업중심대학 참여기업 선발 ${printEvalType}평가 채점표</h2>
<div class="meta">
  분과: ${div.division_label} (${div.division_name}) &nbsp;|&nbsp;
  평가위원: 위원${ev.evaluator_order} ${ev.name} &nbsp;|&nbsp;
  평가단계: ${printEvalType}평가
</div>
<table>
  <thead>
    <tr>
      <th width="30">순번</th>
      <th width="85">과제번호</th>
      <th width="60">대표자명</th>
      <th>과제명</th>
      <th width="100">전문기술분야</th>
      <th width="50">점수</th>
      <th width="40">가점</th>
      <th width="55">최종점수</th>
      <th>평가의견</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="sig">
  <p>위 평가 결과가 사실임을 확인합니다.</p>
  <p>평가일: ${year}년 &nbsp;&nbsp; 월 &nbsp;&nbsp; 일</p>
  <p style="margin-top:20px">평가위원: ${ev.name} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; (서명)</p>
</div>
</div>`;
}).join('')}
</body>
</html>`;

    win.document.write(html);
    win.document.close();
  }

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">로딩 중...</div>;

  // Summary statistics
  const active = companies.filter(c => !c.is_excluded);
  const passed = active.filter(c => c.result === '통과');
  const reserve = active.filter(c => c.result === '예비');
  const failed = active.filter(c => c.result === '탈락');

  // Build score data for display
  const orderMap: Record<string, number> = {};
  evaluators.forEach(e => { if (e.evaluator_order) orderMap[e.id] = e.evaluator_order; });
  const evalMapAll: Record<string, Record<string, Record<number, number>>> = {};
  evaluations.forEach(ev => {
    if (!evalMapAll[ev.company_id]) evalMapAll[ev.company_id] = {};
    if (!evalMapAll[ev.company_id][ev.evaluation_type]) evalMapAll[ev.company_id][ev.evaluation_type] = {};
    const ord = orderMap[ev.evaluator_id] || 0;
    evalMapAll[ev.company_id][ev.evaluation_type][ord] = ev.adjusted_score ?? ev.score ?? 0;
  });
  const bonusMapAll: Record<string, number> = {};
  bonusPoints.forEach(bp => { bonusMapAll[bp.company_id] = (bonusMapAll[bp.company_id] || 0) + bp.points; });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">결과 보고서</h1>
          <p className="text-sm text-gray-500 mt-0.5">{year}년도 최종 결과</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-2">결과 Excel 내보내기</h3>
          <p className="text-sm text-gray-500 mb-4">서류평가, 발표평가, 종합, 통과 시트가 포함된 Excel 파일을 생성합니다.</p>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <Download size={15} />{exporting ? '생성 중...' : 'Excel 다운로드'}
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-2">채점표 인쇄</h3>
          <div className="flex gap-2 mb-3 flex-wrap">
            <select
              value={printDivId}
              onChange={e => setPrintDivId(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {divisions.map(d => <option key={d.id} value={d.id}>{d.division_name}</option>)}
            </select>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              {(['서류', '발표'] as const).map(t => (
                <button key={t} onClick={() => setPrintEvalType(t)}
                  className={`px-3 py-2 text-sm transition-colors ${printEvalType === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handlePrintScorecard}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Printer size={15} />채점표 인쇄 (새 탭)
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">종합 현황</h2>
        </div>
        <div className="grid grid-cols-4 divide-x divide-gray-100">
          {[
            { label: '총 지원기업', value: active.length, color: 'text-gray-900' },
            { label: '통과', value: passed.length, color: 'text-green-600' },
            { label: '예비', value: reserve.length, color: 'text-orange-500' },
            { label: '탈락', value: failed.length, color: 'text-red-500' },
          ].map(s => (
            <div key={s.label} className="p-6 text-center">
              <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-sm text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Division summary table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">분과별 최종 현황</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                {['분과', '분과명', '위원장', '대상', '면제', '통과', '예비', '탈락', '미결'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {divisions.map(div => {
                const cs = companies.filter(c => c.division_id === div.id && !c.is_excluded);
                const undecided = cs.filter(c => !c.result);
                return (
                  <tr key={div.id}>
                    <td className="px-4 py-3 font-bold text-blue-700">{div.division_name}</td>
                    <td className="px-4 py-3 text-gray-500">{div.chair_name || '-'}</td>
                    <td className="px-4 py-3 font-medium">{cs.length}</td>
                    <td className="px-4 py-3 text-purple-600">{cs.filter(c => c.is_doc_exempt).length}</td>
                    <td className="px-4 py-3 font-medium text-green-600">{cs.filter(c => c.result === '통과').length}</td>
                    <td className="px-4 py-3 font-medium text-orange-500">{cs.filter(c => c.result === '예비').length}</td>
                    <td className="px-4 py-3 font-medium text-red-500">{cs.filter(c => c.result === '탈락').length}</td>
                    <td className="px-4 py-3 text-gray-400">{undecided.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
