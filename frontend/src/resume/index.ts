import {baseInstall} from '@/common/config/baseInstall';
import type {App} from 'vue';
import type {RouteRecordRaw} from 'vue-router';

const routes: RouteRecordRaw[] = [{
  path: '/resumes', name: 'resumes', meta: {title: '简历版本'},
  component: () => import('./pages/ResumesPage.vue'),
}, {
  path: '/resumes/:id/edit', name: 'resume-editor', meta: {title: '编辑简历'},
  component: () => import('./pages/ResumeEditorPage.vue'),
}, {
  path: '/resumes/:id/view', name: 'resume-view', meta: {title: '简历预览'},
  component: () => import('./pages/ResumeViewPage.vue'),
}];

export default function install(app: App): void { baseInstall(app, {routes}); }
