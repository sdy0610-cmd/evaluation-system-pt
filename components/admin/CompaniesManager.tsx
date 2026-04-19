import React, { useEffect, useState, useRef } from 'react';
import {
  getCompanies, getDivisions, updateCompany, bulkUpsertCompanies,
  parseCompanyExcel, getBonusPointsBulk, upsertBonusPoint
} from '../../services/api';
import type { Company, Division, BonusPoint } from '../../types';
import { Upload, Edit2, X, Search, Filter, Star, AlertTriangle, FileCheck } from 'lucide-react';

interface Props { year: number; }

export default function CompaniesManager({ year }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [bonusMap, setBonusMap] = useState<Record<string, BonusPoint[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDiv, setFilterDiv] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [filterResult, setFilterResult] = useState('');
  const [modal, setModal] = useState<Company | null>(null);
  const [editForm, setEditForm] = useState<Partial<Company> & { bonuses: BonusPoint[] }>({ bonuses: [] });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const [cos, divs] = await Promise.all([getCompanies(year), getDivisions(year)]);
    setCompanies(cos);
    setDivisions(divs);
    if (cos.length > 0) {
      const bps = await getBonusPointsBulk(cos.map(c => c.project_no));
      const bm: Record<string, BonusPoint[]> = {};
      bps.forEach(bp => {
        if (!bm[bp.company_id]) bm[bp.company_id] = [];
        bm[bp.company_id].push(bp);
      });
      setBonusMap(bm);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [year]);

  function openEdit(co: Company) {
    const bonuses: BonusPoint[] = [
      bonusMap[co.project_no]?.find(b => b.bonus_type === '가점1') || { company_id: co.project_no, year, bonus_type: '가점1', points: 0, reason: '' },
      bonusMap[co.project_no]?.find(b => b.bonus_type === '가점2') || { company_id: co.project_no, year, bonus_type: '가점2', points: 0, reason: '' },
      bonusMap[co.project_no]?.find(b => b.bonus_type === '가점3') || { company_id: co.project_no, year, bonus_type: '가점3', points: 0, reason: '' },
    ];
    setEditForm({ ...co, bonuses });
    setModal(co);
  }

  async function handleSave() {
    if (!modal) return;
    setSaving(true);
    try {
      const { bonuses, ...rest } = editForm as any;
      await updateCompany(modal.project_no, rest);
      for (const bp of bonuses) {
        if (bp.points > 0 || bp.reason) {
          await upsertBonusPoint({ ...bp, company_id: modal.project_no, year });
        }
      }
      setModal(null);
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMsg('파싱 중...');
    try {
      const { parsed, errors } = await parseCompanyExcel(file, year);

      // Auto-assign division by tech_field
      const divMap: Record<string, string> = {};
      // build a field→division_id map from existing companies or manual mapping
      // For now, we'll rely on the division_id in the Excel or leave unassigned

      await bulkUpsertCompanies(parsed);
      setImportMsg(`${parsed.length}개 기업 등록 완료${errors.length > 0 ? ` (오류: ${errors.slice(0, 3).join(', ')})` : ''}`);
      await load();
    } catch (err) {
      setImportMsg(`오류: ${(err as Error).message}`);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const filtered = companies.filter(c => {
    if (filterDiv && c.division_id !== filterDiv) return false;
    if (filterStage && c.stage !== filterStage) return false;
    if (filterResult && c.result !== filterResult) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.project_no.includes(q) ||
        c.representative.toLowerCase().includes(q) ||
        c.project_title.toLowerCase().includes(q) ||
        (c.tech_field || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">로딩 중...</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">기업 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">총 {companies.length}개 기업 등록</p>
        </div>
        <div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleExcelImport} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <Upload size={15} />{importing ? '가져오는 중...' : 'Excel 가져오기'}
          </button>
        </div>
      </div>

      {importMsg && (
        <div className="mb-4 p-3 bg-blue-50 text-blue-700 text-sm rounded-lg border border-blue-200">
          {importMsg}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="과제번호, 대표자, 과제명 검색"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterDiv}
          onChange={e => setFilterDiv(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">전체 분과</option>
          {divisions.map(d => <option key={d.id} value={d.id}>{d.division_name}</option>)}
          <option value="none">미배정</option>
        </select>
        <select
          value={filterStage}
          onChange={e => setFilterStage(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">전체 단계</option>
          <option value="서류">서류평가</option>
          <option value="발표">발표평가</option>
          <option value="완료">완료</option>
        </select>
        <select
          value={filterResult}
          onChange={e => setFilterResult(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">전체 결과</option>
          <option value="통과">통과</option>
          <option value="예비">예비</option>
          <option value="탈락">탈락</option>
        </select>
        <span className="flex items-center text-sm text-gray-500 px-2">{filtered.length}건</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['과제번호', '대표자명', '과제명', '전문기술분야', '분과', '단계', '결과', '특수상태', '가점', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.slice(0, 200).map(co => {
                const bps = bonusMap[co.project_no] || [];
                const bonusTotal = bps.reduce((s, b) => s + (b.points || 0), 0);
                return (
                  <tr key={co.project_no} className={`hover:bg-gray-50 ${co.is_excluded ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{co.project_no}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{co.representative}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-48 truncate" title={co.project_title}>{co.project_title}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{co.tech_field}</td>
                    <td className="px-4 py-3">
                      {co.division ? (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">{co.division.division_name}</span>
                      ) : (
                        <span className="text-gray-400 text-xs">미배정</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        co.stage === '서류' ? 'bg-gray-100 text-gray-600' :
                        co.stage === '발표' ? 'bg-amber-100 text-amber-700' :
                        'bg-green-100 text-green-700'
                      }`}>{co.stage}</span>
                    </td>
                    <td className="px-4 py-3">
                      {co.result ? (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          co.result === '통과' ? 'bg-green-100 text-green-700' :
                          co.result === '예비' ? 'bg-orange-100 text-orange-700' :
                          'bg-red-100 text-red-600'
                        }`}>{co.result}</span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {co.is_legend && <span title="레전드" className="text-amber-500"><Star size={13} /></span>}
                        {co.is_excluded && <span title="제외" className="text-red-400"><AlertTriangle size={13} /></span>}
                        {co.is_doc_exempt && <span title="서류면제" className="text-purple-500"><FileCheck size={13} /></span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {bonusTotal > 0 ? `+${bonusTotal}` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openEdit(co)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded"><Edit2 size={14} /></button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                    {companies.length === 0 ? 'Excel로 기업 명단을 가져오세요.' : '검색 결과가 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 200 && (
          <div className="px-4 py-3 bg-amber-50 text-amber-700 text-xs border-t border-amber-200">
            200건 초과 — 필터를 좁혀주세요. (전체 {filtered.length}건)
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
              <div>
                <h3 className="font-bold text-lg text-gray-900">{modal.project_no}</h3>
                <p className="text-sm text-gray-500">{modal.representative} — {modal.project_title}</p>
              </div>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Division assignment */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">분과 배정</label>
                <select
                  value={editForm.division_id || ''}
                  onChange={e => setEditForm(f => ({ ...f, division_id: e.target.value || undefined }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">미배정</option>
                  {divisions.map(d => <option key={d.id} value={d.id}>{d.division_label} - {d.division_name}</option>)}
                </select>
              </div>

              {/* Stage & Result */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">평가 단계</label>
                  <select
                    value={editForm.stage || '서류'}
                    onChange={e => setEditForm(f => ({ ...f, stage: e.target.value as any }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="서류">서류평가</option>
                    <option value="발표">발표평가</option>
                    <option value="완료">완료</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">결과</label>
                  <select
                    value={editForm.result || ''}
                    onChange={e => setEditForm(f => ({ ...f, result: (e.target.value || null) as any }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-</option>
                    <option value="통과">통과</option>
                    <option value="예비">예비</option>
                    <option value="탈락">탈락</option>
                  </select>
                </div>
              </div>

              {/* Checkboxes */}
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!editForm.is_legend}
                    onChange={e => setEditForm(f => ({ ...f, is_legend: e.target.checked }))}
                    className="w-4 h-4 rounded text-amber-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><Star size={14} className="text-amber-500" />레전드 기업</span>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!editForm.is_doc_exempt}
                    onChange={e => setEditForm(f => ({ ...f, is_doc_exempt: e.target.checked }))}
                    className="w-4 h-4 rounded text-purple-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><FileCheck size={14} className="text-purple-500" />서류평가 면제</span>
                  </div>
                </label>
                {editForm.is_doc_exempt && (
                  <input
                    value={editForm.doc_exempt_reason || ''}
                    onChange={e => setEditForm(f => ({ ...f, doc_exempt_reason: e.target.value }))}
                    placeholder="면제 사유"
                    className="w-full ml-7 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!editForm.is_excluded}
                    onChange={e => setEditForm(f => ({ ...f, is_excluded: e.target.checked }))}
                    className="w-4 h-4 rounded text-red-400"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><AlertTriangle size={14} className="text-red-400" />평가 제외</span>
                  </div>
                </label>
                {editForm.is_excluded && (
                  <input
                    value={editForm.exclusion_reason || ''}
                    onChange={e => setEditForm(f => ({ ...f, exclusion_reason: e.target.value }))}
                    placeholder="제외 사유"
                    className="w-full ml-7 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>

              {/* Bonus points */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">가점</label>
                <div className="space-y-3">
                  {(editForm.bonuses || []).map((bp, i) => (
                    <div key={bp.bonus_type} className="flex gap-3 items-start">
                      <div className="w-16 text-sm font-medium text-gray-600 pt-2.5">{bp.bonus_type}</div>
                      <input
                        value={bp.reason || ''}
                        onChange={e => setEditForm(f => ({
                          ...f,
                          bonuses: f.bonuses!.map((b, idx) => idx === i ? { ...b, reason: e.target.value } : b)
                        }))}
                        placeholder="가점 사유"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.5"
                        value={bp.points || 0}
                        onChange={e => setEditForm(f => ({
                          ...f,
                          bonuses: f.bonuses!.map((b, idx) => idx === i ? { ...b, points: parseFloat(e.target.value) || 0 } : b)
                        }))}
                        className="w-20 border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-500 pt-2.5">점</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">비고</label>
                <textarea
                  value={editForm.notes || ''}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
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
