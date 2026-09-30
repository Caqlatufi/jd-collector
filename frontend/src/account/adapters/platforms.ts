import type {PlatformAdapter} from '../../common/desktop/platform';

/** Domain/session ownership only. Job contents are obtained from native screenshots. */
export const platformAdapters: PlatformAdapter[] = [
  {platform: 'BOSS', name: 'BOSS直聘', homeUrl: 'https://www.zhipin.com/shanghai/', domains: ['zhipin.com'], sessionKey: 'www_zhipin_com', sourceQueryKeys: ['jobId']},
  {platform: 'LIEPIN', name: '猎聘', homeUrl: 'https://www.liepin.com/', domains: ['liepin.com'], sessionKey: 'www_liepin_com', sourceQueryKeys: ['jobId']},
  {platform: 'JOB51', name: '前程无忧', homeUrl: 'https://www.51job.com/', domains: ['51job.com'], sessionKey: 'www_51job_com', sourceQueryKeys: ['jobid', 'jobId']},
  {platform: 'ZHAOPIN', name: '智联招聘', homeUrl: 'https://www.zhaopin.com/', domains: ['zhaopin.com'], sessionKey: 'www_zhaopin_com', sourceQueryKeys: ['jobId', 'positionId']},
];
