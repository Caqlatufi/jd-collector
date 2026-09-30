import client from '@/common/api/request';
import type {
  Direction,
  PostingKnowledgeGraph,
  PostingKnowledgeOption,
  PostingTerms,
  Stage,
  TermPriority,
  Tier,
} from '@/common/model/domain';
import type {RestResultResponse} from '@/common/model/response';

export interface KnowledgeOptionFilters {
  keyword?: string;
  direction?: Direction;
  tier?: Tier;
  stage?: Stage;
}

export interface ReplacePostingTerms {
  extractorVersion: string;
  terms: {term: string; priority: TermPriority}[];
}

export interface GraphRequest {
  postingIds?: number[] | null;
  minDocumentCount?: number;
  minEdgeDocumentCount?: number;
  maxNodes?: number;
}

export const postingKnowledgeApi = {
  options: async (params: KnowledgeOptionFilters = {}) =>
    (await client.get<RestResultResponse<PostingKnowledgeOption[]>>('/posting-knowledge/postings', {params})).data.result,
  terms: async (postingId: number) =>
    (await client.get<RestResultResponse<PostingTerms>>(`/posting-knowledge/postings/${postingId}/terms`)).data.result,
  replaceTerms: async (postingId: number, data: ReplacePostingTerms) =>
    (await client.put<RestResultResponse<PostingTerms>>(`/posting-knowledge/postings/${postingId}/terms`, data)).data.result,
  graph: async (data: GraphRequest) =>
    (await client.post<RestResultResponse<PostingKnowledgeGraph>>('/posting-knowledge/graph', data)).data.result,
};
