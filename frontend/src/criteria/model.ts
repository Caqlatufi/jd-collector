export interface Criterion {
  id: string;
  label: string;
  value: string | null;
  hint: string;
  kind: string;
  status: 'PENDING' | 'CONFIRMED';
  options?: string[];
}

export interface CriteriaSection {
  id: string;
  title: string;
  notes: string[];
  fields: Criterion[];
}

export interface CriteriaDocument {
  schemaVersion: number;
  formVersion?: number;
  baselineRules?: Criterion[];
  agentNotes?: string[];
  title: string;
  description: string;
  sections: CriteriaSection[];
}

export interface CriteriaResponse {
  revision: string;
  document: CriteriaDocument;
}

export interface CriteriaAnswer {
  id: string;
  value: string | null;
  kind: string;
  status: Criterion['status'];
}
