import React, { useState } from 'react';
import type { Evaluator, AdminView } from '../../types';
import Dashboard from './Dashboard';
import DivisionsManager from './DivisionsManager';
import EvaluatorsManager from './EvaluatorsManager';
import CompaniesManager from './CompaniesManager';
import ScoreReview from './ScoreReview';
import Report from './Report';
import CriteriaManager from './CriteriaManager';
import SettingsManager from './SettingsManager';
import {
  LayoutDashboard, Building2, Users, Briefcase,
  ClipboardList, FileBarChart, LogOut, ChevronRight, ListChecks, Settings
} from 'lucide-react';

interface Props {
  user: Evaluator;
  onLogout: () => void;
}

const NAV: { view: AdminView; label: string; Icon: any }[] = [
  { view: 'dashboard', label: '대시보드', Icon: LayoutDashboard },
  { view: 'divisions', label: '분과 관리', Icon: Building2 },
  { view: 'evaluators', label: '평가위원 관리', Icon: Users },
  { view: 'companies', label: '기업 관리', Icon: Briefcase },
  { view: 'score-review', label: '점수 집계', Icon: ClipboardList },
  { view: 'report', label: '결과 보고서', Icon: FileBarChart },
  { view: 'criteria', label: '평가항목 설정', Icon: ListChecks },
  { view: 'settings', label: '설정', Icon: Settings },
];

export default function AdminApp({ user, onLogout }: Props) {
  const [view, setView] = useState<AdminView>('dashboard');
  const [year, setYear] = useState(2026);

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 bg-slate-900 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-slate-700">
          <p className="text-xs text-slate-400 mb-0.5">창업중심대학</p>
          <h1 className="text-white font-bold text-sm leading-tight">참여기업 선발 시스템</h1>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-slate-400">연도</span>
            <select
              value={year}
              onChange={e => setYear(+e.target.value)}
              className="bg-slate-800 text-white text-xs rounded px-2 py-1 border border-slate-600 focus:outline-none"
            >
              {[2026, 2025, 2024].map(y => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ view: v, label, Icon }) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                view === v
                  ? 'bg-blue-600 text-white font-medium shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon size={16} />
              <span>{label}</span>
              {view === v && <ChevronRight size={13} className="ml-auto opacity-70" />}
            </button>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-slate-700">
          <p className="text-xs text-slate-300 font-medium">{user.name}</p>
          <p className="text-xs text-slate-500 mb-3">관리자</p>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <LogOut size={13} />로그아웃
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-gray-50">
        {view === 'dashboard' && <Dashboard year={year} />}
        {view === 'divisions' && <DivisionsManager year={year} />}
        {view === 'evaluators' && <EvaluatorsManager year={year} />}
        {view === 'companies' && <CompaniesManager year={year} />}
        {view === 'score-review' && <ScoreReview year={year} user={user} />}
        {view === 'report' && <Report year={year} user={user} />}
        {view === 'criteria' && <CriteriaManager year={year} />}
        {view === 'settings' && <SettingsManager year={year} />}
      </main>
    </div>
  );
}
