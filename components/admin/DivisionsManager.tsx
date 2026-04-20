import React, { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { getDivisions, upsertDivision, deleteDivision, getEvaluators } from '../../services/api';
import type { Division, Evaluator } from '../../types';
import { Plus, Edit2, Trash2, X, Upload, Download } from 'lucide-react';

interface Props { year: number; }

const EMPTY_FORM = { division_label: '', division_name: '', chair_name: '' };

export default function DivisionsManager({ year }: Props) {
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; div?: Division } | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const [divs, evs] = await Promise.all([getDivisions(year), getEvaluators(year)]);
    setDivisions(divs);
    setEvaluators(evs.filter(e => e.role !== 'admin'));
    setLoading(false);
  }

  useEffect(() => { load(); }, [year]);

  function openAdd() {
    setForm(EMPTY_FORM);
    setError('');
    setModal({ mode: 'add' });
  }

  function openEdit(div: Division) {
    setForm({ division_label: div.division_label, division_name: div.division_name, chair_name: div.chair_name || '' });
    setError('');
    setModal({ mode: 'edit', div });
  }

  async function handleSave() {
    if (!form.division_name.trim()) {
      setError('분과명을 입력해주세요.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload: any = {
        year,
        division_label: form.division_label.trim(),
        division_name: form.division_name.trim(),
        chair_name: form.chair_name.trim() || null,
      };
      if (modal?.mode === 'edit' && modal.div) payload.id = modal.div.id;
      await upsertDivision(payload);
      setModal(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleDownloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ['분과라벨', '분과명', '위원장'],
      ['A', '정보·통신', '홍길동'],
      ['B', '기계·소재 / 에너지·자원', ''],
    ]);
    ws['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '분과목록');
    XLSX.writeFile(wb, `분과목록_템플릿_${year}.xlsx`);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
      if (rows.length === 0) { alert('데이터가 없습니다.'); return; }

      const parsed = rows.map((r, i) => {
        const label = String(r['분과라벨'] || r['분과 라벨'] || '').trim();
        const name = String(r['분과명'] || r['분과 명'] || '').trim();
        const chair = String(r['위원장'] || '').trim();
        if (!name) throw new Error(`${i + 2}행: 분과명이 없습니다.`);
        return { year, division_label: label, division_name: name, chair_name: chair || null };
      });

      for (const d of parsed) {
        await upsertDivision(d as any);
      }
      await load();
      alert(`${parsed.length}개 분과가 등록되었습니다.`);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(div: Division) {
    if (!confirm(`"${div.division_name}" 분과를 삭제하시겠습니까?`)) return;
    try {
      await deleteDivision(div.id);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">로딩 중...</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">분과 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">{year}년도 분과 구성</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleUpload} className="hidden" />
          <button onClick={handleDownloadTemplate}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            <Download size={15} />템플릿
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 border border-green-600 text-green-700 rounded-lg text-sm font-medium hover:bg-green-50 transition-colors disabled:opacity-50">
            <Upload size={15} />{uploading ? '업로드 중...' : '엑셀 업로드'}
          </button>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus size={15} />분과 추가
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-700">
              {['분과명', '위원장', '배정 평가위원', ''].map(h => (
                <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold text-slate-200 tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {divisions.map(div => {
              const divEvals = evaluators
                .filter(e => e.division_id === div.id)
                .sort((a, b) => (a.evaluator_order || 0) - (b.evaluator_order || 0));
              return (
                <tr key={div.id} className="hover:bg-gray-50">
                  <td className="px-5 py-4 font-bold text-blue-700 text-base">{div.division_name}</td>
                  <td className="px-5 py-4 text-gray-600">{div.chair_name || '-'}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1">
                      {divEvals.map(e => (
                        <span key={e.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                          위원{e.evaluator_order} {e.name}
                        </span>
                      ))}
                      {divEvals.length === 0 && <span className="text-gray-400 text-xs">배정 없음</span>}
                      {divEvals.length > 0 && divEvals.length < 5 && (
                        <span className="text-amber-600 text-xs ml-1">({divEvals.length}/5명)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => openEdit(div)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDelete(div)} className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {divisions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-gray-400 text-sm">
                  분과가 없습니다. 분과를 추가해주세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h3 className="font-bold text-lg text-gray-900">
                {modal.mode === 'add' ? '분과 추가' : '분과 수정'}
              </h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">분과명 *</label>
                <input
                  value={form.division_name}
                  onChange={e => setForm(f => ({ ...f, division_name: e.target.value }))}
                  placeholder="예: 정보·통신, 기계·소재 / 에너지·자원"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">위원장</label>
                <input
                  value={form.chair_name}
                  onChange={e => setForm(f => ({ ...f, chair_name: e.target.value }))}
                  placeholder="위원장 이름"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
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
    </div>
  );
}
