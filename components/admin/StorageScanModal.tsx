import React, { useEffect, useState } from 'react';
import { X, RefreshCw, CheckCircle, AlertCircle, HelpCircle, Save } from 'lucide-react';
import type { Company } from '../../types';
import { listBucketFiles, bulkAddCompanyFiles } from '../../services/api';

interface ScanRow {
  path: string;
  name: string;
  companyId: string; // '' = unmatched
  confidence: 'high' | 'medium' | 'none';
}

interface Props {
  companies: Company[];
  year: number;
  onClose: () => void;
  onDone: () => void;
}

function normalize(s: string) {
  return s.toLowerCase().replace(/\s/g, '').replace(/[_\-\.]/g, '');
}

function matchPath(path: string, name: string, companies: Company[]): { companyId: string; confidence: 'high' | 'medium' | 'none' } {
  const base = normalize(name.replace(/\.[^.]+$/, ''));
  const full = normalize(path);

  // Priority 1: project_no in path
  for (const co of companies) {
    if (co.project_no && (full.includes(normalize(co.project_no)) || base.includes(normalize(co.project_no)))) {
      return { companyId: co.project_no, confidence: 'high' };
    }
  }
  // Priority 2: representative name
  const nameMatches = companies.filter(co => co.representative && base.includes(normalize(co.representative)));
  if (nameMatches.length === 1) return { companyId: nameMatches[0].project_no, confidence: 'medium' };

  return { companyId: '', confidence: 'none' };
}

const CONF_STYLE: Record<string, { label: string; cls: string; Icon: any }> = {
  high:   { label: '과제번호',  cls: 'text-green-600', Icon: CheckCircle },
  medium: { label: '이름매칭', cls: 'text-blue-600',  Icon: CheckCircle },
  none:   { label: '미매칭',   cls: 'text-red-400',   Icon: HelpCircle  },
};

export default function StorageScanModal({ companies, year, onClose, onDone }: Props) {
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanMsg, setScanMsg] = useState('');

  async function scan() {
    setScanning(true);
    setScanMsg('스토리지 스캔 중...');
    try {
      const files = await listBucketFiles();
      const matched = files.map(f => {
        const { companyId, confidence } = matchPath(f.path, f.name, companies);
        return { path: f.path, name: f.name, companyId, confidence };
      });
      setRows(matched);
      setScanMsg(`${files.length}개 파일 발견 · 매칭 ${matched.filter(r => r.companyId).length}개`);
    } catch (e) {
      setScanMsg(`오류: ${(e as Error).message}`);
    }
    setScanning(false);
  }

  useEffect(() => { scan(); }, []);

  function setCompany(idx: number, companyId: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, companyId, confidence: companyId ? 'medium' : 'none' } : r));
  }

  async function handleSave() {
    const toSave = rows.filter(r => r.companyId);
    if (!toSave.length) return;
    setSaving(true);
    try {
      await bulkAddCompanyFiles(toSave.map(r => ({
        company_id: r.companyId,
        year,
        file_path: r.path,
        file_name: r.name,
      })));
      onDone();
    } catch (e) {
      alert((e as Error).message);
    }
    setSaving(false);
  }

  const matchedCount = rows.filter(r => r.companyId).length;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-bold text-lg">스토리지 파일 스캔 및 매칭</h3>
            <p className="text-sm text-gray-500 mt-0.5">{scanMsg}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={scan} disabled={scanning}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw size={13} className={scanning ? 'animate-spin' : ''} />재스캔
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {rows.length === 0 && !scanning && (
            <div className="py-16 text-center text-gray-400 text-sm">파일을 찾을 수 없습니다.</div>
          )}
          {rows.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">파일명</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">경로</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-24">상태</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">매칭 기업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, idx) => {
                  const conf = CONF_STYLE[r.confidence];
                  return (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-xs font-medium text-gray-800 max-w-[180px] truncate" title={r.name}>{r.name}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 max-w-[160px] truncate" title={r.path}>{r.path}</td>
                      <td className="px-4 py-2.5">
                        <span className={`flex items-center gap-1 text-xs font-medium ${conf.cls}`}>
                          <conf.Icon size={12} />{conf.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          value={r.companyId}
                          onChange={e => setCompany(idx, e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">— 기업 선택 —</option>
                          {companies.map(c => (
                            <option key={c.project_no} value={c.project_no}>
                              {c.project_no} {c.representative} ({c.project_title.slice(0, 18)}{c.project_title.length > 18 ? '…' : ''})
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
          <span className="text-sm text-gray-500">매칭된 파일 {matchedCount}개 저장됩니다</span>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
            <button
              onClick={handleSave}
              disabled={saving || matchedCount === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={14} />{saving ? '저장 중...' : `저장 (${matchedCount}개)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
