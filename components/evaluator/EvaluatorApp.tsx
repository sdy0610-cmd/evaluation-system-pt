import React, { useEffect, useState } from 'react';
import {
  getCompanies, getEvaluations, saveEvaluation, getFileUrl
} from '../../services/api';
import type { Evaluator, Company, Evaluation } from '../../types';
import { LogOut, X, ExternalLink, CheckCircle, Clock, Star, FileCheck } from 'lucide-react';

const PRES_CRITERIA = [
  {
    section: 1,
    name: '창업 아이템 혁신성 및 완성도',
    total: 35,
    items: [
      { key: '1-1', name: '혁신성 및 차별성', max: 20 },
      { key: '1-2', name: '아이템 완성도 및 기술성', max: 15 },
    ],
  },
  {
    section: 2,
    name: '사업화 역량 및 시장성',
    total: 30,
    items: [
      { key: '2-1', name: '목표시장 규모 및 성장가능성', max: 15 },
      { key: '2-2', name: '사업화 전략 및 수익모델', max: 15 },
    ],
  },
  {
    section: 3,
    name: '창업팀 역량',
    total: 25,
    items: [
      { key: '3-1', name: '창업자·팀 전문성', max: 15 },
      { key: '3-2', name: '실행 의지 및 역량', max: 10 },
    ],
  },
  {
    section: 4,
    name: '정책 목표 부합성',
    total: 10,
    items: [
      { key: '4-1', name: '고용·수출·사회적 가치 창출', max: 5 },
      { key: '4-2', name: '지원 분야 적합성', max: 5 },
    ],
  },
];

interface Props {
  user: Evaluator;
  onLogout: () => void;
}

type Filter = 'all' | 'done' | 'todo';

export default function EvaluatorApp({ user, onLogout }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Company | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<'all' | '서류' | '발표'>('all');

  // Evaluation form state
  const [score, setScore] = useState('');
  const [subScores, setSubScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');

  useEffect(() => {
    if (!user.division_id) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      getCompanies(user.year, user.division_id),
      getEvaluations({ evaluatorId: user.id }),
    ]).then(([cos, evs]) => {
      setCompanies(cos.filter(c => !c.is_excluded));
      setEvaluations(evs);
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
      if (type === '발표' && ev?.sub_scores && Object.keys(ev.sub_scores).length > 0) {
        const ss = ev.sub_scores as Record<string, number>;
        setSubScores(ss);
        const total = Object.values(ss).reduce((a, b) => a + b, 0);
        setScore(String(total));
      } else {
        setSubScores({});
        setScore(ev?.score !== undefined && ev?.score !== null ? String(ev.score) : '');
      }
      setComment(ev?.comment || '');
    } else {
      setScore('');
      setSubScores({});
      setComment('');
    }
    setSubmitMsg('');
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
        sub_scores: evalType === '발표' && Object.keys(subScores).length > 0 ? subScores : undefined,
        comment: comment.trim() || undefined,
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
  const pdfUrl = selected?.file_path ? getFileUrl(selected.file_path) : '';

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
            onClick={onLogout}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <LogOut size={15} />로그아웃
          </button>
        </div>
      </header>

      {/* Evaluation modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 z-50 flex">
          <div className="flex flex-col bg-white w-full h-full md:flex-row">
            {/* Left: PDF viewer */}
            <div className="flex-1 bg-gray-800 flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-900">
                <div className="text-white text-sm font-medium">
                  {selected.project_no} — {selected.representative}
                </div>
                <div className="flex items-center gap-2">
                  {pdfUrl && (
                    <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200">
                      <ExternalLink size={13} />새 탭에서 열기
                    </a>
                  )}
                  <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white p-1">
                    <X size={18} />
                  </button>
                </div>
              </div>
              {pdfUrl ? (
                <iframe src={pdfUrl} className="flex-1 w-full" title="사업계획서" />
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
                    {selectedEvalType === '발표' ? (
                      <div className="space-y-4">
                        {PRES_CRITERIA.map(section => {
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
                    ) : (
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
                  </>
                )}
              </div>

              {!isConfirmed && (
                <div className="px-6 pb-6 pt-2 border-t border-gray-100">
                  {submitMsg && (
                    <div className="mb-3 p-2.5 bg-green-50 text-green-700 text-sm rounded-lg text-center">
                      {submitMsg}
                    </div>
                  )}
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
                </div>
              )}
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
                  <div className="flex gap-1.5">
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
