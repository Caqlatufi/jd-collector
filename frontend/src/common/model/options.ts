import type {Direction, InterviewFormat, InterviewStatus, InterviewType, PostingSource, Recommendation, ResumeType, Stage, Tier} from './domain';

export interface Option<T extends string> {
  value: T;
  label: string;
}

export const directionOptions: Option<Direction>[] = [
  {value: 'JAVA_BACKEND', label: 'Java 后端'},
  {value: 'PLATFORM_BACKEND', label: '平台后端'},
  {value: 'AI_APPLICATION', label: 'AI 应用'},
  {value: 'FULL_STACK', label: '全栈'},
  {value: 'AI_TOOLING', label: 'AI 工具'},
  {value: 'TEST_PLATFORM', label: '测试平台开发'},
];

export const sourceOptions: Option<PostingSource>[] = [
  {value: 'BOSS', label: 'BOSS 直聘'}, {value: 'LIEPIN', label: '猎聘'},
  {value: 'OFFICIAL', label: '官网'}, {value: 'OTHER', label: '其他'},
];

export const tierOptions: Option<Tier>[] = [
  {value: 'S', label: 'S 档'}, {value: 'A', label: 'A 档'},
  {value: 'B', label: 'B 档'}, {value: 'SKIP', label: '跳过'},
];

export const recommendationOptions: Option<Recommendation>[] = [
  {value: 'DIRECT_APPLY', label: '直接投递'}, {value: 'CONTACT_FIRST', label: '先联系 HR'},
  {value: 'CUSTOM_DEMO', label: '制作定向 Demo'}, {value: 'WAIT_HC', label: '等待 HC'},
  {value: 'SKIP', label: '跳过'},
];

export const stageOptions: Option<Stage>[] = [
  {value: 'COLLECTED', label: '已收集'}, {value: 'SCREENED', label: '已筛选'},
  {value: 'TO_CONTACT', label: '待沟通'}, {value: 'READY_TO_APPLY', label: '待投递'},
  {value: 'APPLIED', label: '已投递'}, {value: 'HR_SCREEN', label: 'HR 沟通'},
  {value: 'WRITTEN_TEST', label: '笔试'}, {value: 'INTERVIEW', label: '面试'},
  {value: 'OFFER', label: 'Offer'}, {value: 'ACCEPTED', label: '已接受'},
  {value: 'REJECTED', label: '被拒'}, {value: 'WITHDRAWN', label: '主动终止'},
  {value: 'CLOSED', label: '已关闭'},
];

export const resumeTypeOptions: Option<ResumeType>[] = [
  {value: 'MASTER', label: '标准 Master'}, {value: 'AI_APPLICATION', label: 'AI 应用版'},
  {value: 'JAVA_BACKEND', label: 'Java 后端版'}, {value: 'FULL_STACK', label: '全栈版'},
  {value: 'PLATFORM_ENGINEERING', label: '平台工程版'},
  {value: 'TARGETED', label: '岗位定向版'},
];

export const interviewTypeOptions: Option<InterviewType>[] = [
  {value: 'HR', label: 'HR 面'}, {value: 'TECHNICAL', label: '技术面'},
  {value: 'MANAGER', label: '负责人面'}, {value: 'FINAL', label: '终面'}, {value: 'OTHER', label: '其他'},
];

export const interviewFormatOptions: Option<InterviewFormat>[] = [
  {value: 'ONLINE', label: '线上'}, {value: 'ONSITE', label: '现场'}, {value: 'PHONE', label: '电话'},
];

export const interviewStatusOptions: Option<InterviewStatus>[] = [
  {value: 'SCHEDULED', label: '已安排'}, {value: 'COMPLETED', label: '已完成'},
  {value: 'CANCELLED', label: '已取消'}, {value: 'NO_SHOW', label: '未出席'},
];

export const labelOf = <T extends string>(options: Option<T>[], value?: T): string =>
  options.find((item) => item.value === value)?.label ?? value ?? '-';
