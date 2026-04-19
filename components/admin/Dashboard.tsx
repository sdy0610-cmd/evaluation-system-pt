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
  const done = active.filter(c => c.stage === '완료');
  const passed = active.filter(c => c.result === '통과');
  const reserve = active.filter(c => c.result === '예비');
  const failed = active.filter(c => c.result === '탈락');

  const stats = [
    { label: '총 지원기업', value: companies.length, bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    { label: '서류평가 면제', value: exempt.length, bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
    { label: '발표평가 진행', value: inPresentation.length, bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    { label: '최종 통과+예비', value: passed.length + reserve.length, bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{year}년도 대시보드</h1>
        <p className="text-sm text-gray-500 mt-1">참여기업 선발 현황 개요</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(s => (
          <div key={s.label} className={`rounded-xl p-5 border ${s.bg} ${s.border}`}>
            <div className={`text-sm font-medium ${s.text} opacity-80`}>{s.label}</div>
            <div className={`text-3xl font-bold mt-1 ${s.text}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Result summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-green-700">{passed.length}</div>
          <div className="text-sm text-green-600 mt-1">통과</div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-orange-600">{reserve.length}</div>
          <div className="text-sm text-orange-500 mt-1">예비</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-red-600">{failed.length}</div>
          <div className="text-sm text-red-500 mt-1">탈락</div>
        </div>
      </div>

      {/* Division table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">분과별 현황</h2>
          <span className="text-sm text-gray-400">{divisions.length}개 분과</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                {['분과', '분과명', '위원장', '대상', '면제', '서류중', '발표중', '통과', '예비', '탈락'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {divisions.map(div => {
                const cs = companies.filter(c => c.division_id === div.id && !c.is_excluded);
                return (
                  <tr key={div.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-bold text-blue-700">{div.division_name}</td>
                    <td className="px-4 py-3 text-gray-500">{div.chair_name || '-'}</td>
                    <td className="px-4 py-3 font-medium">{cs.length}</td>
                    <td className="px-4 py-3 text-purple-600">{cs.filter(c => c.is_doc_exempt).length}</td>
                    <td className="px-4 py-3 text-gray-500">{cs.filter(c => c.stage === '서류').length}</td>
                    <td className="px-4 py-3 text-amber-600">{cs.filter(c => c.stage === '발표').length}</td>
                    <td className="px-4 py-3 font-medium text-green-600">{cs.filter(c => c.result === '통과').length}</td>
                    <td className="px-4 py-3 font-medium text-orange-500">{cs.filter(c => c.result === '예비').length}</td>
                    <td className="px-4 py-3 font-medium text-red-500">{cs.filter(c => c.result === '탈락').length}</td>
                  </tr>
                );
              })}
              {divisions.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-gray-400 text-sm">
                    분과가 없습니다. 분과를 먼저 등록해주세요.
                  </td>
                </tr>
              )}
            </tbody>
            {divisions.length > 0 && (
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td className="px-4 py-3 font-bold text-gray-700" colSpan={3}>합계</td>
                  <td className="px-4 py-3 font-bold">{active.length}</td>
                  <td className="px-4 py-3 font-bold text-purple-600">{exempt.length}</td>
                  <td className="px-4 py-3 font-bold text-gray-500">{inDoc.length}</td>
                  <td className="px-4 py-3 font-bold text-amber-600">{inPresentation.length}</td>
                  <td className="px-4 py-3 font-bold text-green-600">{passed.length}</td>
                  <td className="px-4 py-3 font-bold text-orange-500">{reserve.length}</td>
                  <td className="px-4 py-3 font-bold text-red-500">{failed.length}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
