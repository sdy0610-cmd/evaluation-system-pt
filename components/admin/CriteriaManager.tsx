import React, { useEffect, useState } from 'react';
import { getEvalCriteria, upsertEvalCriterion, deleteEvalCriterion, getGradeSettings, saveGradeSettings } from '../../services/api';
import type { EvalCriterion, GradeSetting } from '../../types';
import { Plus, Edit2, Trash2, X, Check } from 'lucide-react';

interface Props { year: number; }

type PageTab = '평가항목' | '등급설정';
type EvalTypeTab = '서류' | '발표';

const EMPTY_FORM = {
  section_no: 1,
  section_name: '',
  item_key: '',
  item_name: '',
  item_max: 10,
  sort_order: 0,
};

interface Section {
  section_no: number;
  section_name: string;
  items: EvalCriterion[];
}

export default function CriteriaManager({ year }: Props) {
  const [pageTab, setPageTab] = useState<PageTab>('평가항목');
  const [tab, setTab] = useState<EvalTypeTab>('서류');
  const [criteria, setCriteria] = useState<EvalCriterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; item?: EvalCriterion } | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Grade settings state
  const [grades, setGrades] = useState<GradeSetting[]>([]);
  const [gradeForm, setGradeForm] = useState({ grade_name: '', min_score: 0, is_selected: false });
  const [gradeModal, setGradeModal] = useState<{ mode: 'add' | 'edit'; id?: number } | null>(null);
  const [gradeSaving, setGradeSaving] = useState(false);

  async function loadGrades() {
    const data = await getGradeSettings(year);
    setGrades(data);
  }

  useEffect(() => { loadGrades(); }, [year]);

  async function load() {
    setLoading(true);
    const data = await getEvalCriteria(year, tab);
    setCriteria(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [year, tab]);

  const sections: Section[] = Object.values(
    criteria.reduce((acc, c) => {
      if (!acc[c.section_no]) acc[c.section_no] = { section_no: c.section_no, section_name: c.section_name, items: [] };
      acc[c.section_no].items.push(c);
      return acc;
    }, {} as Record<number, Section>)
  ).sort((a, b) => a.section_no - b.section_no);

  function openAdd(sectionNo?: number, sectionName?: string) {
    const secItems = criteria.filter(c => c.section_no === sectionNo);
    const nextKey = sectionNo ? `${sectionNo}-${secItems.length + 1}` : '';
    setForm({
      section_no: sectionNo ?? (sections.length + 1),
      section_name: sectionName ?? '',
      item_key: nextKey,
      item_name: '',
      item_max: 10,
      sort_order: secItems.length,
    });
    setError('');
    setModal({ mode: 'add' });
  }

  function openEdit(item: EvalCriterion) {
    setForm({
      section_no: item.section_no,
      section_name: item.section_name,
      item_key: item.item_key,
      item_name: item.item_name,
      item_max: item.item_max,
      sort_order: item.sort_order,
    });
    setError('');
    setModal({ mode: 'edit', item });
  }

  async function handleSave() {
    if (!form.section_name.trim()) { setError('섹션명을 입력하세요.'); return; }
    if (!form.item_key.trim()) { setError('항목 키를 입력하세요 (예: 1-1).'); return; }
    if (!form.item_name.trim()) { setError('항목명을 입력하세요.'); return; }
    if (form.item_max <= 0) { setError('배점은 1 이상이어야 합니다.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload: Partial<EvalCriterion> = { year, eval_type: tab, ...form };
      if (modal?.mode === 'edit' && modal.item) payload.id = modal.item.id;
      await upsertEvalCriterion(payload);
      setModal(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: EvalCriterion) {
    if (!confirm(`"${item.item_name}" 항목을 삭제하시겠습니까?`)) return;
    try {
      await deleteEvalCriterion(item.id!);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleGradeSave() {
    if (!gradeForm.grade_name.trim()) { alert('등급명을 입력하세요.'); return; }
    if (gradeForm.min_score < 0 || gradeForm.min_score > 100) { alert('기준점수는 0~100 사이여야 합니다.'); return; }
    setGradeSaving(true);
    try {
      let updated: Omit<GradeSetting, 'id'>[];
      if (gradeModal?.mode === 'edit' && gradeModal.id !== undefined) {
        updated = grades.map(g => g.id === gradeModal.id
          ? { year, grade_name: gradeForm.grade_name, min_score: gradeForm.min_score, is_selected: gradeForm.is_selected, sort_order: g.sort_order }
          : { year, grade_name: g.grade_name, min_score: g.min_score, is_selected: g.is_selected, sort_order: g.sort_order }
        );
      } else {
        updated = [
          ...grades.map(g => ({ year, grade_name: g.grade_name, min_score: g.min_score, is_selected: g.is_selected, sort_order: g.sort_order })),
          { year, grade_name: gradeForm.grade_name, min_score: gradeForm.min_score, is_selected: gradeForm.is_selected, sort_order: grades.length },
        ];
      }
      await saveGradeSettings(year, updated.sort((a, b) => b.min_score - a.min_score).map((g, i) => ({ ...g, sort_order: i })));
      setGradeModal(null);
      await loadGrades();
    } catch (e) {
      alert(`저장 실패: ${(e as Error).message}`);
    } finally {
      setGradeSaving(false);
    }
  }

  async function handleGradeDelete(g: GradeSetting) {
    if (!confirm(`"${g.grade_name}" 등급을 삭제하시겠습니까?`)) return;
    const updated = grades.filter(gr => gr.id !== g.id).map((gr, i) => ({ year, grade_name: gr.grade_name, min_score: gr.min_score, is_selected: gr.is_selected, sort_order: i }));
    await saveGradeSettings(year, updated);
    await loadGrades();
  }

  async function toggleGradeSelected(g: GradeSetting) {
    const updated = grades.map(gr => gr.id === g.id
      ? { year, grade_name: gr.grade_name, min_score: gr.min_score, is_selected: !gr.is_selected, sort_order: gr.sort_order }
      : { year, grade_name: gr.grade_name, min_score: gr.min_score, is_selected: gr.is_selected, sort_order: gr.sort_order }
    );
    await saveGradeSettings(year, updated);
    await loadGrades();
  }

  const totalPoints = criteria.reduce((s, c) => s + c.item_max, 0);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">평가항목 설정</h1>
          <p className="text-sm text-gray-500 mt-0.5">{year}년도 평가 세부항목 및 등급 관리</p>
        </div>
        {pageTab === '평가항목' && (
          <button onClick={() => openAdd()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus size={15} />항목 추가
          </button>
        )}
        {pageTab === '등급설정' && (
          <button onClick={() => { setGradeForm({ grade_name: '', min_score: 0, is_selected: false }); setGradeModal({ mode: 'add' }); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus size={15} />등급 추가
          </button>
        )}
      </div>

      {/* Page tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-6">
        {(['평가항목', '등급설정'] as PageTab[]).map(t => (
          <button key={t} onClick={() => setPageTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${pageTab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Grade Settings Panel ─────────────────────────────────────── */}
      {pageTab === '등급설정' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
            최종점수 기준으로 등급을 설정하고, <strong>선정</strong> 체크된 등급 이상의 기업이 점수집계 대시보드에 표시됩니다.
          </div>
          {grades.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">등록된 등급이 없습니다.</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['등급명', '기준점수 (이상)', '선정 등급', ''].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...grades].sort((a, b) => b.min_score - a.min_score).map(g => (
                    <tr key={g.id} className={g.is_selected ? 'bg-green-50' : 'hover:bg-gray-50'}>
                      <td className="px-5 py-3 font-medium text-gray-900">{g.grade_name}</td>
                      <td className="px-5 py-3 text-gray-700">{g.min_score}점</td>
                      <td className="px-5 py-3">
                        <button onClick={() => toggleGradeSelected(g)}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                            g.is_selected ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}>
                          {g.is_selected ? <><Check size={12} />선정</>: '미선정'}
                        </button>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => { setGradeForm({ grade_name: g.grade_name, min_score: g.min_score, is_selected: g.is_selected }); setGradeModal({ mode: 'edit', id: g.id }); }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors"><Edit2 size={13} /></button>
                          <button onClick={() => handleGradeDelete(g)} className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {pageTab === '평가항목' && <>
      <div className="flex items-center gap-4 mb-6">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {(['서류', '발표'] as EvalTypeTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}평가
            </button>
          ))}
        </div>
        {!loading && criteria.length > 0 && (
          <span className="text-sm text-gray-500">
            총 <span className="font-semibold text-blue-600">{totalPoints}점</span> · {criteria.length}개 항목
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12 text-sm">로딩 중...</div>
      ) : (
        <div className="space-y-4">
          {sections.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <div className="text-gray-400 text-sm mb-3">등록된 평가항목이 없습니다.</div>
              <button
                onClick={() => openAdd()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                <Plus size={14} />첫 항목 추가
              </button>
            </div>
          )}
          {sections.map(sec => {
            const sectionTotal = sec.items.reduce((s, it) => s + it.item_max, 0);
            return (
              <div key={sec.section_no} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 flex items-center justify-center bg-blue-600 text-white text-xs font-bold rounded-full">
                      {sec.section_no}
                    </span>
                    <span className="font-bold text-gray-800">{sec.section_name}</span>
                    <span className="text-sm text-blue-600 font-medium">({sectionTotal}점)</span>
                  </div>
                  <button
                    onClick={() => openAdd(sec.section_no, sec.section_name)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    <Plus size={12} />세부항목 추가
                  </button>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="px-5 py-2 text-left text-xs font-medium text-gray-400 w-20">키</th>
                      <th className="px-5 py-2 text-left text-xs font-medium text-gray-400">항목명</th>
                      <th className="px-5 py-2 text-center text-xs font-medium text-gray-400 w-28">배점</th>
                      <th className="px-5 py-2 w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sec.items
                      .sort((a, b) => a.sort_order - b.sort_order || a.item_key.localeCompare(b.item_key))
                      .map(item => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-5 py-3 font-mono text-xs text-gray-400">{item.item_key}</td>
                          <td className="px-5 py-3 text-gray-800">{item.item_name}</td>
                          <td className="px-5 py-3 text-center">
                            <span className="inline-block whitespace-nowrap px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                              {item.item_max}점
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => openEdit(item)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors">
                                <Edit2 size={13} />
                              </button>
                              <button onClick={() => handleDelete(item)} className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      </>}

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h3 className="font-bold text-lg text-gray-900">
                {modal.mode === 'add' ? '평가항목 추가' : '평가항목 수정'}
              </h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">섹션 번호 *</label>
                  <input
                    type="number"
                    min="1"
                    value={form.section_no}
                    onChange={e => setForm(f => ({ ...f, section_no: +e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">항목 키 *</label>
                  <input
                    value={form.item_key}
                    onChange={e => setForm(f => ({ ...f, item_key: e.target.value }))}
                    placeholder="예: 1-1, 2-3"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">섹션명 *</label>
                <input
                  value={form.section_name}
                  onChange={e => setForm(f => ({ ...f, section_name: e.target.value }))}
                  placeholder="예: 문제인식, 기술성 및 차별성"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">항목명 *</label>
                <input
                  value={form.item_name}
                  onChange={e => setForm(f => ({ ...f, item_name: e.target.value }))}
                  placeholder="예: 창업아이템 배경 및 필요성"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">배점 *</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={form.item_max}
                    onChange={e => setForm(f => ({ ...f, item_max: +e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">표시 순서</label>
                  <input
                    type="number"
                    min="0"
                    value={form.sort_order}
                    onChange={e => setForm(f => ({ ...f, sort_order: +e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
      {gradeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h3 className="font-bold text-lg text-gray-900">{gradeModal.mode === 'add' ? '등급 추가' : '등급 수정'}</h3>
              <button onClick={() => setGradeModal(null)} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">등급명 *</label>
                <input value={gradeForm.grade_name} onChange={e => setGradeForm(f => ({ ...f, grade_name: e.target.value }))}
                  placeholder="예: 탁월, 최우수, 우수, 보통"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">기준점수 (이상) *</label>
                <input type="number" min="0" max="100" value={gradeForm.min_score} onChange={e => setGradeForm(f => ({ ...f, min_score: +e.target.value }))}
                  placeholder="예: 90"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-xs text-gray-400 mt-1">이 점수 이상이면 해당 등급으로 분류됩니다.</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setGradeForm(f => ({ ...f, is_selected: !f.is_selected }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${gradeForm.is_selected ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  <Check size={14} />{gradeForm.is_selected ? '선정 등급' : '미선정'}
                </button>
                <span className="text-xs text-gray-400">선정 등급은 점수집계 대시보드에 표시됩니다.</span>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setGradeModal(null)} className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
              <button onClick={handleGradeSave} disabled={gradeSaving} className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {gradeSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
