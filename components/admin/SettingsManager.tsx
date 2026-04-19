import React, { useRef, useState } from 'react';
import { resetYearEvalData, exportYearEvalData, importYearEvalData } from '../../services/api';
import { AlertTriangle, Download, Upload, RotateCcw, CheckCircle } from 'lucide-react';

interface Props { year: number; }

export default function SettingsManager({ year }: Props) {
  const [resetting, setResetting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [resetStep, setResetStep] = useState<0 | 1>(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function showMsg(type: 'success' | 'error', text: string) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  }

  async function handleReset() {
    if (resetStep === 0) { setResetStep(1); return; }
    setResetting(true);
    try {
      await resetYearEvalData(year);
      setResetStep(0);
      showMsg('success', '평가 데이터가 초기화되었습니다.');
    } catch (e) {
      showMsg('error', (e as Error).message);
    } finally {
      setResetting(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const data = await exportYearEvalData(year);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `평가백업_${year}년도_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showMsg('success', '백업 파일이 다운로드되었습니다.');
    } catch (e) {
      showMsg('error', (e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  async function handleImport(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.version || !data.year) throw new Error('올바른 백업 파일이 아닙니다.');
      if (!confirm(`${data.year}년도 백업 파일을 복원합니다.\n기존 데이터에 덮어씌워집니다. 계속하시겠습니까?`)) return;
      await importYearEvalData(data);
      showMsg('success', `${data.year}년도 데이터가 복원되었습니다.`);
    } catch (e) {
      showMsg('error', (e as Error).message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-gray-900">설정</h1>
        <p className="text-sm text-gray-500 mt-0.5">평가 시스템 관리</p>
      </div>

      {msg && (
        <div className={`mb-6 flex items-center gap-2 p-4 rounded-xl text-sm font-medium ${
          msg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {msg.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          {msg.text}
        </div>
      )}

      <div className="space-y-4">
        {/* 백업 저장 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Download size={16} className="text-blue-600" />
                <h2 className="font-semibold text-gray-900">평가 데이터 저장 (백업)</h2>
              </div>
              <p className="text-sm text-gray-500">
                현재 기업 정보, 평가 점수, 가점 데이터를 JSON 파일로 내보냅니다.
                다른 환경에서 복원하거나 보관용으로 사용할 수 있습니다.
              </p>
            </div>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="shrink-0 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Download size={14} />
              {exporting ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>

        {/* 백업 불러오기 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Upload size={16} className="text-green-600" />
                <h2 className="font-semibold text-gray-900">평가 데이터 불러오기 (복원)</h2>
              </div>
              <p className="text-sm text-gray-500">
                이전에 저장한 JSON 백업 파일을 업로드하여 데이터를 복원합니다.
                기존 데이터에 덮어씌워지므로 주의하세요.
              </p>
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="shrink-0 flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Upload size={14} />
              {importing ? '복원 중...' : '불러오기'}
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); }}
          />
        </div>

        {/* 초기화 */}
        <div className="bg-white rounded-xl border border-red-200 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <RotateCcw size={16} className="text-red-500" />
                <h2 className="font-semibold text-gray-900">평가 초기화</h2>
              </div>
              <p className="text-sm text-gray-500">
                기업 목록, 평가위원, 분과, 평가 점수, 평가항목을 모두 삭제합니다.
                초기화 후 분과·평가위원·기업 업로드·평가항목을 처음부터 다시 설정할 수 있습니다.
                <br />
                <span className="text-red-500 font-medium">이 작업은 되돌릴 수 없습니다.</span> 초기화 전에 백업을 먼저 저장하세요.
              </p>
              {resetStep === 1 && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
                  ⚠️ 정말 삭제하시겠습니까? 아래 버튼을 다시 클릭하면 초기화됩니다.
                </div>
              )}
            </div>
            <div className="shrink-0 flex flex-col gap-2">
              <button
                onClick={handleReset}
                disabled={resetting}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                  resetStep === 1
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                }`}
              >
                <RotateCcw size={14} />
                {resetting ? '초기화 중...' : resetStep === 1 ? '확인 — 초기화 실행' : '초기화'}
              </button>
              {resetStep === 1 && (
                <button
                  onClick={() => setResetStep(0)}
                  className="text-xs text-gray-400 hover:text-gray-600 text-center"
                >
                  취소
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
