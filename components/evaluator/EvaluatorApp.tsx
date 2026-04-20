import React, { useEffect, useState } from 'react';

const PRES_ORDER: Record<string, number> = {"20401269":4,"20402754":12,"20403700":9,"20403842":3,"20404406":9,"20404581":1,"20404954":2,"20405890":5,"20406455":3,"20406463":10,"20406894":1,"20407665":10,"20408825":10,"20408877":1,"20409229":4,"20409931":6,"20410202":3,"20410732":3,"20410913":11,"20412024":5,"20412297":4,"20412385":3,"20412766":1,"20413111":2,"20413200":12,"20413444":3,"20413666":8,"20413825":4,"20413968":1,"20413981":12,"20414096":1,"20414167":2,"20414230":13,"20414308":11,"20414625":1,"20414728":11,"20414883":3,"20414899":6,"20415322":13,"20415487":9,"20415499":8,"20415506":8,"20415588":1,"20415684":10,"20415817":3,"20415837":5,"20415839":2,"20415849":9,"20415851":3,"20415870":10,"20416056":3,"20416188":1,"20416208":11,"20416443":5,"20416502":10,"20416542":8,"20416668":11,"20416947":8,"20417238":8,"20417471":6,"20417534":2,"20417596":9,"20417599":2,"20417617":10,"20417675":5,"20417694":6,"20417697":10,"20417774":6,"20417896":7,"20418037":6,"20418175":4,"20418401":7,"20418458":11,"20418464":6,"20418471":11,"20418598":12,"20418609":8,"20418623":9,"20418691":3,"20418733":9,"20418814":1,"20418822":7,"20418903":8,"20419110":10,"20419166":12,"20419189":8,"20419192":9,"20419206":9,"20419317":4,"20419372":2,"20419387":11,"20419388":3,"20420108":6,"20420127":4,"20420270":8,"20420569":7,"20421734":4,"20421742":12,"20421952":9,"20422010":11,"20422710":4,"20423046":4,"20423136":4,"20423461":2,"20423821":10,"20424315":1,"20424483":4,"20424497":2,"20424540":8,"20424544":10,"20424587":2,"20424619":1,"20424645":3,"20424775":3,"20424839":6,"20424850":10,"20425290":8,"20425350":12,"20425527":11,"20425601":2,"20425607":6,"20425675":7,"20425711":2,"20425812":7,"20425817":3,"20426082":9,"20426148":1,"20426411":9,"20426658":7,"20426671":12,"20426680":11,"20426887":10,"20426937":8,"20427103":5,"20427459":12,"20427486":10,"20427490":10,"20427515":5,"20427563":5,"20427569":4,"20427590":10,"20428037":3,"20428115":9,"20428133":7,"20428258":7,"20428259":2,"20428287":8,"20428312":7,"20428346":2,"20428457":4,"20428574":4,"20428596":2,"20428639":10,"20428661":6,"20428674":12,"20428779":4,"20428829":5,"20428862":11,"20428934":5,"20428945":5,"20429004":12,"20429088":5,"20429144":11,"20429214":8,"20429253":6,"20429524":7,"20429573":7,"20429725":9,"20429808":5,"20429861":9,"20429923":5,"20429982":9,"20430098":7,"20430125":11,"20430270":1,"20430556":11,"20430558":12,"20430589":2,"20431043":7,"20431117":12,"20431469":1,"20431661":5,"20431696":2,"20431761":7,"20431875":9,"20431973":1,"20432254":8,"20432406":1,"20433135":11,"20439414":4,"20439651":12};
import {
  getCompanies, getEvaluations, saveEvaluation, deleteEvaluation, getFileUrl, getEvalCriteria, getCompanyFiles,
  getGradeSettings, getEvaluators, calculateAvgScore, getExtraOpinionFields
} from '../../services/api';
import type { Evaluator, Company, Evaluation, EvalCriterion, CompanyFile, GradeSetting, ExtraOpinionField } from '../../types';
import { LogOut, X, CheckCircle, Clock, Star, FileCheck, Printer, BarChart2, ChevronLeft, ChevronRight } from 'lucide-react';
import GradeDashboard from '../admin/GradeDashboard';

interface CriteriaSection {
  section: number;
  name: string;
  total: number;
  items: { key: string; name: string; max: number }[];
}

function buildSections(items: EvalCriterion[]): CriteriaSection[] {
  const map: Record<number, CriteriaSection> = {};
  items.forEach(c => {
    if (!map[c.section_no]) map[c.section_no] = { section: c.section_no, name: c.section_name, total: 0, items: [] };
    map[c.section_no].items.push({ key: c.item_key, name: c.item_name, max: c.item_max });
    map[c.section_no].total += c.item_max;
  });
  return Object.values(map)
    .sort((a, b) => a.section - b.section)
    .map(s => ({ ...s, items: s.items.sort((a, b) => a.key.localeCompare(b.key)) }));
}

interface Props {
  user: Evaluator;
  onLogout: () => void;
}

type Filter = 'all' | 'done' | 'todo';

export default function EvaluatorApp({ user, onLogout }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [docSections, setDocSections] = useState<CriteriaSection[]>([]);
  const [presSections, setPresSections] = useState<CriteriaSection[]>([]);
  const [companyFiles, setCompanyFiles] = useState<Record<string, CompanyFile[]>>({});
  const [activeFileIdx, setActiveFileIdx] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Company | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<'all' | '서류' | '발표'>('all');
  const [grades, setGrades] = useState<GradeSetting[]>([]);
  const [allEvals, setAllEvals] = useState<Evaluation[]>([]);
  const [allEvaluators, setAllEvaluators] = useState<Evaluator[]>([]);
  const [showStats, setShowStats] = useState(false);
  const [showModalStats, setShowModalStats] = useState(false);
  const [extraOpinionFields, setExtraOpinionFields] = useState<ExtraOpinionField[]>([]);

  // Evaluation form state
  const [score, setScore] = useState('');
  const [subScores, setSubScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [regionMatch, setRegionMatch] = useState<'일치' | '불일치' | null>(null);
  const [regionMatchComment, setRegionMatchComment] = useState('');
  const [extraOpinions, setExtraOpinions] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const [printDateModal, setPrintDateModal] = useState<{ mode: 'single' | 'eval'; company?: Company } | null>(null);
  const [printDate, setPrintDate] = useState(todayStr);

  useEffect(() => {
    if (selected) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [selected]);

  useEffect(() => {
    if (!user.division_id) { setLoading(false); return; }
    setLoading(true);
    // All independent queries in parallel
    Promise.all([
      getCompanies(user.year, user.division_id),
      getEvaluations({ evaluatorId: user.id }),
      getEvalCriteria(user.year, '서류'),
      getEvalCriteria(user.year, '발표'),
      getExtraOpinionFields(user.year),
      getEvaluators(user.year),
      getGradeSettings(user.year),
    ]).then(async ([cos, evs, docC, presC, xof, evrs, gs]) => {
      const active = (cos as import('../types').Company[]).filter(c => !c.is_excluded);
      setCompanies(active);
      setEvaluations(evs as import('../types').Evaluation[]);
      setDocSections(buildSections(docC as import('../types').EvalCriterion[]));
      setPresSections(buildSections(presC as import('../types').EvalCriterion[]));
      setExtraOpinionFields(xof as import('../types').ExtraOpinionField[]);
      setAllEvaluators((evrs as import('../types').Evaluator[]).filter(e => e.role !== 'admin'));
      setGrades(gs as import('../types').GradeSetting[]);
      setLoading(false); // Show UI immediately
      // Load company-specific data in background
      if (active.length > 0) {
        const ids = active.map(c => c.project_no);
        const [files, ae] = await Promise.all([
          getCompanyFiles(ids),
          getEvaluations({ companyIds: ids }),
        ]);
        const fm: Record<string, CompanyFile[]> = {};
        (files as CompanyFile[]).forEach(f => { if (!fm[f.company_id]) fm[f.company_id] = []; fm[f.company_id].push(f); });
        setCompanyFiles(fm);
        setAllEvals(ae as import('../types').Evaluation[]);
      }
    });
  }, [user]);

  function getEvalForCompany(projectNo: string, type: string): Evaluation | undefined {
    return evaluations.find(e => e.company_id === projectNo && e.evaluation_type === type);
  }

  function getActiveEvalType(co: Company): '서류' | '발표' | null {
    if (co.is_doc_exempt && co.stage === '발표') return '발표';
    if (co.stage === '서류') return '서류';
    if (co.stage === '발표') return '발표';
    return null;
  }

  function isEvaluated(co: Company): boolean {
    const type = getActiveEvalType(co);
    if (!type) return true;
    return !!getEvalForCompany(co.project_no, type);
  }

  function openCompany(co: Company) {
    setSelected(co);
    const type = getActiveEvalType(co);
    if (type) {
      const ev = getEvalForCompany(co.project_no, type);
      if (ev?.sub_scores && Object.keys(ev.sub_scores).length > 0) {
        const ss = ev.sub_scores as Record<string, number>;
        setSubScores(ss);
        const total = Object.values(ss).reduce((a, b) => a + b, 0);
        setScore(String(total));
      } else {
        setSubScores({});
        setScore(ev?.score !== undefined && ev?.score !== null ? String(ev.score) : '');
      }
      setComment(ev?.comment || '');
      const xo = (ev?.extra_opinions as Record<string, string>) || {};
      setRegionMatch((xo['주력산업_일치여부'] as '일치' | '불일치') || null);
      setRegionMatchComment(xo['주력산업_의견'] || '');
      setExtraOpinions(xo);
    } else {
      setScore('');
      setSubScores({});
      setComment('');
      setRegionMatch(null);
      setRegionMatchComment('');
      setExtraOpinions({});
    }
    setSubmitMsg('');
  }

  function buildFormPage(co: Company, dateStr?: string): string {
      const evalType = getActiveEvalType(co);
      if (!evalType) return '';
      const ev = getEvalForCompany(co.project_no, evalType);
      const ss = ev?.sub_scores as Record<string, number> | undefined;
      const sc = ev ? (ev.adjusted_score ?? ev.score ?? 0) : 0;
      const sections = evalType === '서류' ? docSections : presSections;

      const xo = (ev?.extra_opinions as Record<string, string>) || {};
      const rmMatch = xo['주력산업_일치여부'] || '';
      const rmComment = xo['주력산업_의견'] || '';
      const extraOpinionRows = (rmMatch || rmComment)
        ? '<tr><th style="background:#e0e7ff;color:#3730a3;font-size:10.5px">대학발 주력산업 일치여부</th></tr>' +
          '<tr><td class="opinion-area" style="min-height:40px;height:40px">' +
          (rmMatch ? '<strong>' + rmMatch + '</strong>' + (rmComment ? '&nbsp;&nbsp;' : '') : '') +
          rmComment + '</td></tr>'
        : '';

      const scoreRows = sections.length > 0
        ? sections.flatMap(sec =>
            sec.items.map((item, ii) => {
              const secCell = ii === 0
                ? `<td class="sec-cell" rowspan="${sec.items.length}">${sec.section}. ${sec.name}<br/><span style="font-size:10px">(${sec.total}점)</span></td>`
                : '';
              return `<tr>${secCell}<td class="item-left">${item.key}. ${item.name}</td><td class="pts">${item.max}</td><td class="pts">${ss?.[item.key] !== undefined ? ss[item.key] : ''}</td></tr>`;
            })
          ).join('')
        : `<tr><td colspan="3">총점</td><td class="pts">${sc}</td></tr>`;

      return `<div class="page">
  <div class="title-box">
    <div class="sub">「${user.year}년 창업중심대학 지원사업」</div>
    <div class="main">(예비)창업기업 선정평가 ${evalType}평가표</div>
  </div>
  <table class="meta">
    <tr><td class="label" width="120">지 원 유 형</td><td colspan="3">${co.recruit_type || ''}</td></tr>
    <tr><td class="label">주 관 기 관 명</td><td width="200">성균관대학교</td><td class="label" width="100">과 제 번 호</td><td>${co.project_no}</td></tr>
    <tr><td class="label">아 이 템 명</td><td colspan="3">${co.project_title}</td></tr>
    <tr><td class="label">분 과 구 분</td><td colspan="3">${user.division?.division_label || ''} (${user.division?.division_name || ''})</td></tr>
  </table>
  <table class="score-tbl">
    <thead><tr><th width="160">세부평가</th><th>평가내용</th><th width="50">배점</th><th width="60">점수</th></tr></thead>
    <tbody>
      ${scoreRows}
      <tr class="total-row"><td colspan="3" style="text-align:right;font-weight:bold">최 종 점 수</td><td class="pts" style="font-weight:bold">${ev ? sc : ''}</td></tr>
    </tbody>
  </table>
  <table class="opinion-tbl">
    <tr><th>평 가 의 견</th></tr>
    <tr><td class="opinion-area">${ev?.comment || ''}</td></tr>
    ${extraOpinionRows}
  </table>
  <div class="confirm">본인은 ${user.year}년 창업중심대학 지원사업 참여기업 선정평가에 참여함에 있어 공정하게 평가하였으며, 평가 결과에 이상이 없음을 확인합니다.</div>
  <div class="confirm-date">${dateStr ? dateStr.replace(/-/g, '년 ').replace(/년 (\d+)년 (\d+)$/, '년 $1월 $2일') : `${user.year}년 ${new Date().getMonth() + 1}월 ${new Date().getDate()}일`}</div>
  <div class="sig-line">소속: ${user.organization || '　　　　　　　　　　　　'} &nbsp;&nbsp; 직위: ${user.position || '　　　　'} &nbsp;&nbsp; 평가위원: ${user.name} &nbsp;&nbsp;&nbsp;&nbsp; (인)</div>
  <div class="sig-bottom">주관기관장 귀하</div>
</div>`;
  }

  const printStyles = `
  body{font-family:'Malgun Gothic',sans-serif;font-size:11px;margin:0;padding:0}
  @page{size:A4 portrait;margin:15mm 12mm}
  .page{page-break-after:always;padding:0}.page:last-child{page-break-after:auto}
  .title-box{text-align:center;border:2px solid #333;padding:10px;margin-bottom:10px}
  .title-box .sub{font-size:11px;color:#555;margin-bottom:4px}.title-box .main{font-size:18px;font-weight:bold}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}
  th,td{border:1px solid #888;padding:5px 7px;vertical-align:middle}
  th{background:#f2f2f2;font-weight:600;text-align:center}
  td.label{background:#f5f5f5;font-weight:600;text-align:center;white-space:nowrap}
  td.sec-cell{background:#fafafa;font-weight:600;text-align:center;font-size:10.5px}
  td.item-left{text-align:left;font-size:10.5px}td.pts{text-align:center}
  td.opinion-area{min-height:80px;height:80px;padding:8px;text-align:left;vertical-align:top}
  tr.total-row td{background:#e8f0fe}
  .confirm{margin-top:14px;font-size:10.5px;line-height:1.6}
  .confirm-date{margin-top:8px;font-size:11px}.sig-line{margin-top:12px;font-size:11px}
  .sig-bottom{margin-top:10px;text-align:right;font-size:11px}
  @media print{.no-print{display:none}}`;

  function openPrintWindow(pages: string, title: string) {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>${title}</title><style>${printStyles}</style></head><body>
<button class="no-print" onclick="window.print()" style="margin:10px;padding:8px 20px;background:#1a56db;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">인쇄</button>
${pages}</body></html>`);
    win.document.close();
  }

  function handlePrintSingleCard(e: React.MouseEvent, co: Company) {
    e.stopPropagation();
    setPrintDate(todayStr());
    setPrintDateModal({ mode: 'single', company: co });
  }

  function handlePrintAllForms() {
    setPrintDate(todayStr());
    setPrintDateModal({ mode: 'single' }); // reuse modal, no specific company = all forms
  }

  function doPrint(dateStr: string) {
    const modal = printDateModal;
    setPrintDateModal(null);
    if (!modal) return;
    if (modal.mode === 'eval') {
      doPrintEvalForm(dateStr);
    } else if (modal.company) {
      const page = buildFormPage(modal.company, dateStr);
      if (page) openPrintWindow(page, `${modal.company.project_no} 평가표`);
    } else {
      const pages = companies.map(co => buildFormPage(co, dateStr)).filter(Boolean).join('\n');
      openPrintWindow(pages, `${user.year}년도 ${user.division?.division_name} 평가표`);
    }
  }

  function handlePrintEvalForm() {
    setPrintDate(todayStr());
    setPrintDateModal({ mode: 'eval' });
  }

  function doPrintEvalForm(dateStr: string) {
    if (!selected || !selectedEv) return;
    const sc = selectedEv.adjusted_score ?? selectedEv.score ?? 0;
    const ss = selectedEv.sub_scores as Record<string, number> | undefined;
    const win = window.open('', '_blank');
    if (!win) return;
    const activeSections = selectedEvalType === '서류' ? docSections : presSections;
    const xoPrint = (selectedEv.extra_opinions as Record<string, string>) || {};
    const rmMatchP = xoPrint['주력산업_일치여부'] || '';
    const rmCommentP = xoPrint['주력산업_의견'] || '';
    const extraOpHtml = (rmMatchP || rmCommentP)
      ? '<tr><th style="background:#e0e7ff;color:#3730a3">대학발 주력산업 일치여부</th></tr>' +
        '<tr><td style="min-height:40px;padding:8px">' +
        (rmMatchP ? '<strong>' + rmMatchP + '</strong>' + (rmCommentP ? '&nbsp;&nbsp;' : '') : '') +
        rmCommentP + '</td></tr>'
      : '';

    const subsHtml = ss && activeSections.length > 0 ? activeSections.map(sec => `
      <tr><td colspan="3" style="background:#f5f5f5;font-weight:bold;padding:4px 8px">${sec.section}. ${sec.name} (${sec.total}점)</td></tr>
      ${sec.items.map(it => `<tr><td style="padding:3px 8px;padding-left:20px">${it.key}. ${it.name}</td><td style="text-align:center">${it.max}점</td><td style="text-align:center">${ss[it.key] ?? 0}점</td></tr>`).join('')}
    `).join('') : `<tr><td colspan="2">점수</td><td style="text-align:center">${sc}점</td></tr>`;

    win.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<style>body{font-family:'Malgun Gothic',sans-serif;font-size:11px;margin:20px}
h2{text-align:center;font-size:15px;margin-bottom:4px}
.meta{text-align:center;font-size:11px;color:#555;margin-bottom:12px}
table{width:100%;border-collapse:collapse;margin-bottom:12px}
th,td{border:1px solid #999;padding:4px 6px}th{background:#eee}
.sig{margin-top:30px;font-size:11px}.no-print{margin:10px}
@media print{.no-print{display:none}}</style></head><body>
<button class="no-print" onclick="window.print()">인쇄</button>
<h2>${user.year}년도 창업중심대학 참여기업 선발 발표평가표</h2>
<div class="meta">분과: ${user.division?.division_name} &nbsp;|&nbsp; 평가위원: 위원${user.evaluator_order} ${user.name}</div>
<table>
  <tr><th>과제번호</th><td>${selected.project_no}</td><th>과제명</th><td colspan="3">${selected.project_title}</td></tr>
  <tr><th>대표자</th><td>${selected.representative}</td><th>지원유형</th><td colspan="3">${selected.recruit_type || '-'}</td></tr>
</table>
<table><thead><tr><th>평가항목</th><th>배점</th><th>점수</th></tr></thead><tbody>
${subsHtml}
<tr style="font-weight:bold;background:#e8f0fe"><td colspan="2">총 점</td><td style="text-align:center">${sc}점</td></tr>
</tbody></table>
<table><thead><tr><th>평가의견</th></tr></thead><tbody>
<tr><td style="min-height:60px;padding:8px">${selectedEv.comment || ''}</td></tr>
${extraOpHtml}
</tbody></table>
<div class="sig">
  <p>위 평가 결과가 사실임을 확인합니다.</p>
  <p>평가일: ${dateStr.replace(/-/g, '년 ').replace(/년 (\d+)년 (\d+)$/, '년 $1월 $2일')}</p>
  <p>소속: ${user.organization || ''} &nbsp;&nbsp; 직위: ${user.position || ''} &nbsp;&nbsp; 평가위원: ${user.name} &nbsp;&nbsp;&nbsp;&nbsp; (서명)</p>
</div></body></html>`);
    win.document.close();
  }

  function setSubScore(key: string, val: number, max: number) {
    const clamped = Math.min(max, Math.max(0, val));
    setSubScores(prev => {
      const next = { ...prev, [key]: clamped };
      const total = Object.values(next).reduce((a, b) => a + b, 0);
      setScore(String(total));
      return next;
    });
  }

  async function handleSubmit() {
    if (!selected) return;
    const evalType = getActiveEvalType(selected);
    if (!evalType) return;
    const sc = parseFloat(score);
    if (isNaN(sc) || sc < 0 || sc > 100) {
      alert('0~100 사이의 점수를 입력하세요.');
      return;
    }
    const existingEv = getEvalForCompany(selected.project_no, evalType);
    if (existingEv?.is_confirmed) {
      alert('확정된 평가는 수정할 수 없습니다.');
      return;
    }
    setSubmitting(true);
    try {
      const saved = await saveEvaluation({
        company_id: selected.project_no,
        evaluator_id: user.id,
        evaluation_type: evalType,
        score: sc,
        sub_scores: Object.keys(subScores).length > 0 ? subScores : undefined,
        comment: comment.trim() || undefined,
        extra_opinions: (() => {
          const xo: Record<string, string> = {};
          if (regionMatch) xo['주력산업_일치여부'] = regionMatch;
          if (regionMatchComment.trim()) xo['주력산업_의견'] = regionMatchComment.trim();
          return Object.keys(xo).length > 0 ? xo : undefined;
        })(),
        submitted_at: new Date().toISOString(),
      });
      setEvaluations(prev => {
        const filtered = prev.filter(e => !(e.company_id === selected.project_no && e.evaluation_type === evalType));
        return [...filtered, saved];
      });
      setAllEvals(prev => {
        const filtered = prev.filter(e => !(e.company_id === selected.project_no && e.evaluator_id === user.id && e.evaluation_type === evalType));
        return [...filtered, saved];
      });
      setSubmitMsg('저장되었습니다.');
      setTimeout(() => setSubmitMsg(''), 3000);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset() {
    if (!selected || !selectedEv) return;
    if (!confirm('이 기업의 평가를 초기화하시겠습니까? 입력한 점수와 의견이 모두 삭제됩니다.')) return;
    try {
      await deleteEvaluation(selectedEv.id as number);
      setEvaluations(prev => prev.filter(e => e.id !== selectedEv.id));
      setAllEvals(prev => prev.filter(e => e.id !== selectedEv.id));
      setScore('');
      setSubScores({});
      setComment('');
      setRegionMatch(null);
      setRegionMatchComment('');
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const evaluated = companies.filter(c => isEvaluated(c));
  const progress = companies.length > 0 ? Math.round((evaluated.length / companies.length) * 100) : 0;

  const filtered = companies.filter(co => {
    if (filter === 'done' && !isEvaluated(co)) return false;
    if (filter === 'todo' && isEvaluated(co)) return false;
    if (stageFilter !== 'all' && co.stage !== stageFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        co.project_no.includes(q) ||
        co.representative.toLowerCase().includes(q) ||
        co.project_title.toLowerCase().includes(q)
      );
    }
    return true;
  }).sort((a, b) => (PRES_ORDER[a.project_no] ?? 999) - (PRES_ORDER[b.project_no] ?? 999));

  const selectedEvalType = selected ? getActiveEvalType(selected) : null;
  const selectedEv = selected && selectedEvalType ? getEvalForCompany(selected.project_no, selectedEvalType) : undefined;
  const isConfirmed = selectedEv?.is_confirmed;

  // Build file list for selected company: uploaded docs first, fallback to file_path
  const selectedFiles: { name: string; url: string }[] = selected
    ? [
        ...(companyFiles[selected.project_no] || []).map(f => ({ name: f.file_name, url: getFileUrl(f.file_path) })),
        ...(selected.file_path && !(companyFiles[selected.project_no]?.length) ? [{ name: '사업계획서', url: getFileUrl(selected.file_path) }] : []),
      ]
    : [];
  const activeIdx = selected ? (activeFileIdx[selected.project_no] ?? 0) : 0;
  const pdfUrl = selectedFiles[activeIdx]?.url || '';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">로딩 중...</div>
      </div>
    );
  }

  if (!user.division_id) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium text-gray-700 mb-2">분과가 배정되지 않았습니다</div>
          <div className="text-sm text-gray-500">관리자에게 문의하세요.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Print date picker modal */}
      {printDateModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80">
            <h3 className="font-bold text-gray-900 mb-1">인쇄 날짜 선택</h3>
            <p className="text-xs text-gray-500 mb-4">평가표에 기재할 날짜를 선택하세요.</p>
            <input
              type="date"
              value={printDate}
              onChange={e => setPrintDate(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setPrintDateModal(null)} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={() => doPrint(printDate)} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">인쇄</button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="font-bold text-gray-900">창업중심대학 참여기업 평가</h1>
            <p className="text-xs text-gray-500">
              {user.year}년도 · {user.division?.division_name} · 위원{user.evaluator_order} {user.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-medium text-gray-700">{evaluated.length} / {companies.length} 완료</div>
            <div className="w-32 h-2 bg-gray-200 rounded-full mt-1">
              <div className="h-2 bg-blue-600 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <button
            onClick={() => setShowStats(s => !s)}
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors border ${showStats ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 border-gray-200'}`}
          >
            <BarChart2 size={15} />등급 현황
          </button>
          <button
            onClick={handlePrintAllForms}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
          >
            <Printer size={15} />분과 전체 인쇄
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <LogOut size={15} />로그아웃
          </button>
        </div>
      </header>

      {/* Grade distribution stats panel - fixed overlay */}
      {showStats && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowStats(false)} />
          <div className="fixed top-16 right-4 z-50 w-[680px] max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
              <span className="font-semibold text-gray-800 text-sm">등급 분포 현황</span>
              <button onClick={() => setShowStats(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(100vh-8rem)]">
              {(() => {
                const divEvs = allEvaluators.filter(e => e.division_id === user.division_id).sort((a, b) => (a.evaluator_order || 0) - (b.evaluator_order || 0));
                const finalScores: Record<string, number> = {};
                companies.forEach(co => {
                  const evalType = getActiveEvalType(co);
                  const scores = divEvs.map(ev => {
                    const e = allEvals.find(ev2 => ev2.company_id === co.project_no && ev2.evaluator_id === ev.id && (!evalType || ev2.evaluation_type === evalType));
                    return e ? (e.adjusted_score ?? e.score ?? null) : null;
                  });
                  const avg = calculateAvgScore(scores);
                  if (avg > 0) finalScores[co.project_no] = avg;
                });
                return <GradeDashboard grades={grades} companies={companies} finalScores={finalScores} divisions={user.division ? [user.division] : []} showDivisions={false} />;
              })()}
            </div>
          </div>
        </>
      )}

      {/* Evaluation modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 z-50 flex">
          <div className="flex flex-col bg-white w-full h-full md:flex-row">
            {/* Left: PDF viewer */}
            <div className="flex-1 bg-gray-800 flex flex-col relative">
              <div className="flex flex-col bg-gray-900">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const idx = filtered.findIndex(c => c.project_no === selected.project_no);
                      const prev = idx > 0 ? filtered[idx - 1] : null;
                      const next = idx < filtered.length - 1 ? filtered[idx + 1] : null;
                      return (
                        <>
                          <button
                            onClick={() => prev && openCompany(prev)}
                            disabled={!prev}
                            className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            <ChevronLeft size={13} />이전
                          </button>
                          <span className="text-white text-sm font-medium">{selected.project_no}</span>
                          <span className="text-gray-500 text-xs">({idx + 1}/{filtered.length})</span>
                          <button
                            onClick={() => next && openCompany(next)}
                            disabled={!next}
                            className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            다음<ChevronRight size={13} />
                          </button>
                        </>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowModalStats(s => !s)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors border ${showModalStats ? 'bg-blue-600 text-white border-blue-500' : 'text-gray-300 border-gray-600 hover:bg-gray-700'}`}
                    >
                      <BarChart2 size={13} />등급 현황
                    </button>
                    <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white p-1">
                      <X size={18} />
                    </button>
                  </div>
                </div>
                {selectedFiles.length > 1 && (
                  <div className="flex overflow-x-auto border-t border-gray-700 px-2">
                    {selectedFiles.map((f, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveFileIdx(prev => ({ ...prev, [selected.project_no]: i }))}
                        className={`shrink-0 px-3 py-2 text-xs transition-colors border-b-2 ${
                          activeIdx === i
                            ? 'text-white border-blue-400'
                            : 'text-gray-400 border-transparent hover:text-gray-200'
                        }`}
                      >
                        {f.name.length > 24 ? f.name.slice(0, 22) + '…' : f.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {showModalStats && (
                <>
                  <div className="absolute inset-0 z-10" onClick={() => setShowModalStats(false)} />
                  <div className="absolute top-12 left-4 right-4 z-20 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                      <span className="font-semibold text-gray-800 text-sm">등급 분포 현황</span>
                      <button onClick={() => setShowModalStats(false)} className="text-gray-400 hover:text-gray-600 p-1">
                        <X size={16} />
                      </button>
                    </div>
                    <div className="p-4 overflow-y-auto max-h-80">
                      {(() => {
                        const divEvs = allEvaluators.filter(e => e.division_id === user.division_id).sort((a, b) => (a.evaluator_order || 0) - (b.evaluator_order || 0));
                        const finalScores: Record<string, number> = {};
                        companies.forEach(co => {
                          const evalType = getActiveEvalType(co);
                          const scores = divEvs.map(ev => {
                            const e = allEvals.find(ev2 => ev2.company_id === co.project_no && ev2.evaluator_id === ev.id && (!evalType || ev2.evaluation_type === evalType));
                            return e ? (e.adjusted_score ?? e.score ?? null) : null;
                          });
                          const avg = calculateAvgScore(scores);
                          if (avg > 0) finalScores[co.project_no] = avg;
                        });
                        return <GradeDashboard grades={grades} companies={companies} finalScores={finalScores} divisions={user.division ? [user.division] : []} showDivisions={false} />;
                      })()}
                    </div>
                  </div>
                </>
              )}
              {pdfUrl ? (
                <iframe src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=1`} className="flex-1 w-full" title="사업계획서" />
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <div className="text-4xl mb-3">📄</div>
                    <div className="text-sm">PDF 파일이 없습니다</div>
                    <div className="text-xs text-gray-500 mt-1">관리자에게 업로드를 요청하세요</div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Evaluation form */}
            <div className="w-full md:w-96 flex flex-col bg-white border-l border-gray-200 overflow-y-auto">
              <div className="px-6 py-5 border-b border-gray-100">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">{selected.tech_field}</p>
                    <h2 className="font-bold text-gray-900 leading-snug">{selected.project_title}</h2>
                    <p className="text-sm text-gray-600 mt-1">{selected.representative}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selected.startup_stage && (
                        <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${selected.startup_stage.includes('예비') ? 'bg-green-100 text-green-700' : selected.startup_stage.includes('초기') ? 'bg-blue-100 text-blue-700' : selected.startup_stage.includes('도약') ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                          {selected.startup_stage.includes('예비') ? '예비' : selected.startup_stage.includes('초기') ? '초기' : selected.startup_stage.includes('도약') ? '도약' : selected.startup_stage}
                        </span>
                      )}
                      {selected.recruit_type && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">{selected.recruit_type}</span>
                      )}
                      {selected.age_group && (
                        <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${selected.age_group === '청년' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>{selected.age_group}</span>
                      )}
                      {selected.is_legend && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">
                          <Star size={10} />레전드
                        </span>
                      )}
                      {selected.is_doc_exempt && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">
                          <FileCheck size={10} />서류면제
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 p-1 md:hidden">
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="px-6 py-5 flex-1 space-y-5">
                {/* Eval type badge */}
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    selectedEvalType === '서류' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {selectedEvalType}평가
                  </span>
                  {isConfirmed && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                      <CheckCircle size={11} />확정됨
                    </span>
                  )}
                </div>

                {isConfirmed ? (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                    이 평가는 확정되어 수정할 수 없습니다.
                    <div className="mt-2 font-bold text-lg">{selectedEv?.adjusted_score ?? selectedEv?.score}점</div>
                  </div>
                ) : (
                  <>
                    {(() => {
                      const activeSections = selectedEvalType === '서류' ? docSections : presSections;
                      return activeSections.length > 0 ? (
                      <div className="space-y-4">
                        {activeSections.map(section => {
                          const sectionTotal = section.items.reduce((sum, it) => sum + (subScores[it.key] ?? 0), 0);
                          return (
                            <div key={section.section} className="border border-gray-200 rounded-xl overflow-hidden">
                              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                                <span className="text-sm font-semibold text-gray-700">
                                  {section.section}. {section.name}
                                </span>
                                <span className="text-sm font-bold text-blue-700">
                                  {sectionTotal} / {section.total}점
                                </span>
                              </div>
                              <div className="divide-y divide-gray-100">
                                {section.items.map(item => (
                                  <div key={item.key} className="px-4 py-3">
                                    <div className="flex items-center justify-between mb-1.5">
                                      <label className="text-xs text-gray-600">
                                        {item.key}. {item.name}
                                        <span className="ml-1 text-gray-400">(0~{item.max}점)</span>
                                      </label>
                                      <span className="text-sm font-bold text-blue-600 w-10 text-right">
                                        {subScores[item.key] ?? 0}
                                      </span>
                                    </div>
                                    <input
                                      type="range"
                                      min="0"
                                      max={item.max}
                                      step="0.5"
                                      value={subScores[item.key] ?? 0}
                                      onChange={e => setSubScore(item.key, parseFloat(e.target.value), item.max)}
                                      className="w-full accent-blue-600"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        <div className="flex items-center justify-between px-4 py-3 bg-blue-50 rounded-xl border border-blue-200">
                          <span className="text-sm font-semibold text-blue-800">총점</span>
                          <span className="text-2xl font-bold text-blue-700">{score || 0}점</span>
                        </div>
                      </div>
                      ) : null;
                    })()}
                    {(selectedEvalType === '서류' ? docSections : presSections).length === 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">점수 (0~100점)</label>
                        <div className="space-y-2">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={score || 0}
                            onChange={e => setScore(e.target.value)}
                            className="w-full accent-blue-600"
                          />
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={score}
                              onChange={e => setScore(e.target.value)}
                              placeholder="0~100"
                              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-500">점</span>
                            {score && <span className="ml-auto text-2xl font-bold text-blue-700">{score}</span>}
                          </div>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        평가의견 <span className="text-gray-400 font-normal">(선택사항)</span>
                      </label>
                      <textarea
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        rows={4}
                        placeholder="평가 의견을 자유롭게 입력하세요."
                        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                      <div className="text-right text-xs text-gray-400 mt-1">{comment.length}자</div>
                    </div>

                    {selected?.recruit_type?.includes('대학발') && (
                      <div className="border border-indigo-200 rounded-xl p-4 bg-indigo-50 space-y-3">
                        <div className="text-sm font-semibold text-indigo-800">대학발 주력산업 일치여부</div>
                        <div className="flex gap-2">
                          {(['일치', '불일치'] as const).map(v => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setRegionMatch(regionMatch === v ? null : v)}
                              className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${regionMatch === v ? (v === '일치' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-red-500 text-white border-red-500') : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'}`}
                            >{v}</button>
                          ))}
                        </div>
                        <textarea
                          value={regionMatchComment}
                          onChange={e => setRegionMatchComment(e.target.value)}
                          rows={3}
                          placeholder="주력산업 일치여부에 대한 의견을 입력하세요."
                          className="w-full border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none bg-white"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="px-6 pb-6 pt-2 border-t border-gray-100">
                {submitMsg && (
                  <div className="mb-3 p-2.5 bg-green-50 text-green-700 text-sm rounded-lg text-center">
                    {submitMsg}
                  </div>
                )}
                {isConfirmed && selectedEv && (
                  <button
                    onClick={handlePrintEvalForm}
                    className="w-full mb-3 flex items-center justify-center gap-2 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm hover:bg-gray-50"
                  >
                    <Printer size={14} />평가표 인쇄
                  </button>
                )}
                {!isConfirmed && (
                  <>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setSelected(null)}
                        className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl text-sm hover:bg-gray-50"
                      >
                        닫기
                      </button>
                      <button
                        onClick={handleSubmit}
                        disabled={submitting || !score || parseFloat(score) === 0}
                        className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {submitting ? '저장 중...' : selectedEv ? '수정 저장' : '평가 제출'}
                      </button>
                    </div>
                    {selectedEv && (
                      <button
                        onClick={handleReset}
                        className="w-full mt-2 py-1.5 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200"
                      >
                        점수 초기화
                      </button>
                    )}
                  </>
                )}
                {selectedEv && !isConfirmed && (
                  <button
                    onClick={handlePrintEvalForm}
                    className="w-full mt-2 flex items-center justify-center gap-2 py-2 border border-gray-200 text-gray-500 rounded-xl text-xs hover:bg-gray-50"
                  >
                    <Printer size={12} />평가표 인쇄 (임시)
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Filters */}
        <div className="flex gap-3 mb-6 flex-wrap items-center">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="과제번호, 대표자, 과제명 검색"
            className="flex-1 min-w-48 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {[
              { key: 'all', label: '전체' },
              { key: 'todo', label: '미완료' },
              { key: 'done', label: '완료' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key as Filter)}
                className={`px-4 py-2 text-sm transition-colors ${filter === key ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {[
              { key: 'all', label: '전체단계' },
              { key: '서류', label: '서류' },
              { key: '발표', label: '발표' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStageFilter(key as any)}
                className={`px-3 py-2 text-sm transition-colors ${stageFilter === key ? 'bg-gray-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-sm text-gray-500">{filtered.length}개</span>
        </div>

        {/* Company cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(co => {
            const evalType = getActiveEvalType(co);
            const ev = evalType ? getEvalForCompany(co.project_no, evalType) : undefined;
            const done = isEvaluated(co);
            const confirmed = ev?.is_confirmed;

            return (
              <button
                key={co.project_no}
                onClick={() => openCompany(co)}
                className={`text-left p-5 rounded-xl border-2 transition-all hover:shadow-md ${
                  confirmed
                    ? 'border-green-300 bg-green-50'
                    : done
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-blue-300'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="font-mono text-sm font-bold text-blue-600 tracking-wide">{co.project_no}</span>
                  <div className="flex items-center gap-1">
                    {co.is_legend && <Star size={13} className="text-amber-500" />}
                    {co.is_doc_exempt && <FileCheck size={13} className="text-purple-500" />}
                    {confirmed ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-green-600 text-white text-xs rounded-full">
                        <CheckCircle size={10} />확정
                      </span>
                    ) : done ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                        <CheckCircle size={10} />완료
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-200 text-gray-500 text-xs rounded-full">
                        <Clock size={10} />미완료
                      </span>
                    )}
                  </div>
                </div>
                <div className="font-semibold text-gray-900 text-sm mb-1 leading-snug">{co.project_title}</div>
                <div className="text-xs text-gray-500 mb-2">{co.representative}</div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-1.5 flex-wrap min-w-0">
                    {co.age_group && (
                      <span className={`px-1.5 py-0.5 text-xs rounded font-medium ${co.age_group === '청년' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>{co.age_group}</span>
                    )}
                    {co.startup_stage && (
                      <span className={`px-1.5 py-0.5 text-xs rounded font-medium ${co.startup_stage.includes('예비') ? 'bg-green-100 text-green-700' : co.startup_stage.includes('초기') ? 'bg-blue-100 text-blue-700' : co.startup_stage.includes('도약') ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                        {co.startup_stage.includes('예비') ? '예비' : co.startup_stage.includes('초기') ? '초기' : co.startup_stage.includes('도약') ? '도약' : co.startup_stage}
                      </span>
                    )}
                    {co.recruit_type && (
                      <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded font-medium">{co.recruit_type}</span>
                    )}
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">{co.tech_field}</span>
                    {evalType && (
                      <span className={`px-1.5 py-0.5 text-xs rounded ${
                        evalType === '서류' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'
                      }`}>{evalType}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {ev && ev.score !== undefined && (
                      <span className="font-bold text-blue-700 text-base whitespace-nowrap">{ev.adjusted_score ?? ev.score}점</span>
                    )}
                    <button
                      onClick={e => handlePrintSingleCard(e, co)}
                      title="이 기업 평가표 인쇄"
                      className="p-1 text-gray-300 hover:text-gray-600 transition-colors rounded"
                    >
                      <Printer size={14} />
                    </button>
                  </div>
                </div>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <div className="col-span-full py-16 text-center text-gray-400">
              {companies.length === 0
                ? '배정된 기업이 없습니다. 관리자에게 문의하세요.'
                : '검색 결과가 없습니다.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
