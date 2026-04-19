import React, { useRef, useState } from 'react';
import { X, Upload, CheckCircle, AlertCircle, HelpCircle, Trash2 } from 'lucide-react';
import type { Company, CompanyFile } from '../../types';
import { uploadCompanyDoc, addCompanyFile } from '../../services/api';

interface MatchResult {
  file: File;
  company: Company | null;
  confidence: 'high' | 'medium' | 'ambiguous' | 'none';
  candidates?: Company[];
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

function matchFiles(files: File[], companies: Company[]): MatchResult[] {
  return files.map(file => {
    const base = normalize(file.name.replace(/\.[^.]+$/, ''));

    // Priority 1: project_no substring match
    const byNo = companies.filter(c => c.project_no && base.includes(normalize(c.project_no)));
    if (byNo.length === 1) return { file, company: byNo[0], confidence: 'high' };
    if (byNo.length > 1)   return { file, company: byNo[0], confidence: 'ambiguous', candidates: byNo };

    // Priority 2: representative name match
    const byName = companies.filter(c => c.representative && base.includes(normalize(c.representative)));
    if (byName.length === 1) return { file, company: byName[0], confidence: 'medium' };
    if (byName.length > 1)   return { file, company: byName[0], confidence: 'ambiguous', candidates: byName };

    return { file, company: null, confidence: 'none' };
  });
}

const CONF_LABEL: Record<string, { label: string; color: string; Icon: any }> = {
  high:      { label: '과제번호 매칭',   color: 'text-green-600',  Icon: CheckCircle },
  medium:    { label: '이름 매칭',       color: 'text-blue-600',   Icon: CheckCircle },
  ambiguous: { label: '중복 — 수동 선택', color: 'text-amber-600',  Icon: AlertCircle },
  none:      { label: '매칭 없음',       color: 'text-red-500',    Icon: HelpCircle  },
};

export default function FileUploadModal({ companies, year, onClose, onDone }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    setMatches(matchFiles(arr, companies));
  }

  function setCompany(idx: number, companyId: string) {
    setMatches(prev => prev.map((m, i) => {
      if (i !== idx) return m;
      const co = companies.find(c => c.project_no === companyId) || null;
      return { ...m, company: co, confidence: co ? 'medium' : 'none' };
    }));
  }

  function removeRow(idx: number) {
    setMatches(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleUpload() {
    const toUpload = matches.filter(m => m.company);
    if (toUpload.length === 0) return;
    setUploading(true);
    let done = 0;
    const errors: string[] = [];
    for (const m of toUpload) {
      try {
        setProgress(`업로드 중... ${done + 1}/${toUpload.length} (${m.file.name})`);
        const path = await uploadCompanyDoc(m.file, m.company!.project_no, year);
        await addCompanyFile({
          company_id: m.company!.project_no,
          year,
          file_path: path,
          file_name: m.file.name,
        });
        done++;
      } catch (e) {
        errors.push(`${m.file.name}: ${(e as Error).message}`);
      }
    }
    setUploading(false);
    setProgress('');
    if (errors.length > 0) {
      alert(`완료 (${done}개 성공)\n오류:\n${errors.join('\n')}`);
    }
    onDone();
  }

  const matchedCount = matches.filter(m => m.company).length;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-bold text-lg">평가자료 일괄 업로드</h3>
            <p className="text-sm text-gray-500 mt-0.5">파일명의 과제번호 또는 이름으로 기업을 자동 매칭합니다.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
        </div>

        {/* Drop zone */}
        {matches.length === 0 && (
          <div className="px-6 py-8 flex-1 flex items-center justify-center">
            <div
              className="w-full border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
            >
              <Upload size={32} className="mx-auto text-gray-400 mb-3" />
              <p className="text-sm font-medium text-gray-700">클릭하거나 파일을 드래그하세요</p>
              <p className="text-xs text-gray-400 mt-1">PDF, HWP, DOCX 등 여러 파일 동시 선택 가능</p>
            </div>
            <input ref={fileRef} type="file" multiple className="hidden"
              onChange={e => handleFiles(e.target.files)} />
          </div>
        )}

        {/* Match results */}
        {matches.length > 0 && (
          <>
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-4 shrink-0">
              <span className="text-sm text-gray-600">총 {matches.length}개 파일</span>
              <span className="text-sm text-green-600 font-medium">매칭됨 {matchedCount}개</span>
              <span className="text-sm text-red-500">미매칭 {matches.length - matchedCount}개</span>
              <button
                onClick={() => { setMatches([]); if (fileRef.current) fileRef.current.value = ''; }}
                className="ml-auto text-xs text-gray-400 hover:text-gray-600"
              >
                초기화
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">파일명</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-36">상태</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">매칭 기업</th>
                    <th className="px-4 py-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {matches.map((m, idx) => {
                    const conf = CONF_LABEL[m.confidence];
                    return (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-xs text-gray-700 max-w-xs truncate" title={m.file.name}>
                          {m.file.name}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`flex items-center gap-1 text-xs font-medium ${conf.color}`}>
                            <conf.Icon size={13} />{conf.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={m.company?.project_no || ''}
                            onChange={e => setCompany(idx, e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">— 기업 선택 —</option>
                            {companies.map(c => (
                              <option key={c.project_no} value={c.project_no}>
                                {c.project_no} {c.representative} ({c.project_title.slice(0, 20)}{c.project_title.length > 20 ? '…' : ''})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => removeRow(idx)} className="text-gray-300 hover:text-red-400">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3 shrink-0">
          {uploading && <span className="text-sm text-blue-600 flex-1">{progress}</span>}
          {!uploading && matches.length > 0 && (
            <button
              onClick={() => fileRef.current?.click()}
              className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-2 rounded-lg"
            >
              파일 추가
            </button>
          )}
          <input ref={fileRef} type="file" multiple className="hidden"
            onChange={e => {
              if (!e.target.files) return;
              const newMatches = matchFiles(Array.from(e.target.files), companies);
              setMatches(prev => [...prev, ...newMatches]);
              e.target.value = '';
            }} />
          <div className="flex gap-3 ml-auto">
            <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
              취소
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || matchedCount === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Upload size={14} />{uploading ? '업로드 중...' : `업로드 (${matchedCount}개)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
