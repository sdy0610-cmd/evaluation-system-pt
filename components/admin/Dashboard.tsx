import React, { useEffect, useState } from 'react';
import { getCompanies, getDivisions } from '../../services/api';
import type { Company, Division } from '../../types';

interface Props { year: number; }

export default function Dashboard({ year }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([getCompanies(year), getDivisions(year)]).then(([cos, divs]) => {
      setCompanies(cos);
      setDivisions(divs);
      setLoading(false);
    });
  }, [year]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <div className="text-gray-400 text-sm">로딩 중...</div>
      </div>
    );
  }

  const active = companies.filter(c => !c.is_excluded);
  const exempt = active.filter(c => c.is_doc_exempt);
  const inDoc = active.filter(c => c.stage === '서류');
  const inPresentation = active.filter(c => c.stage === '발표');
  const passed = active.filter(c => c.result === '통과');
  const reserve = active.filter(c => c.result === '예비');
  const failed = active.filter(c => c.result === '탈락');

  const stats = [
    {
      label: '총 지원기업', value: companies.length,
      topColor: 'border-t-blue-500', text: 'text-blue-600',
      icon: <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
    },
    {
      label: '서류평가 면제', value: exempt.length,
      topColor: 'border-t-purple-500', text: 'text-purple-600',
      icon: <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
    },
    {
      label: '발표평가 진행', value: inPresentation.length,
      topColor: 'border-t-amber-500', text: 'text-amber-600',
      icon: <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"/></svg>
    },
    {
      label: '최종 통과+예비', value: passed.length + reserve.length,
      topColor: 'border-t-emerald-500', text: 'text-emerald-600',
      icon: <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>
    },
  ];

  return (
    <div className="p-8">
      {/* Page header */}
      <div className="mb-7 flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold text-blue-500 uppercase tracking-widest mb-1">Admin Dashboard</p>
          <h1 className="text-2xl font-bold text-gray-900">{year}년도 대시보드</h1>
          <p className="text-sm text-gray-400 mt-0.5">참여기업 선발 현황 개요</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400 mb-0.5">활성 기업</p>
          <p className="text-2xl font-bold text-gray-700">{active.length}<span className="text-sm font-normal text-gray-400 ml-1">개사</span></p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {stats.map(s => (
          <div key={s.label} className={`rounded-xl p-5 border border-gray-200 border-t-4 ${s.topColor} bg-white shadow-sm`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-500">{s.label}</span>
              <div className="p-1.5 bg-gray-50 rounded-lg">{s.icon}</div>
            </div>
            <div className={`text-3xl font-bold ${s.text}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Result summary */}
      <div className="grid grid-cols-3 gap-4 mb-7">
        {[
          { label: '통과', value: passed.length, bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
          { label: '예비', value: reserve.length, bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-600', dot: 'bg-orange-400' },
          { label: '탈락', value: failed.length, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600', dot: 'bg-red-400' },
        ].map(r => (
          <div key={r.label} className={`${r.bg} border ${r.border} rounded-xl p-4 flex items-center gap-4 shadow-sm`}>
            <div className={`w-2.5 h-2.5 rounded-full ${r.dot} flex-shrink-0`} />
            <div>
              <div className={`text-2xl font-bold ${r.text}`}>{r.value}</div>
              <div className={`text-xs font-semibold ${r.text} opacity-70 mt-0.5`}>{r.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Division table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-1 h-4 bg-blue-500 rounded-full" />
            <h2 className="font-semibold text-gray-800">분과별 현황</h2>
          </div>
          <span className="text-xs font-medium text-gray-500 bg-white border border-gray-200 px-2.5 py-1 rounded-full shadow-sm">{divisions.length}개 분과</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-700">
                {['분과', '위원장', '대상', '면제', '서류중', '발표중', '통과', '예비', '탈락'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-200 tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {divisions.map((div, idx) => {
                const cs = companies.filter(c => c.division_id === div.id && !c.is_excluded);
                return (
                  <tr key={div.id} className={`hover:bg-blue-50/40 transition-colors ${idx % 2 === 1 ? 'bg-gray-50/40' : 'bg-white'}`}>
                    <td className="px-4 py-3 font-semibold text-blue-700 text-xs">{div.division_name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{div.chair_name || '-'}</td>
                    <td className="px-4 py-3 font-semibold text-gray-700 text-xs">{cs.length}</td>
                    <td className="px-4 py-3 text-xs text-purple-600 font-medium">{cs.filter(c => c.is_doc_exempt).length}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{cs.filter(c => c.stage === '서류').length}</td>
                    <td className="px-4 py-3 text-xs text-amber-600 font-medium">{cs.filter(c => c.stage === '발표').length}</td>
                    <td className="px-4 py-3 text-xs text-emerald-600 font-semibold">{cs.filter(c => c.result === '통과').length}</td>
                    <td className="px-4 py-3 text-xs text-orange-500 font-medium">{cs.filter(c => c.result === '예비').length}</td>
                    <td className="px-4 py-3 text-xs text-red-500 font-medium">{cs.filter(c => c.result === '탈락').length}</td>
                  </tr>
                );
              })}
              {divisions.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400 text-sm">
                    분과가 없습니다. 분과를 먼저 등록해주세요.
                  </td>
                </tr>
              )}
            </tbody>
            {divisions.length > 0 && (
              <tfoot className="bg-slate-700 border-t-2 border-slate-600">
                <tr>
                  <td className="px-4 py-3 font-bold text-white text-xs" colSpan={2}>합계</td>
                  <td className="px-4 py-3 font-bold text-white text-xs">{active.length}</td>
                  <td className="px-4 py-3 font-bold text-purple-300 text-xs">{exempt.length}</td>
                  <td className="px-4 py-3 font-bold text-slate-300 text-xs">{inDoc.length}</td>
                  <td className="px-4 py-3 font-bold text-amber-300 text-xs">{inPresentation.length}</td>
                  <td className="px-4 py-3 font-bold text-emerald-300 text-xs">{passed.length}</td>
                  <td className="px-4 py-3 font-bold text-orange-300 text-xs">{reserve.length}</td>
                  <td className="px-4 py-3 font-bold text-red-300 text-xs">{failed.length}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
