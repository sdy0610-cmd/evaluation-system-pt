import React, { useState } from 'react';
import { login } from './services/api';
import type { Evaluator, AppView } from './types';
import AdminApp from './components/admin/AdminApp';
import EvaluatorApp from './components/evaluator/EvaluatorApp';

export default function App() {
  const [view, setView] = useState<AppView>('login');
  const [user, setUser] = useState<Evaluator | null>(null);
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!id.trim() || !password.trim()) { setError('아이디와 비밀번호를 입력하세요.'); return; }
    setLoading(true);
    setError('');
    try {
      const evaluator = await login(id, password);
      setUser(evaluator);
      setView(evaluator.role === 'admin' ? 'admin' : 'evaluator');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    setUser(null);
    setView('login');
    setId('');
    setPassword('');
    setError('');
  }

  if (view === 'admin' && user) {
    return <AdminApp user={user} onLogout={handleLogout} />;
  }

  if (view === 'evaluator' && user) {
    return <EvaluatorApp user={user} onLogout={handleLogout} />;
  }

  // Login page
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 to-blue-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="relative bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 px-8 py-9 text-white overflow-hidden">
            {/* decorative circles */}
            <div className="absolute -top-6 -right-6 w-32 h-32 bg-white/10 rounded-full" />
            <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-white/5 rounded-full" />
            <div className="relative">
              <div className="flex items-center gap-1.5 mb-5">
                <div className="w-1 h-1 bg-blue-300 rounded-full" />
                <p className="text-xs text-blue-200 font-semibold tracking-widest uppercase">Sungkyunkwan University</p>
              </div>
              <div className="flex items-center gap-4 mb-5">
                <div className="w-12 h-12 bg-white/15 border border-white/20 rounded-2xl flex items-center justify-center shadow-inner">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3L2 9l10 6 10-6-10-6zM2 17l10 6 10-6M2 13l10 6 10-6" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-blue-200 leading-none mb-1">성균관대 창업지원단</p>
                  <h1 className="text-xl font-extrabold tracking-tight leading-tight">창업중심대학 평가시스템</h1>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-px bg-blue-400/60" />
                <p className="text-xs text-blue-200">평가위원 또는 관리자로 로그인하세요.</p>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} autoComplete="off" className="px-8 py-8 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">아이디</label>
              <input
                type="text"
                autoComplete="off"
                value={id}
                onChange={e => setId(e.target.value)}
                autoFocus
                placeholder="로그인 아이디"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">비밀번호</label>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="비밀번호"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 font-semibold text-sm transition-colors"
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
