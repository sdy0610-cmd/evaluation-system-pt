import React, { useEffect, useState, useRef } from 'react';
import {
  getEvaluators, getDivisions, upsertEvaluator, deleteEvaluator
} from '../../services/api';
import type { Evaluator, Division } from '../../types';
import { Plus, Edit2, Trash2, X, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Props { year: number; }

const EMPTY_FORM = {
  id: '', name: '', password: '', division_id: '', evaluator_order: '', email: '', phone: ''
};

export default function EvaluatorsManager({ year }: Props) {
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; ev?: Evaluator } | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const [evs, divs] = await Promise.all([getEvaluators(year), getDivisions(year)]);
    setEvaluators(evs.filter(e => e.role !== 'admin'));
    setDivisions(divs);
    setLoading(false);
  }

  useEffect(() => { load(); }, [year]);

  function openAdd() {
    setForm(EMPTY_FORM);
    setError('');
    setModal({ mode: 'add' });
  }

  function openEdit(ev: Evaluator) {
    setForm({
      id: ev.id,
      name: ev.name,
      password: '',
      division_id: ev.division_id || '',
      evaluator_order: String(ev.evaluator_order || ''),
      email: ev.email || '',
      phone: ev.phone || '',
    });
    setError('');
    setModal({ mode: 'edit', ev });
  }

  async function handleSave() {
    if (!form.id.trim() || !form.name.trim()) {
      setError('아이디와 이름을 입력해주세요.');
      return;
    }
    if (modal?.mode === 'add' && !form.password.trim()) {
      setError('비밀번호를 입력해주세요.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload: any = {
        id: form.id.trim(),
        year,
        name: form.name.trim(),
        role: 'evaluator',
        division_id: form.division_id || null,
        evaluator_order: form.evaluator_order ? Number(form.evaluator_order) : null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
      };
      if (form.password.trim()) payload.password = form.password.trim();
      await upsertEvaluator(payload);
      setModal(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(ev: Evaluator) {
    if (!confirm(`"${ev.name}" 평가위원을 삭제하시겠습니까?`)) return;
    try {
      await deleteEvaluator(ev.id);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg('파싱 중...');
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][];

      if (rows.length < 2) { setImportMsg('데이터가 없습니다.'); return; }

      const headers = rows[0].map((h: any) => String(h ?? '').trim());
      const COL: Record<string, string> = {
        '아이디': 'id', '이름': 'name', '비밀번호': 'password',
        '분과': 'division_label', '위원순서': 'evaluator_order',
        '이메일': 'email', '연락처': 'phone',
      };

      const divLabelMap: Record<string, string> = {};
      divisions.forEach(d => { divLabelMap[d.division_label] = d.id; });

      let count = 0;
      const errors: string[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.every((c: any) => c === null || c === '')) continue;
        const obj: any = { year, role: 'evaluator' };
        headers.forEach((h, j) => {
          const field = COL[h];
          if (!field || row[j] == null) return;
          obj[field] = String(row[j]).trim();
        });
        if (!obj.id || !obj.name) { errors.push(`Row ${i + 1}: 아이디/이름 없음`); continue; }
        if (obj.division_label) {
          obj.division_id = divLabelMap[obj.division_label] || null;
          delete obj.division_label;
        }
        if (obj.evaluator_order) obj.evaluator_order = Number(obj.evaluator_order);
        try {
          await upsertEvaluator(obj);
          count++;
        } catch (err) {
          errors.push(`Row ${i + 1}: ${(err as Error).message}`);
        }
      }

      setImportMsg(`${count}명 등록 완료${errors.length > 0 ? ` (오류 ${errors.length}건)` : ''}`);
      await load();
    } catch (err) {
      setImportMsg(`오류: ${(err as Error).message}`);
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">로딩 중...</div>;

  // Group by division
  const grouped: Record<string, Evaluator[]> = {};
  const noDivision: Evaluator[] = [];
  evaluators.forEach(ev => {
    if (ev.division_id) {
      if (!grouped[ev.division_id]) grouped[ev.division_id] = [];
      grouped[ev.division_id].push(ev);
    } else {
      noDivision.push(ev);
    }
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">평가위원 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">{year}년도 평가위원 {evaluators.length}명</p>
        </div>
        <div className="flex gap-2">
          <div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleExcelImport} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              <Upload size={15} />Excel 일괄 등록
            </button>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={15} />위원 추가
          </button>
        </div>
      </div>

      {importMsg && (
        <div className="mb-4 p-3 bg-blue-50 text-blue-700 text-sm rounded-lg border border-blue-200">
          {importMsg}
        </div>
      )}

      {/* Excel format hint */}
      <div className="mb-6 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500">
        <span className="font-medium">Excel 열 순서:</span> 아이디 | 이름 | 비밀번호 | 분과 | 위원순서(1~5) | 이메일 | 연락처
      </div>

      {/* Grouped table */}
      {divisions.map(div => {
        const evs = (grouped[div.id] || []).sort((a, b) => (a.evaluator_order || 0) - (b.evaluator_order || 0));
        return (
          <div key={div.id} className="mb-6 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
              <span className="font-bold text-blue-800">{div.division_name}</span>
              <span className="text-xs text-blue-500">{div.division_label}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${evs.length === 5 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                {evs.length}/5명
              </span>
            </div>
            <EvaluatorTable evs={evs} onEdit={openEdit} onDelete={handleDelete} />
          </div>
        );
      })}

      {noDivision.length > 0 && (
        <div className="mb-6 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <span className="font-medium text-gray-600">미배정</span>
          </div>
          <EvaluatorTable evs={noDivision} onEdit={openEdit} onDelete={handleDelete} />
        </div>
      )}

      {evaluators.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
          평가위원이 없습니다. 추가하거나 Excel로 일괄 등록하세요.
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h3 className="font-bold text-lg">{modal.mode === 'add' ? '평가위원 추가' : '평가위원 수정'}</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">아이디 *</label>
                  <input
                    value={form.id}
                    onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
                    disabled={modal.mode === 'edit'}
                    placeholder="로그인 아이디"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">이름 *</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="평가위원 이름"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  비밀번호 {modal.mode === 'edit' && <span className="text-gray-400 font-normal">(비워두면 변경 안함)</span>}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="비밀번호"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">분과</label>
                  <select
                    value={form.division_id}
                    onChange={e => setForm(f => ({ ...f, division_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">분과 없음</option>
                    {divisions.map(d => (
                      <option key={d.id} value={d.id}>{d.division_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">위원 순서</label>
                  <select
                    value={form.evaluator_order}
                    onChange={e => setForm(f => ({ ...f, evaluator_order: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-</option>
                    {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>위원{n}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">이메일</label>
                <input
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="이메일 주소"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">연락처</label>
                <input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="010-0000-0000"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EvaluatorTable({
  evs,
  onEdit,
  onDelete,
}: {
  evs: Evaluator[];
  onEdit: (ev: Evaluator) => void;
  onDelete: (ev: Evaluator) => void;
}) {
  if (evs.length === 0) {
    return <div className="px-5 py-6 text-sm text-gray-400">배정된 평가위원이 없습니다.</div>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-gray-50 border-b border-gray-100">
          {['순서', '아이디', '이름', '이메일', '연락처', ''].map(h => (
            <th key={h} className="px-5 py-2.5 text-left text-xs font-medium text-gray-500">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {evs.map(ev => (
          <tr key={ev.id} className="hover:bg-gray-50">
            <td className="px-5 py-3">
              <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full">
                {ev.evaluator_order}
              </span>
            </td>
            <td className="px-5 py-3 font-mono text-xs text-gray-500">{ev.id}</td>
            <td className="px-5 py-3 font-medium text-gray-900">{ev.name}</td>
            <td className="px-5 py-3 text-gray-500">{ev.email || '-'}</td>
            <td className="px-5 py-3 text-gray-500">{ev.phone || '-'}</td>
            <td className="px-5 py-3">
              <div className="flex gap-2 justify-end">
                <button onClick={() => onEdit(ev)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded"><Edit2 size={14} /></button>
                <button onClick={() => onDelete(ev)} className="p-1.5 text-gray-400 hover:text-red-500 rounded"><Trash2 size={14} /></button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
