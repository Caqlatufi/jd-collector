import client from '@/common/api/request';
import type {ResumeContentBlock, ResumeSave, ResumeVersion} from '@/common/model/domain';
import type {RestResultResponse} from '@/common/model/response';

export const resumeApi = {
  starter: async () =>
    (await client.get<RestResultResponse<Pick<ResumeSave, 'contentMarkdown' | 'templateKey' | 'photoUrl' | 'versionLabel'>>>('/resume-starter')).data.result,
  archive: async (id: number) =>
    (await client.post<RestResultResponse<ResumeVersion>>(`/resume-versions/${id}/archive`)).data.result,
  list: async (params: {active?: boolean; type?: string} = {}) =>
    (await client.get<RestResultResponse<ResumeVersion[]>>('/resume-versions', {params})).data.result,
  get: async (id: number) =>
    (await client.get<RestResultResponse<ResumeVersion>>(`/resume-versions/${id}`)).data.result,
  blocks: async (id: number) =>
    (await client.get<RestResultResponse<ResumeContentBlock[]>>(`/resume-versions/${id}/blocks`)).data.result,
  save: async (data: ResumeSave, id?: number) =>
    (id
      ? await client.put<RestResultResponse<ResumeVersion>>(`/resume-versions/${id}`, data)
      : await client.post<RestResultResponse<ResumeVersion>>('/resume-versions', data)).data.result,
};
