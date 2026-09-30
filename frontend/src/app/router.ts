import type {App} from 'vue';
import {createRouter, createWebHistory, type RouteRecordRaw} from 'vue-router';

export default function install(app: App): void {
  const routes: RouteRecordRaw[] = app.config.globalProperties.$routes || [];
  const router = createRouter({history: createWebHistory('/jd-collector/'), routes});
  app.use(router);
}
