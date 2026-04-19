import React, { useEffect, useState } from 'react';
import { X, Trash2, FileText } from 'lucide-react';
import type { Company, CompanyFile } from '../../types';
import { getCompanyFiles, deleteCompanyFile, getFileUrl } from '../../services/api';

interface Props {
  company: Company;
  year: number;
  onClose: () => void;
  onChanged: () => void;
}

export default function CompanyFilesModal({ company, year, onClose, onChanged }: Props) {
  const [files, setFiles] = useState<CompanyFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<CompanyFile | null>(null);

  async function load() {
    setLoading(true);
    const fs = await getCompanyFiles([company.project_no]);
    setFiles(fs);
    if (fs.length > 0 && !preview) setPreview(fs[0]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [company.project_no]);

  async function handleDelete(f: CompanyFile) {
    if (!confirm(`"${f.file_name}" 파일 연결을 삭제하시겠습니까?`)) return;
    await deleteCompanyFile(f.id!);
    onChanged();
    await load();
  }

  // Also include legacy file_path
  const legacyFile = company.file_path
    ? { id: -1, company_id: company.project_no, year, file_path: company.file_path, file_name: '사업계획서 (기존)', uploaded_at: '' }
    : null;
  const allFiles: CompanyFile[] = [...(legacyFile ? [legacyFile] : []), ...files];

  const activeUrl = preview ? getFileUrl(preview.file_path) : '';

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-bold text-base">{company.project_no}</h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-lg">{company.project_title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* File list sidebar */}
          <div className="w-64 shrink-0 border-r border-gray-100 flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 text-xs font-medium text-gray-500">
              파일 목록 ({allFiles.length}개)
            </div>
            {loading ? (
              <div className="p-4 text-xs text-gray-400">로딩 중...</div>
            ) : allFiles.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-xs">
                <FileText size={24} className="mx-auto mb-2 opacity-40" />
                연결된 파일이 없습니다
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
                {allFiles.map(f => (
                  <div
                    key={f.id}
                    onClick={() => setPreview(f)}
                    className={`flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-50 ${preview?.id === f.id ? 'bg-blue-50 border-l-2 border-blue-500' : ''}`}
                  >
                    <FileText size={14} className="text-gray-400 shrink-0" />
                    <span className="flex-1 text-xs text-gray-700 truncate" title={f.file_name}>{f.file_name}</span>
                    {f.id !== -1 && (
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(f); }}
                        className="shrink-0 text-gray-300 hover:text-red-400 p-0.5"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="flex-1 flex flex-col bg-gray-100">
            {preview && activeUrl ? (
              <>
                <div className="px-4 py-2 bg-gray-800 text-xs text-gray-300 shrink-0 truncate">
                  {preview.file_name}
                </div>
                <iframe
                  src={`${activeUrl}#toolbar=0&navpanes=0&scrollbar=1`}
                  className="flex-1 w-full"
                  title={preview.file_name}
                />
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <FileText size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">왼쪽에서 파일을 선택하세요</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
