import client from '@/common/api/request';
import type {Posting, Stage, StageChange, StageEvent} from '@/common/model/domain';
import type {RestResultResponse} from '@/common/model/response';

export const pipelineApi = {
  updateApplicationDate: async (id: number, expectedAppliedAt: string, appliedAt: string) =>
    (await client.put<RestResultResponse<Posting>>(`/postings/${id}/application-date`, {expectedAppliedAt, appliedAt})).data.result,
  updateEvent: async (id: number, eventId: number, expectedOccurredAt: string, occurredAt: string, note: string) =>
    (await client.put<RestResultResponse<StageEvent[]>>(`/postings/${id}/events/${eventId}`, {expectedOccurredAt, occurredAt, note})).data.result,
  recordResult: async (id: number, data: {expectedStage: Stage; result: Stage; note?: string}) =>
    (await client.put<RestResultResponse<Posting>>(`/postings/${id}/result`, data)).data.result,
  changeContactStage: async (id: number, toStage: Stage, expectedStage: Stage) =>
    (await client.put<RestResultResponse<Posting>>(`/postings/${id}/contact-stage`, {toStage, expectedStage})).data.result,
  changeStage: async (id: number, data: StageChange) =>
    (await client.put<RestResultResponse<Posting>>(`/postings/${id}/stage`, data)).data.result,
  events: async (id: number) =>
    (await client.get<RestResultResponse<StageEvent[]>>(`/postings/${id}/events`)).data.result,
};
