import React, { useEffect, useState, useMemo } from 'react';
import {
  getDivisions, getCompanies, getEvaluators, getEvaluations,
  getBonusPointsBulk, adjustScore, confirmEvaluations, updateCompany,
  upsertBonusPoint, calculateAvgScore, toggleKnockout, getGradeSettings, getGradeForScore, getEvalCriteria
} from '../../services/api';
import type { Division, Company, Evaluator, Evaluation, BonusPoint, GradeSetting, EvalCriterion } from '../../types';
import { X, Check, AlertCircle, ChevronUp, ChevronDown, Download } from 'lucide-react';

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
import * as XLSX from 'xlsx';
import GradeDashboard from './GradeDashboard';

interface Props {
  year: number;
  user: Evaluator;
}

interface ScoreRow {
  company: Company;
  evals: (Evaluation | null)[];  // index 0 = evaluator_order 1, etc.
  scores: (number | null)[];
  avg: number;
  bonusTotal: number;
  final: number;
  hasKnockout: boolean;
  allConfirmed: boolean;
}

export default function ScoreReview({ year, user }: Props) {
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedDivId, setSelectedDivId] = useState('');
  const [evalType, setEvalType] = useState<'서류' | '발표'>('서류');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [bonusMap, setBonusMap] = useState<Record<string, BonusPoint[]>>({});
  const [loading, setLoading] = useState(false);
  const [adjModal, setAdjModal] = useState<{ ev: Evaluation; company: Company } | null>(null);
  const [adjScore, setAdjScore] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjSaving, setAdjSaving] = useState(false);
  const [bonusModal, setBonusModal] = useState<{ company: Company; bonuses: BonusPoint[] } | null>(null);
  const [bonusSaving, setBonusSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [opinionModal, setOpinionModal] = useState<{ company: Company; evals: (Evaluation | null)[] } | null>(null);
  const [allEvaluators, setAllEvaluators] = useState<Evaluator[]>([]);
  const [sortKey, setSortKey] = useState<string>('final');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [grades, setGrades] = useState<GradeSetting[]>([]);
  const [showDashboard, setShowDashboard] = useState(true);
  const [gradeRecruitFilter, setGradeRecruitFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [advancingSelected, setAdvancingSelected] = useState(false);
  const [criteria, setCriteria] = useState<{ doc: CriteriaSection[]; pres: CriteriaSection[] }>({ doc: [], pres: [] });
  const [scoreDetailModal, setScoreDetailModal] = useState<{ ev: Evaluation; company: Company } | null>(null);

  useEffect(() => {
    getDivisions(year).then(setDivisions);
    getGradeSettings(year).then(setGrades);
    Promise.all([getEvalCriteria(year, '서류'), getEvalCriteria(year, '발표')]).then(([doc, pres]) => {
      setCriteria({ doc: buildSections(doc as EvalCriterion[]), pres: buildSections(pres as EvalCriterion[]) });
    });
  }, [year]);

  useEffect(() => {
    loadData();
  }, [selectedDivId, evalType, year]);

  async function loadData() {
    setLoading(true);
    try {
      const [cos, evs] = await Promise.all([
        getCompanies(year, selectedDivId || undefined),
        getEvaluators(year),
      ]);
      const nonAdmin = evs.filter(e => e.role !== 'admin');
      setAllEvaluators(nonAdmin);
      const divEvs = selectedDivId
        ? nonAdmin.filter(e => e.division_id === selectedDivId)
            .sort((a, b) => (a.evaluator_order || 0) - (b.evaluator_order || 0))
        : [];
      setEvaluators(divEvs);

      const filtered = cos.filter(c => !c.is_excluded && (
        evalType === '서류' ? true : (c.stage === '발표' || c.stage === '완료')
      ));
      setCompanies(filtered);

      const [evData, bps] = await Promise.all([
        getEvaluations({ companyIds: filtered.map(c => c.project_no), type: evalType }),
        getBonusPointsBulk(filtered.map(c => c.project_no)),
      ]);
      setEvaluations(evData);

      const bm: Record<string, BonusPoint[]> = {};
      bps.forEach(bp => {
        if (!bm[bp.company_id]) bm[bp.company_id] = [];
        bm[bp.company_id].push(bp);
      });
      setBonusMap(bm);
    } finally {
      setLoading(false);
    }
  }

  const maxEvalCount = useMemo(() => {
    if (selectedDivId) return evaluators.length;
    return allEvaluators.length > 0
      ? Math.max(...allEvaluators.map(e => e.evaluator_order || 0))
      : 0;
  }, [selectedDivId, evaluators, allEvaluators]);

  const rows = useMemo<ScoreRow[]>(() => {
    const evalMap: Record<string, Record<string, Evaluation>> = {};
    evaluations.forEach(ev => {
      if (!evalMap[ev.company_id]) evalMap[ev.company_id] = {};
      evalMap[ev.company_id][ev.evaluator_id] = ev;
    });

    return companies.map(co => {
      const companyEvs = selectedDivId
        ? evaluators
        : allEvaluators
            .filter(e => e.division_id === co.division_id)
            .sort((a, b) => (a.evaluator_order || 0) - (b.evaluator_order || 0));

      const evals: (Evaluation | null)[] = companyEvs.map(ev =>
        evalMap[co.project_no]?.[ev.id] || null
      );

      const scores: (number | null)[] = evals.map(ev => {
        if (!ev || ev.is_avoidance) return null;
        return ev.adjusted_score ?? ev.score ?? null;
      });

      const avg = calculateAvgScore(scores);
      const bps = bonusMap[co.project_no] || [];
      const bonusTotal = bps.reduce((s, b) => s + (b.points || 0), 0);
      const hasKnockout = evals.some(ev => ev?.is_knockout);
      const allConfirmed = evals.filter(ev => ev !== null).length > 0 &&
        evals.every(ev => ev === null || ev.is_confirmed);

      return {
        company: co,
        evals,
        scores,
        avg,
        bonusTotal,
        final: avg + bonusTotal,
        hasKnockout,
        allConfirmed,
      };
    });
  }, [companies, evaluators, allEvaluators, evaluations, bonusMap, selectedDivId]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir(key === 'final' || key === 'avg' || key.startsWith('ev-') ? 'desc' : 'asc'); }
  }

  const sortedRows = useMemo(() => {
    const numericKeys = new Set(['avg', 'final', 'bonus', 'knockout', 'confirmed']);
    const resultOrder: Record<string, number> = { '통과': 0, '예비': 1, '탈락': 2, '': 3 };

    return [...rows].sort((a, b) => {
      const dir = sortDir === 'desc' ? -1 : 1;

      if (sortKey === 'avg') return dir * (b.avg - a.avg);
      if (sortKey === 'final') return dir * (b.final - a.final);
      if (sortKey === 'bonus') return dir * (b.bonusTotal - a.bonusTotal);
      if (sortKey === 'knockout') return dir * (Number(b.hasKnockout) - Number(a.hasKnockout));
      if (sortKey === 'confirmed') return dir * (Number(b.allConfirmed) - Number(a.allConfirmed));
      if (sortKey.startsWith('ev-')) {
        const idx = parseInt(sortKey.replace('ev-', '')) - 1;
        const va = a.scores[idx] ?? -1, vb = b.scores[idx] ?? -1;
        return dir * (vb - va);
      }
      if (sortKey === 'result') {
        const ra = resultOrder[a.company.result || ''] ?? 3;
        const rb = resultOrder[b.company.result || ''] ?? 3;
        return dir * (ra - rb);
      }

      // String columns
      let sa = '', sb = '';
      if (sortKey === 'project_no') { sa = a.company.project_no; sb = b.company.project_no; }
      else if (sortKey === 'division') { sa = a.company.division?.division_name || ''; sb = b.company.division?.division_name || ''; }
      else if (sortKey === 'representative') { sa = a.company.representative; sb = b.company.representative; }
      else if (sortKey === 'recruit_type') { sa = a.company.recruit_type || ''; sb = b.company.recruit_type || ''; }
      else if (sortKey === 'startup_stage') { sa = a.company.startup_stage || ''; sb = b.company.startup_stage || ''; }
      else if (sortKey === 'age_group') { sa = a.company.age_group || ''; sb = b.company.age_group || ''; }
      else if (sortKey === 'project_title') { sa = a.company.project_title; sb = b.company.project_title; }
      return dir * sa.localeCompare(sb, 'ko');
    });
  }, [rows, sortKey, sortDir]);

  function openAdjModal(ev: Evaluation, company: Company) {
    if (ev.is_confirmed) return;
    setAdjScore(String(ev.adjusted_score ?? ev.score ?? ''));
    setAdjReason(ev.adjustment_reason || '');
    setAdjModal({ ev, company });
  }

  async function handleAdjust() {
    if (!adjModal || !adjModal.ev.id) return;
    const sc = parseFloat(adjScore);
    if (isNaN(sc) || sc < 0 || sc > 100) {
      alert('0~100 사이의 점수를 입력하세요.');
      return;
    }
    if (!adjReason.trim()) {
      alert('수정 사유를 입력하세요.');
      return;
    }
    setAdjSaving(true);
    try {
      await adjustScore(adjModal.ev.id!, sc, user.id, adjReason);
      setAdjModal(null);
      await loadData();
    } finally {
      setAdjSaving(false);
    }
  }

  async function handleToggleKnockout(ev: Evaluation) {
    if (!ev.id || ev.is_confirmed) return;
    await toggleKnockout(ev.id, !ev.is_knockout);
    await loadData();
  }

  async function handleSetResult(co: Company, result: string) {
    await updateCompany(co.project_no, { result: (result || null) as any });
    setCompanies(prev => prev.map(c => c.project_no === co.project_no ? { ...c, result: (result || null) as any } : c));
  }

  function handleExportExcel() {
    const rows: Record<string, unknown>[] = [];
    companies.forEach((co, idx) => {
      evaluators.forEach(ev => {
        const evl = evaluations.find(e => e.company_id === co.project_no && e.evaluator_id === ev.id);
        rows.push({
          '과제번호': co.project_no,
          '과제명': co.project_title,
          '진행연차': year,
          '과제진행순번': idx + 1,
          '위원인력ID': ev.login_id || ev.id,
          '위원명': ev.name,
          '위원역할': ev.evaluator_order === 1 ? '평가위원장' : '평가위원',
          '점수': evl ? (evl.adjusted_score ?? evl.score ?? '') : '',
          '의견': evl?.comment || '',
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'sheet');
    XLSX.writeFile(wb, `평가결과_${year}_${evalType}_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  async function handleConfirmAll() {
    if (!confirm(`${evalType}평가 점수를 확정하시겠습니까? 확정 후 수정이 불가합니다.`)) return;
    setConfirming(true);
    try {
      const ids = companies.map(c => c.project_no);
      await confirmEvaluations(ids, evalType, user.id);
      await loadData();
    } finally {
      setConfirming(false);
    }
  }

  async function handleAdvanceToPresentation() {
    const targets = selected.size > 0
      ? companies.filter(c => selected.has(c.project_no))
      : companies;
    if (targets.length === 0) return;
    if (!confirm(`${targets.length}개 기업을 발표평가 단계로 이동하시겠습니까?`)) return;
    setAdvancing(true);
    try {
      for (const co of targets) await updateCompany(co.project_no, { stage: '발표' });
      setSelected(new Set());
      await loadData();
    } finally {
      setAdvancing(false);
    }
  }

  async function handleAdvanceSelected() {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}개 기업을 발표평가 단계로 이동하시겠습니까?`)) return;
    setAdvancingSelected(true);
    try {
      for (const id of selected) await updateCompany(id, { stage: '발표' });
      setSelected(new Set());
      await loadData();
    } finally {
      setAdvancingSelected(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleSelectAll() {
    if (selected.size === filteredSortedRows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredSortedRows.map(r => r.company.project_no)));
    }
  }

  function openBonusModal(co: Company) {
    const bps = bonusMap[co.project_no] || [];
    const bonuses: BonusPoint[] = [
      bps.find(b => b.bonus_type === '가점1') || { company_id: co.project_no, year, bonus_type: '가점1', points: 0, reason: '' },
      bps.find(b => b.bonus_type === '가점2') || { company_id: co.project_no, year, bonus_type: '가점2', points: 0, reason: '' },
      bps.find(b => b.bonus_type === '가점3') || { company_id: co.project_no, year, bonus_type: '가점3', points: 0, reason: '' },
    ];
    setBonusModal({ company: co, bonuses });
  }

  async function handleSaveBonus() {
    if (!bonusModal) return;
    setBonusSaving(true);
    try {
      for (const bp of bonusModal.bonuses) {
        await upsertBonusPoint({ ...bp, company_id: bonusModal.company.project_no, year });
      }
      setBonusModal(null);
      await loadData();
    } finally {
      setBonusSaving(false);
    }
  }

  const filteredSortedRows = useMemo(() =>
    gradeRecruitFilter
      ? sortedRows.filter(r => r.company.recruit_type === gradeRecruitFilter)
      : sortedRows,
  [sortedRows, gradeRecruitFilter]);

  const confirmedCount = filteredSortedRows.filter(r => r.allConfirmed).length;
  const totalWithScores = filteredSortedRows.filter(r => r.scores.some(s => s !== null)).length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">점수 집계</h1>
          <p className="text-sm text-gray-500 mt-0.5">{year}년도 점수 검토 및 확정</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {evalType === '서류' && selected.size > 0 && (
            <button
              onClick={handleAdvanceSelected}
              disabled={advancingSelected}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
            >
              {advancingSelected ? '이동 중...' : `선택 ${selected.size}개 발표평가 이동 →`}
            </button>
          )}
          {evalType === '서류' && (
            <button
              onClick={handleAdvanceToPresentation}
              disabled={advancing}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
            >
              {advancing ? '이동 중...' : '발표평가 단계로 이동 →'}
            </button>
          )}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
          >
            <Download size={14} />결과 엑셀 내보내기
          </button>
          <button
            onClick={handleConfirmAll}
            disabled={confirming || totalWithScores === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {confirming ? '확정 중...' : '전체 점수 확정'}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3 mb-5 items-center flex-wrap">
        <select
          value={selectedDivId}
          onChange={e => setSelectedDivId(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">전체</option>
          {divisions.map(d => (
            <option key={d.id} value={d.id}>{d.division_name}</option>
          ))}
        </select>

        <div className="flex rounded-lg border border-gray-300 overflow-hidden">
          {(['서류', '발표'] as const).map(t => (
            <button
              key={t}
              onClick={() => setEvalType(t)}
              className={`px-5 py-2 text-sm font-medium transition-colors ${
                evalType === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t}평가
            </button>
          ))}
        </div>

        {!loading && (
          <span className="text-sm text-gray-500">
            {companies.length}개 기업 · 채점완료 {totalWithScores}개 · 확정 {confirmedCount}개
          </span>
        )}
      </div>

      {loading && (
        <div className="py-12 text-center text-gray-400 text-sm">로딩 중...</div>
      )}

      {!loading && grades.length > 0 && (
        <div className="mb-2">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <button onClick={() => setShowDashboard(d => !d)} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
              {showDashboard ? '▲ 등급 분포 숨기기' : '▼ 등급 분포 보기'}
            </button>
            {showDashboard && (() => {
              const recruitTypes = [...new Set(companies.map(c => c.recruit_type).filter(Boolean))].sort();
              return recruitTypes.length > 1 ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400 mr-1">모집공고</span>
                  {['', ...recruitTypes].map(rt => (
                    <button key={rt}
                      onClick={() => setGradeRecruitFilter(rt)}
                      className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${gradeRecruitFilter === rt ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}
                    >{rt || '전체'}</button>
                  ))}
                </div>
              ) : null;
            })()}
          </div>
          {showDashboard && (() => {
            const finalScores = Object.fromEntries(rows.map(r => [r.company.project_no, r.final]));
            const filteredCos = gradeRecruitFilter
              ? companies.filter(c => c.recruit_type === gradeRecruitFilter)
              : companies;
            return (
              <GradeDashboard
                grades={grades}
                companies={filteredCos}
                finalScores={finalScores}
                divisions={divisions}
                showDivisions={!selectedDivId}
              />
            );
          })()}
        </div>
      )}

      {!loading && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-700">
                  <th className="px-2 py-2.5 text-center w-8">
                    <input type="checkbox"
                      checked={filteredSortedRows.length > 0 && selected.size === filteredSortedRows.length}
                      onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 rounded cursor-pointer accent-blue-400"
                    />
                  </th>
                  <th className="px-2 py-2.5 text-center text-xs font-semibold text-slate-200 tracking-wide w-8">순위</th>
                  {[
                    { key: 'project_no', label: '과제번호', cls: 'w-24 text-left' },
                    { key: 'division',   label: '분과',   cls: 'w-28 text-left' },
                    { key: 'representative', label: '대표자', cls: 'w-16 text-left' },
                    { key: 'recruit_type',   label: '모집공고', cls: 'w-16 text-left' },
                    { key: 'startup_stage',  label: '창업단계', cls: 'w-16 text-center' },
                    { key: 'age_group',  label: '청/중',  cls: 'w-14 text-center' },
                    { key: 'project_title',  label: '과제명', cls: 'min-w-48 text-left' },
                  ].map(col => (
                    <th key={col.key}
                      className={`px-2 py-2.5 text-xs font-semibold cursor-pointer select-none hover:bg-slate-600 transition-colors whitespace-nowrap tracking-wide ${col.cls} ${sortKey === col.key ? 'text-blue-300' : 'text-slate-200'}`}
                      onClick={() => toggleSort(col.key)}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        {col.label}
                        {sortKey === col.key ? (sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />) : null}
                      </span>
                    </th>
                  ))}
                  {selectedDivId
                    ? evaluators.map(ev => (
                        <th
                          key={ev.id}
                          style={{ width: 56, minWidth: 56 }}
                          className={`px-1 py-2.5 text-center text-xs font-semibold cursor-pointer select-none hover:bg-slate-600 transition-colors tracking-wide ${sortKey === `ev-${ev.evaluator_order}` ? 'text-blue-300' : 'text-slate-200'}`}
                          onClick={() => toggleSort(`ev-${ev.evaluator_order}`)}
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="font-bold">위원{ev.evaluator_order}</span>
                            <span className="font-normal text-slate-400 truncate w-full text-center" style={{ maxWidth: 52 }} title={ev.name}>{ev.name}</span>
                            {sortKey === `ev-${ev.evaluator_order}` && (sortDir === 'desc' ? <ChevronDown size={10} /> : <ChevronUp size={10} />)}
                          </div>
                        </th>
                      ))
                    : Array.from({ length: maxEvalCount }).map((_, i) => (
                        <th
                          key={`all-ev-${i}`}
                          style={{ width: 48, minWidth: 48 }}
                          className={`px-1 py-2.5 text-center text-xs font-semibold cursor-pointer select-none hover:bg-slate-600 transition-colors tracking-wide ${sortKey === `ev-${i + 1}` ? 'text-blue-300' : 'text-slate-200'}`}
                          onClick={() => toggleSort(`ev-${i + 1}`)}
                        >
                          <span className="font-bold">위원{i + 1}</span>
                          {sortKey === `ev-${i + 1}` && (sortDir === 'desc' ? <ChevronDown size={10} /> : <ChevronUp size={10} />)}
                        </th>
                      ))
                  }
                  {selectedDivId && Array.from({ length: Math.max(0, 5 - evaluators.length) }).map((_, i) => (
                    <th key={`pad-${i}`} style={{ width: 56, minWidth: 56 }} className="px-1 py-2.5 text-center text-xs font-semibold text-slate-500">위원{evaluators.length + i + 1}</th>
                  ))}
                  <th
                    className={`px-3 py-2.5 text-center text-xs font-semibold cursor-pointer select-none hover:bg-slate-600 transition-colors whitespace-nowrap tracking-wide ${sortKey === 'avg' ? 'text-blue-300' : 'text-amber-300'}`}
                    onClick={() => toggleSort('avg')}
                  >
                    <div className="flex items-center justify-center gap-0.5">
                      평점{sortKey === 'avg' && (sortDir === 'desc' ? <ChevronDown size={10} /> : <ChevronUp size={10} />)}
                    </div>
                  </th>
                  <th className={`px-3 py-2.5 text-center text-xs font-semibold cursor-pointer select-none hover:bg-slate-600 transition-colors whitespace-nowrap tracking-wide ${sortKey === 'bonus' ? 'text-blue-300' : 'text-slate-200'}`} onClick={() => toggleSort('bonus')}>
                    <span className="inline-flex items-center gap-0.5">가점{sortKey === 'bonus' ? (sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />) : null}</span>
                  </th>
                  <th
                    className={`px-3 py-2.5 text-center text-xs font-semibold cursor-pointer select-none hover:bg-slate-600 transition-colors whitespace-nowrap tracking-wide ${sortKey === 'final' ? 'text-blue-300' : 'text-emerald-300'}`}
                    onClick={() => toggleSort('final')}
                  >
                    <div className="flex items-center justify-center gap-0.5">
                      최종{sortKey === 'final' && (sortDir === 'desc' ? <ChevronDown size={10} /> : <ChevronUp size={10} />)}
                    </div>
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-200 whitespace-nowrap tracking-wide">등급</th>
                  {[
                    { key: 'knockout', label: '과락' },
                    { key: 'result',   label: '결과' },
                    { key: 'opinion',  label: '평가의견' },
                    { key: 'confirmed', label: '확정' },
                  ].map(col => (
                    <th key={col.key}
                      className={`px-3 py-2.5 text-center text-xs font-semibold cursor-pointer select-none hover:bg-slate-600 transition-colors whitespace-nowrap tracking-wide ${col.key === 'result' ? 'min-w-20' : ''} ${sortKey === col.key ? 'text-blue-300' : 'text-slate-200'}`}
                      onClick={() => toggleSort(col.key)}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        {col.label}
                        {sortKey === col.key ? (sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />) : null}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSortedRows.map((row, idx) => {
                  const rank = row.hasKnockout ? '-' : idx + 1 - filteredSortedRows.slice(0, idx).filter(r => r.hasKnockout).length;
                  const co = row.company;
                  return (
                    <tr
                      key={co.project_no}
                      className={`hover:bg-gray-50 ${row.hasKnockout ? 'bg-red-50' : ''} ${selected.has(co.project_no) ? 'bg-blue-50' : ''}`}
                    >
                      <td className="px-2 py-3 text-center">
                        <input type="checkbox"
                          checked={selected.has(co.project_no)}
                          onChange={() => toggleSelect(co.project_no)}
                          className="w-3.5 h-3.5 rounded cursor-pointer accent-blue-600"
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        {row.hasKnockout ? (
                          <span className="text-xs text-red-500 font-medium">과락</span>
                        ) : (
                          <span className="font-bold text-gray-700">{rank}</span>
                        )}
                      </td>
                      <td className="px-2 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                        {co.project_no}
                        {co.is_legend && <span className="ml-1 text-amber-500">★</span>}
                        {co.is_doc_exempt && <span className="ml-1 text-purple-500 text-xs">면제</span>}
                      </td>
                      <td className="px-2 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {co.division?.division_name || '-'}
                      </td>
                      <td className="px-2 py-3 font-medium text-gray-900 text-xs whitespace-nowrap">{co.representative}</td>
                      <td className="px-2 py-3 text-xs text-gray-500 whitespace-nowrap" title={co.recruit_type || ''}>
                        {co.recruit_type ? co.recruit_type.slice(0, 2) : '-'}
                      </td>
                      <td className="px-2 py-3 text-xs text-center whitespace-nowrap">
                        {co.startup_stage ? (
                          <span className={`font-medium ${co.startup_stage.includes('예비') ? 'text-green-600' : co.startup_stage.includes('초기') ? 'text-blue-600' : co.startup_stage.includes('도약') ? 'text-purple-600' : 'text-gray-500'}`}>
                            {co.startup_stage.includes('예비') ? '예비' : co.startup_stage.includes('초기') ? '초기' : co.startup_stage.includes('도약') ? '도약' : co.startup_stage}
                          </span>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-2 py-3 text-center whitespace-nowrap">
                        {co.age_group ? (
                          <span className={`text-xs font-medium ${co.age_group === '청년' ? 'text-blue-600' : 'text-orange-600'}`}>{co.age_group}</span>
                        ) : <span className="text-gray-300 text-xs">-</span>}
                      </td>
                      <td className="px-2 py-3 text-gray-600 text-xs" title={co.project_title}>{co.project_title}</td>

                      {(() => {
                        const validScores = row.scores.filter((s): s is number => s !== null && s !== undefined);
                        const hasMinMax = validScores.length >= 5;
                        const minScore = hasMinMax ? Math.min(...validScores) : null;
                        const maxScore = hasMinMax ? Math.max(...validScores) : null;
                        const colCount = selectedDivId ? evaluators.length : maxEvalCount;
                        return Array.from({ length: colCount }).map((_, evIdx) => {
                          const evaluation = row.evals[evIdx] ?? null;
                          const hasAdj = evaluation && evaluation.adjusted_score !== null && evaluation.adjusted_score !== undefined;
                          const displayScore = evaluation ? (evaluation.adjusted_score ?? evaluation.score) : null;
                          const origScore = evaluation?.score;
                          const isMin = hasMinMax && displayScore !== null && displayScore === minScore;
                          const isMax = hasMinMax && displayScore !== null && displayScore === maxScore;
                          return (
                            <td
                              key={`ev-cell-${evIdx}`}
                              style={!selectedDivId ? { width: 48, minWidth: 48 } : undefined}
                              className={`px-1 py-3 text-center ${
                                selectedDivId && evaluation && !evaluation.is_avoidance ? 'cursor-pointer hover:bg-blue-50' : ''
                              } ${evaluation?.is_knockout ? 'bg-red-100' : ''} ${evaluation?.is_avoidance ? 'bg-orange-50' : ''}`}
                              onClick={() => selectedDivId && evaluation && !evaluation.is_avoidance && setScoreDetailModal({ ev: evaluation, company: co })}
                            >
                              {evaluation?.is_avoidance ? (
                                <span className="text-xs font-medium text-orange-600">회피</span>
                              ) : displayScore !== null && displayScore !== undefined ? (
                                <div className="space-y-0.5">
                                  {hasAdj && (
                                    <div className="text-xs text-gray-400 line-through">{origScore}</div>
                                  )}
                                  <div className={`font-medium text-xs ${
                                    isMax ? 'text-blue-600' : isMin ? 'text-red-500' : hasAdj ? 'text-blue-700' : 'text-gray-800'
                                  }`}>
                                    {displayScore}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-gray-300 text-xs">-</span>
                              )}
                            </td>
                          );
                        });
                      })()}

                      {selectedDivId && Array.from({ length: Math.max(0, 5 - evaluators.length) }).map((_, i) => (
                        <td key={`pad-${i}`} className="px-1 py-3 text-center text-gray-300 text-xs">-</td>
                      ))}

                      <td className="px-3 py-3 text-center bg-blue-50 font-semibold text-blue-800">
                        {row.avg > 0 ? row.avg.toFixed(2) : '-'}
                      </td>
                      <td
                        className="px-3 py-3 text-center cursor-pointer hover:bg-gray-100 text-green-700 font-medium"
                        onClick={() => openBonusModal(co)}
                      >
                        {row.bonusTotal > 0 ? `+${row.bonusTotal}` : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-3 py-3 text-center bg-blue-50 font-bold text-blue-900">
                        {row.final > 0 ? row.final.toFixed(2) : '-'}
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        {(() => { const g = row.final > 0 ? getGradeForScore(row.final, grades) : null; return g ? (
                          <span className={`text-xs font-semibold ${g.is_selected ? 'text-green-700' : 'text-gray-600'}`}>{g.grade_name}</span>
                        ) : <span className="text-gray-300 text-xs">-</span>; })()}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => {
                            const nonConfirmedEv = row.evals.find(ev => ev && !ev.is_confirmed);
                            if (nonConfirmedEv) handleToggleKnockout(nonConfirmedEv);
                          }}
                          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                            row.hasKnockout
                              ? 'bg-red-500 text-white hover:bg-red-600'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {row.hasKnockout ? '과락' : '-'}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <select
                          value={co.result || ''}
                          onChange={e => handleSetResult(co, e.target.value)}
                          className={`text-xs rounded px-1.5 py-1 border focus:outline-none ${
                            co.result === '통과' ? 'bg-green-100 text-green-700 border-green-300' :
                            co.result === '예비' ? 'bg-orange-100 text-orange-600 border-orange-300' :
                            co.result === '탈락' ? 'bg-red-100 text-red-600 border-red-300' :
                            'bg-gray-100 text-gray-500 border-gray-300'
                          }`}
                        >
                          <option value="">-</option>
                          <option value="통과">통과</option>
                          <option value="예비">예비</option>
                          <option value="탈락">탈락</option>
                        </select>
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => setOpinionModal({ company: co, evals: row.evals })}
                          title="평가의견 보기"
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-500 hover:bg-indigo-100 hover:text-indigo-600 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        </button>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {row.allConfirmed ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 bg-green-500 text-white rounded-full">
                            <Check size={12} />
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredSortedRows.length === 0 && (
                  <tr>
                    <td colSpan={20} className="px-4 py-12 text-center text-gray-400">
                      {divisions.length === 0
                        ? '분과를 먼저 등록해주세요.'
                        : `${evalType === '발표' ? '발표평가 대상 기업이 없습니다. 서류평가 탭에서 통과/예비 기업을 발표평가로 이동하세요.' : '이 분과의 기업이 없습니다.'}`
                      }
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Score Detail Modal */}
      {scoreDetailModal && (() => {
        const { ev, company } = scoreDetailModal;
        const ss = ev.sub_scores as Record<string, number> | undefined;
        const sections = evalType === '서류' ? criteria.doc : criteria.pres;
        const displayScore = ev.adjusted_score ?? ev.score ?? 0;
        const hasAdj = ev.adjusted_score !== null && ev.adjusted_score !== undefined;
        const evaluatorName = ev.evaluator?.name || '위원';
        const evaluatorOrder = ev.evaluator?.evaluator_order;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <p className="text-xs text-gray-400">{company.project_no}</p>
                  <h3 className="font-bold text-gray-900 text-sm leading-tight">{company.project_title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {evaluatorOrder ? `위원${evaluatorOrder} ` : ''}{evaluatorName} · {evalType}평가
                    {ev.is_confirmed && <span className="ml-1.5 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">확정됨</span>}
                  </p>
                </div>
                <button onClick={() => setScoreDetailModal(null)} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
              </div>
              <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
                {sections.length > 0 && ss && Object.keys(ss).length > 0 ? (
                  <>
                    {sections.map(sec => {
                      const secTotal = sec.items.reduce((s, it) => s + (ss[it.key] ?? 0), 0);
                      return (
                        <div key={sec.section} className="border border-gray-200 rounded-xl overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
                            <span className="text-xs font-semibold text-gray-700">{sec.section}. {sec.name}</span>
                            <span className="text-xs font-bold text-blue-700">{secTotal} / {sec.total}점</span>
                          </div>
                          <div className="divide-y divide-gray-100">
                            {sec.items.map(item => (
                              <div key={item.key} className="flex items-center justify-between px-4 py-2">
                                <span className="text-xs text-gray-600 flex-1">{item.key}. {item.name}</span>
                                <span className="text-xs text-gray-400 mr-3">/{item.max}점</span>
                                <span className={`text-sm font-bold w-10 text-right ${ss[item.key] !== undefined ? 'text-blue-700' : 'text-gray-300'}`}>
                                  {ss[item.key] !== undefined ? ss[item.key] : '-'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <div className="text-sm text-gray-500 text-center py-4">항목별 점수 기록 없음</div>
                )}
                {ev.comment && (
                  <div className="border border-gray-200 rounded-xl p-3">
                    <div className="text-xs font-semibold text-gray-500 mb-1">평가의견</div>
                    <div className="text-sm text-gray-700 whitespace-pre-wrap">{ev.comment}</div>
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">최종 점수</span>
                  <div className="text-right">
                    {hasAdj && <div className="text-xs text-gray-400 line-through">{ev.score}점 (원점수)</div>}
                    <span className={`text-2xl font-bold ${hasAdj ? 'text-blue-700' : 'text-gray-900'}`}>{displayScore}점</span>
                    {hasAdj && ev.adjustment_reason && (
                      <div className="text-xs text-orange-600 mt-0.5">수정사유: {ev.adjustment_reason}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Score Adjustment Modal */}
      {adjModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900">점수 수정</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {adjModal.company.representative} — {adjModal.ev.evaluator?.name}
                </p>
              </div>
              <button onClick={() => setAdjModal(null)} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-700">원점수</label>
                  <span className="text-lg font-bold text-gray-400">{adjModal.ev.score ?? '-'}</span>
                </div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">수정 점수 *</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={adjScore}
                  onChange={e => setAdjScore(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">수정 사유 *</label>
                <textarea
                  value={adjReason}
                  onChange={e => setAdjReason(e.target.value)}
                  rows={3}
                  placeholder="수정 사유를 입력하세요"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg text-xs text-amber-700">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>원점수는 보존되며 수정 내역이 기록됩니다.</span>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setAdjModal(null)} className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
              <button onClick={handleAdjust} disabled={adjSaving} className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {adjSaving ? '저장 중...' : '수정 저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bonus Modal */}
      {bonusModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900">가점 입력</h3>
                <p className="text-xs text-gray-500 mt-0.5">{bonusModal.company.project_no} — {bonusModal.company.representative}</p>
              </div>
              <button onClick={() => setBonusModal(null)} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {bonusModal.bonuses.map((bp, i) => (
                <div key={bp.bonus_type} className="flex gap-3 items-center">
                  <span className="w-14 text-sm font-medium text-gray-600 shrink-0">{bp.bonus_type}</span>
                  <input
                    value={bp.reason || ''}
                    onChange={e => setBonusModal(m => m ? {
                      ...m,
                      bonuses: m.bonuses.map((b, idx) => idx === i ? { ...b, reason: e.target.value } : b)
                    } : null)}
                    placeholder="가점 사유"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.5"
                    value={bp.points}
                    onChange={e => setBonusModal(m => m ? {
                      ...m,
                      bonuses: m.bonuses.map((b, idx) => idx === i ? { ...b, points: parseFloat(e.target.value) || 0 } : b)
                    } : null)}
                    className="w-16 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-500">점</span>
                </div>
              ))}
              <div className="pt-2 border-t border-gray-100 flex justify-between text-sm">
                <span className="text-gray-600">합계</span>
                <span className="font-bold text-green-700">
                  +{bonusModal.bonuses.reduce((s, b) => s + (b.points || 0), 0)}점
                </span>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setBonusModal(null)} className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
              <button onClick={handleSaveBonus} disabled={bonusSaving} className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                {bonusSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opinion Modal */}
      {opinionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <p className="text-xs text-gray-400">{opinionModal.company.project_no}</p>
                <h3 className="font-bold text-gray-900">{opinionModal.company.project_title}</h3>
              </div>
              <button onClick={() => setOpinionModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={16} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              {evaluators.map((ev, i) => {
                const evl = opinionModal.evals[i];
                const score = evl ? (evl.adjusted_score ?? evl.score) : null;
                const xo = (evl?.extra_opinions as Record<string, string>) || {};
                return (
                  <div key={ev.id} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-500">위원{ev.evaluator_order}</span>
                        <span className="text-sm font-semibold text-gray-800">{ev.name}</span>
                      </div>
                      <span className={`text-sm font-bold ${score !== null ? 'text-blue-700' : 'text-gray-300'}`}>
                        {score !== null ? `${score}점` : '미평가'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 min-h-[40px] whitespace-pre-wrap">
                      {evl?.comment || <span className="text-gray-300 text-xs">평가의견 없음</span>}
                    </div>
                    {(xo['주력산업_일치여부'] || xo['주력산업_의견']) && (
                      <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-sm">
                        <span className="font-semibold text-indigo-700">주력산업 일치여부: </span>
                        <span className="text-indigo-600">{xo['주력산업_일치여부'] || '-'}</span>
                        {xo['주력산업_의견'] && <span className="text-gray-600 ml-2">{xo['주력산업_의견']}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
