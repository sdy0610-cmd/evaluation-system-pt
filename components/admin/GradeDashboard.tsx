import React from 'react';
import type { GradeSetting, Company, Division } from '../../types';
import { getGradeForScore } from '../../services/api';

interface Props {
  grades: GradeSetting[];
  companies: Company[];
  finalScores: Record<string, number>;
  divisions: Division[];
  showDivisions?: boolean;
}

export default function GradeDashboard({ grades, companies, finalScores, divisions, showDivisions = true }: Props) {
  if (grades.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 mb-6">
        등급 설정이 없습니다. 평가항목 설정 → 등급 탭에서 먼저 등록하세요.
      </div>
    );
  }

  const scoredCos = companies.filter(c => (finalScores[c.project_no] ?? 0) > 0);
  const sortedGrades = [...grades].sort((a, b) => b.min_score - a.min_score);

  interface Row {
    grade: GradeSetting | null;
    total: number;
    byDiv: Record<string, number>;
    youth: number;
    middle: number;
  }

  const rows: Row[] = sortedGrades.map(g => ({ grade: g, total: 0, byDiv: {}, youth: 0, middle: 0 }));
  rows.push({ grade: null, total: 0, byDiv: {}, youth: 0, middle: 0 });

  scoredCos.forEach(c => {
    const score = finalScores[c.project_no];
    const g = getGradeForScore(score, grades);
    const row = g ? rows.find(r => r.grade?.grade_name === g.grade_name)! : rows[rows.length - 1];
    row.total++;
    if (c.division_id) row.byDiv[c.division_id] = (row.byDiv[c.division_id] || 0) + 1;
    if (c.age_group === '청년') row.youth++;
    else if (c.age_group === '중장년') row.middle++;
  });

  const selRows = rows.filter(r => r.grade?.is_selected);
  const selTotal = selRows.reduce((s, r) => s + r.total, 0);
  const selYouth = selRows.reduce((s, r) => s + r.youth, 0);
  const selMiddle = selRows.reduce((s, r) => s + r.middle, 0);

  const lowestMin = sortedGrades[sortedGrades.length - 1]?.min_score ?? 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-semibold text-gray-900">등급 분포 현황</h2>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500">선정 합계 <span className="font-bold text-blue-700">{selTotal}개</span></span>
          <span className="text-blue-500 font-medium">청년 {selYouth}명</span>
          <span className="text-orange-500 font-medium">중장년 {selMiddle}명</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">등급</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">기준점수</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500">선정</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-blue-600 bg-blue-50">전체</th>
              {showDivisions && divisions.map(d => (
                <th key={d.id} title={d.division_name}
                  className="py-2.5 text-center font-medium text-gray-500 w-14"
                  style={{ fontSize: d.division_name.length > 6 ? '9px' : d.division_name.length > 4 ? '10px' : '11px', lineHeight: '1.3', whiteSpace: 'normal', wordBreak: 'keep-all', padding: '6px 4px' }}>
                  {d.division_name}
                </th>
              ))}
              <th className="px-4 py-2.5 text-center text-xs font-medium text-blue-500">청년</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-orange-500">중장년</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r, i) => (
              <tr key={i} className={r.grade?.is_selected ? 'bg-green-50' : 'hover:bg-gray-50'}>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                    r.grade?.is_selected ? 'bg-green-100 text-green-700' :
                    r.grade ? 'bg-gray-100 text-gray-600' : 'bg-red-50 text-red-400'
                  }`}>
                    {r.grade?.grade_name ?? '미해당'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500">
                  {r.grade ? `${r.grade.min_score}점 이상` : `${lowestMin - 1}점 미만`}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {r.grade?.is_selected
                    ? <span className="text-green-600 text-xs font-medium">✓ 선정</span>
                    : <span className="text-gray-300 text-xs">-</span>}
                </td>
                <td className="px-4 py-2.5 text-center font-bold text-blue-700 bg-blue-50">{r.total}</td>
                {showDivisions && divisions.map(d => (
                  <td key={d.id} className="py-2.5 text-center text-gray-600 text-xs w-14">{r.byDiv[d.id] || 0}</td>
                ))}
                <td className="px-4 py-2.5 text-center text-blue-600 font-medium">{r.youth > 0 ? r.youth : <span className="text-gray-300">-</span>}</td>
                <td className="px-4 py-2.5 text-center text-orange-600 font-medium">{r.middle > 0 ? r.middle : <span className="text-gray-300">-</span>}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
              <td className="px-4 py-2.5 text-gray-700 text-xs" colSpan={3}>합계</td>
              <td className="px-4 py-2.5 text-center text-blue-700 bg-blue-50">{scoredCos.length}</td>
              {showDivisions && divisions.map(d => (
                <td key={d.id} className="py-2.5 text-center text-gray-600 text-xs w-14">
                  {rows.reduce((s, r) => s + (r.byDiv[d.id] || 0), 0)}
                </td>
              ))}
              <td className="px-4 py-2.5 text-center text-blue-600">{rows.reduce((s, r) => s + r.youth, 0)}</td>
              <td className="px-4 py-2.5 text-center text-orange-600">{rows.reduce((s, r) => s + r.middle, 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
