export interface Division {
  id: string;
  year: number;
  division_label: string;   // 'A', 'B', 'C', 'D' or '정보통신1' etc.
  division_name: string;    // '정보·통신', '기계·소재 / 에너지·자원'
  chair_name?: string;
}

export interface TechField {
  id: string;
  year: number;
  division_id: string;
  field_name: string;
}

export interface Evaluator {
  id: string;
  year: number;
  name: string;
  password?: string;
  role: 'admin' | 'evaluator';
  division_id?: string;
  division?: Division;
  evaluator_order?: number;   // 1~5
  email?: string;
  phone?: string;
}

export interface Company {
  project_no: string;
  year: number;
  representative: string;
  birth_info?: string;
  gender?: string;
  age_group?: string;          // '청년' | '중장년'
  startup_stage?: string;      // '예비' | '초기' | '도약'
  recruit_type?: string;
  region?: string;
  support_field?: string;
  tech_field: string;
  ict_sub_field?: string;
  division_id?: string;
  division?: Division;
  revenue?: number;
  employees?: number;
  contact_phone?: string;
  contact_mobile?: string;
  email?: string;
  login_id?: string;
  address?: string;
  project_title: string;
  is_legend?: boolean;
  is_excluded?: boolean;
  exclusion_reason?: string;
  is_doc_exempt?: boolean;
  doc_exempt_reason?: string;
  employment_target?: number;
  revenue_target?: number;
  investment_target?: number;
  requirement_check?: string;
  eval_date?: string;
  notes?: string;
  stage: '서류' | '발표' | '완료';
  result?: '통과' | '예비' | '탈락' | null;
  file_path?: string;
}

export interface BonusPoint {
  id?: number;
  company_id: string;
  year: number;
  bonus_type: string;   // '가점1' | '가점2' | '가점3'
  reason?: string;
  points: number;
}

export interface Evaluation {
  id?: number;
  company_id: string;
  evaluator_id: string;
  evaluation_type: '서류' | '발표';
  score?: number;
  comment?: string;
  is_knockout?: boolean;
  adjusted_score?: number;
  adjusted_by?: string;
  adjusted_at?: string;
  adjustment_reason?: string;
  is_confirmed?: boolean;
  confirmed_at?: string;
  submitted_at?: string;
  sub_scores?: Record<string, number>;
  region_match?: boolean;
  region_match_comment?: string;
  evaluator?: Pick<Evaluator, 'id' | 'name' | 'evaluator_order'>;
}

export interface CompanyScoreRow {
  company: Company;
  evaluations: Evaluation[];       // one per evaluator (in evaluator_order)
  scores: (number | null)[];       // [v1, v2, v3, v4, v5]
  avg_score: number;               // (합계 - 최고 - 최저) / 3
  bonus_total: number;
  final_score: number;             // avg_score + bonus_total
  rank: number;
  has_knockout: boolean;
  all_confirmed: boolean;
}

export type AdminView =
  | 'dashboard'
  | 'divisions'
  | 'evaluators'
  | 'companies'
  | 'score-review'
  | 'report';

export type AppView = 'login' | 'admin' | 'evaluator';
