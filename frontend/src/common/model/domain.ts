export type BusinessType = 'PRODUCT' | 'TO_B_PRODUCT' | 'DELIVERY' | 'OUTSOURCING' | 'UNKNOWN';
export type ProductOwnership = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
export type ResumeType = 'MASTER' | 'AI_APPLICATION' | 'JAVA_BACKEND' | 'FULL_STACK' | 'PLATFORM_ENGINEERING' | 'TARGETED';
export type Direction = 'JAVA_BACKEND' | 'PLATFORM_BACKEND' | 'AI_APPLICATION' | 'FULL_STACK' | 'AI_TOOLING' | 'TEST_PLATFORM';
export type PostingSource = 'BOSS' | 'LIEPIN' | 'OFFICIAL' | 'OTHER';
export type Tier = 'S' | 'A' | 'B' | 'SKIP';
export type Recommendation = 'DIRECT_APPLY' | 'CONTACT_FIRST' | 'CUSTOM_DEMO' | 'WAIT_HC' | 'SKIP';
export type Stage = 'COLLECTED' | 'SCREENED' | 'TO_CONTACT' | 'READY_TO_APPLY' | 'APPLIED' | 'HR_SCREEN' | 'WRITTEN_TEST' | 'INTERVIEW' | 'OFFER' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'CLOSED';
export type TermPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type InterviewType = 'HR' | 'TECHNICAL' | 'MANAGER' | 'FINAL' | 'OTHER';
export type InterviewFormat = 'ONLINE' | 'ONSITE' | 'PHONE';
export type InterviewStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface Company {
  id: number;
  name: string;
  alias?: string;
  businessType: BusinessType;
  productOwnership: ProductOwnership;
  address?: string;
  commuteMinutes?: number;
  qualityScore?: number;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CompanySave = Omit<Company, 'id' | 'createdAt' | 'updatedAt'>;

export interface ResumeVersion {
  id: number;
  name: string;
  type: ResumeType;
  versionLabel: string;
  contentMarkdown?: string;
  templateKey: 'CLASSIC_BLUE';
  photoUrl?: string;
  active: boolean;
  archived?: boolean;
  notes?: string;
  blockCount: number;
  contentReady: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ResumeSave = Pick<ResumeVersion, 'name' | 'type' | 'versionLabel' | 'templateKey' | 'photoUrl' | 'active' | 'notes'> & {
  contentMarkdown: string;
};

export interface ResumeContentBlock {
  id: number;
  sectionKey: string;
  heading?: string;
  headingLevel: number;
  chunkIndex: number;
  sortOrder: number;
  contentMarkdown: string;
  contentPlainText: string;
  characterCount: number;
  contentHash: string;
}

export interface Posting {
  id: number;
  companyId: number;
  companyName: string;
  title: string;
  direction: Direction;
  source: PostingSource;
  sourceUrl?: string;
  rawJd: string;
  location?: string;
  salaryMinK?: number;
  salaryMaxK?: number;
  salaryMonths?: number;
  experienceMin?: number;
  experienceMax?: number;
  publishedAt?: string;
  recruiterActiveAt?: string;
  officialSynchronized?: boolean;
  requiredSkills?: string;
  bonusSkills?: string;
  matchPoints?: string;
  skillGaps?: string;
  riskNotes?: string;
  blockingRisk: boolean;
  matchScore: number;
  companyScore: number;
  freshnessScore: number;
  commuteScore: number;
  salaryScore: number;
  totalScore: number;
  tier: Tier;
  recommendation: Recommendation;
  manualOverrideReason?: string;
  stage: Stage;
  resumeVersionId?: number;
  resumeVersionName?: string;
  appliedAt?: string;
  nextAction?: string;
  nextActionAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type PostingSave = Omit<Posting, 'id' | 'companyName' | 'totalScore' | 'tier' | 'recommendation' | 'stage' | 'resumeVersionId' | 'resumeVersionName' | 'appliedAt' | 'nextAction' | 'nextActionAt' | 'createdAt' | 'updatedAt'> & {
  tier?: Tier;
  recommendation?: Recommendation;
};

export interface PostingKnowledgeTerm {
  term: string;
  normalizedTerm: string;
  priority: TermPriority;
  weight: number;
}

export interface PostingTerms {
  postingId: number;
  processed: boolean;
  extractorVersion?: string;
  sourceHash?: string;
  stale: boolean;
  updatedAt?: string;
  terms: PostingKnowledgeTerm[];
}

export interface PostingKnowledgeOption {
  postingId: number;
  companyName: string;
  title: string;
  direction: Direction;
  tier: Tier;
  stage: Stage;
  processed: boolean;
  termCount: number;
  stale: boolean;
}

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  documentCount: number;
  weightedCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  postingIds: number[];
}

export interface KnowledgeGraphEdge {
  source: string;
  target: string;
  documentCount: number;
  weightedCount: number;
  postingIds: number[];
}

export interface PostingKnowledgeGraph {
  selectedPostingCount: number;
  processedPostingCount: number;
  taggedPostingCount: number;
  stalePostingCount: number;
  unprocessedPostingIds: number[];
  emptyPostingIds: number[];
  stalePostingIds: number[];
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

export interface StageEvent {
  id: number;
  fromStage?: Stage;
  toStage: Stage;
  occurredAt: string;
  note?: string;
}

export interface StageChange {
  toStage: Stage;
  resumeVersionId?: number;
  occurredAt?: string;
  appliedAt?: string;
  nextAction?: string;
  nextActionAt?: string;
  note?: string;
}

export interface Interview {
  id: number;
  jobPostingId: number;
  jobTitle: string;
  companyName: string;
  roundNo: number;
  type: InterviewType;
  format: InterviewFormat;
  scheduledAt: string;
  status: InterviewStatus;
  interviewer?: string;
  questions?: string;
  feedback?: string;
  nextStep?: string;
  createdAt: string;
  updatedAt: string;
}

export type InterviewSave = Omit<Interview, 'id' | 'jobPostingId' | 'jobTitle' | 'companyName' | 'createdAt' | 'updatedAt'>;

export interface DashboardAction {
  postingId: number;
  companyName: string;
  title: string;
  tier: Tier;
  stage: Stage;
  nextAction: string;
  nextActionAt: string;
}

export interface DashboardInterview {
  interviewId: number;
  postingId: number;
  companyName: string;
  jobTitle: string;
  roundNo: number;
  type: InterviewType;
  format: InterviewFormat;
  scheduledAt: string;
}

export interface DashboardData {
  serverNow?: string;
  planItems?: DashboardPlanItem[];
  todayActions: DashboardAction[];
  overdueActions: DashboardAction[];
  nextSevenDayInterviews: DashboardInterview[];
  stageCounts: Partial<Record<Stage, number>>;
  tierCounts: Partial<Record<Tier, number>>;
  conversion: {
    collected: number;
    applied: number;
    hrScreen: number;
    interviewed: number;
    offered: number;
    applyRate: number;
    interviewRate: number;
    offerRate: number;
  };
}

export interface DashboardPlanItem {
  id: string;
  postingId: number;
  interviewId?: number;
  companyName: string;
  jobTitle: string;
  tier: Tier;
  kind: 'FOLLOW_UP' | 'INTERVIEW';
  title: string;
  description: string;
  scheduledAt?: string;
  status: 'PLANNED' | 'OVERDUE' | 'COMPLETED' | 'UNSCHEDULED' | 'NO_SHOW';
}
