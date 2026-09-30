<script setup lang="ts">
import {onMounted, onBeforeUnmount, ref, reactive} from 'vue';
import {desktop} from '@/common/desktop/client';
import type {BrowserState} from '@/common/desktop/contract';
import type {PlatformDefinition, PlatformCode} from '@/common/desktop/platform';

const available = desktop.available();
const platforms = ref<PlatformDefinition[]>([]);
const tabs = ref<BrowserState[]>([]);
const busy = reactive<Record<string, boolean>>({});
const errors = reactive<Record<string, string>>({});
const error = ref('');
const opened = (platform: string) => tabs.value.some(tab => tab.platform === platform && tab.status !== 'closed');
let unsubscribe = () => {};
async function open(platform: PlatformCode) {
  if (busy[platform]) return;
  busy[platform] = true; errors[platform] = '';
  try { await desktop.request('platform.open', {platform}); }
  catch (e) { errors[platform] = e instanceof Error ? e.message : '打开失败，请重启客户端后重试'; }
  finally { busy[platform] = false; }
}
onMounted(async () => {
  if (!available) return;
  unsubscribe = desktop.on('browser.changed', tab => {
    tabs.value = tabs.value.filter(item => item.key !== tab.key);
    if (tab.status !== 'closed') tabs.value.push(tab);
  });
  try {
    platforms.value = await desktop.request('platform.list', {});
    tabs.value = await desktop.request('browser.list', {});
  } catch { error.value = '平台入口加载失败，请重启客户端后重试。'; }
});
onBeforeUnmount(() => unsubscribe());
</script>

<template>
  <section class="accounts-page">
    <div class="account-intro">
      <span class="eyebrow">RECRUITMENT PLATFORMS</span>
      <h2>你负责登录，找岗位交给我</h2>
      <p>在内置页面完成登录，然后在对话里告诉我想找的公司或职位。搜索、读取和整理由对应平台的 workflow 执行。</p>
    </div>
    <el-alert v-if="!available" title="请从桌面快捷方式打开 JD Collector，再进入招聘平台登录。" type="info" :closable="false" />
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <div v-if="available" class="account-grid">
      <article v-for="platform in platforms" :key="platform.platform" class="account-card" :data-platform="platform.platform">
        <div class="account-heading">
          <div><span class="eyebrow">{{ platform.platform }}</span><h3>{{ platform.name }}</h3></div>
          <span class="platform-status">{{ opened(platform.platform) ? '页面已打开' : '尚未打开' }}</span>
        </div>
        <p>扫码、短信或密码登录均在网站内完成。遇到验证码时由你处理，登录会话保留在本机客户端。</p>
        <el-alert v-if="errors[platform.platform]" :title="errors[platform.platform]" type="warning" :closable="false" />
        <el-button type="primary" :loading="busy[platform.platform]" @click="open(platform.platform)">
          {{ opened(platform.platform) ? '返回平台' : '打开平台 / 去登录' }}
        </el-button>
      </article>
    </div>
    <p class="account-note">页面已打开不代表已登录。无需选择标签、手动读取或保存会话；关闭标签不会清除已有登录状态。</p>
  </section>
</template>

<style scoped>
.accounts-page{display:grid;gap:22px;min-width:0}.account-intro h2{margin:10px 0;font-size:25px}
.account-intro p,.account-card p,.account-note{color:#718078;line-height:1.8;font-size:14px}
.account-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}
.account-card{min-width:0;display:flex;flex-direction:column;gap:20px;padding:26px;border:1px solid #e0e7df;border-radius:20px;background:white}
.account-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.account-heading h3{margin:8px 0;font-size:24px}
.platform-status{background:#eef2ee;color:#526258;padding:6px 10px;border-radius:6px;font-size:12px}
.account-card .el-button{align-self:flex-start;margin-top:auto}
@media(max-width:760px){.account-grid{grid-template-columns:1fr}}
</style>
