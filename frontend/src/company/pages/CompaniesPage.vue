<script setup lang="ts">
import {companyApi} from '@/company/api/companyApi';
import ShanghaiCompanyMap from '@/company/components/ShanghaiCompanyMap.vue';
import type {BusinessType, Company, CompanySave, ProductOwnership} from '@/common/model/domain';
import {showRequestError} from '@/common/utils/error';
import {desktop} from '@/common/desktop/client';
import {ElMessage} from 'element-plus';
import {onMounted, reactive, ref} from 'vue';
import {useRouter} from 'vue-router';

const router = useRouter();

const rows = ref<Company[]>([]);
const loading = ref(false);
const dialogVisible = ref(false);
const editingId = ref<number>();
const keyword = ref('');
const viewMode = ref('list');
const saving = ref(false);

const businessOptions: {value: BusinessType; label: string}[] = [
  {value: 'PRODUCT', label: '产品公司'}, {value: 'TO_B_PRODUCT', label: 'ToB 产品'},
  {value: 'DELIVERY', label: '交付型'}, {value: 'OUTSOURCING', label: '外包'}, {value: 'UNKNOWN', label: '待核实'},
];
const ownershipOptions: {value: ProductOwnership; label: string}[] = [
  {value: 'HIGH', label: '核心自研'}, {value: 'MEDIUM', label: '部分自研'},
  {value: 'LOW', label: '低/实施为主'}, {value: 'UNKNOWN', label: '待核实'},
];

const emptyForm = (): CompanySave => ({
  name: '', alias: '', officialApplicationUrl: '', businessType: 'UNKNOWN', productOwnership: 'UNKNOWN', address: '',
  commuteMinutes: undefined, qualityScore: undefined, notes: '', active: true, workLocations: [],
});
const form = reactive<CompanySave>(emptyForm());

const load = async () => {
  loading.value = true;
  try {
    rows.value = await companyApi.all(keyword.value);
  } catch (error) {
    showRequestError(error, '公司列表加载失败');
  } finally {
    loading.value = false;
  }
};

const openCreate = () => {
  editingId.value = undefined;
  Object.assign(form, emptyForm());
  dialogVisible.value = true;
};

const openEdit = (row: Company) => {
  editingId.value = row.id;
  Object.assign(form, {
    name: row.name, alias: row.alias ?? '', businessType: row.businessType,
    officialApplicationUrl: row.officialApplicationUrl ?? '',
    productOwnership: row.productOwnership, address: row.address ?? '',
    commuteMinutes: row.commuteMinutes, qualityScore: row.qualityScore,
    notes: row.notes ?? '', active: row.active,
    workLocations: (row.workLocations?.length ? row.workLocations : row.address ? [{address: row.address}] : [])
      .map(location => ({...location})),
  });
  dialogVisible.value = true;
};

const viewPostings = (row: Company) => {
  router.push({path: '/postings', query: {companyId: row.id.toString()}});
};

const openOfficialApplication = async (row: Company) => {
  if (!row.officialApplicationUrl) return;
  try {
    await desktop.request('browser.open', {
      key: `company-careers:${row.id}`, url: row.officialApplicationUrl, title: `${row.name} · 官方招聘`,
    });
  } catch (error) { showRequestError(error, '官方招聘页面打开失败'); }
};

const save = async () => {
  if (saving.value) return;
  if (!form.name.trim()) {
    ElMessage.warning('请填写公司名称');
    return;
  }
  if (form.workLocations?.some(location => !location.address.trim())) {
    ElMessage.warning('请填写每个工作地点的地址，或移除空地点');
    return;
  }
  if (form.workLocations?.some(location => (location.longitude == null) !== (location.latitude == null))) {
    ElMessage.warning('经纬度必须同时填写，也可以同时留空');
    return;
  }
  saving.value = true;
  try {
    await companyApi.save({...form}, editingId.value);
    ElMessage.success(editingId.value ? '公司已更新' : '公司已新增');
    dialogVisible.value = false;
    await load();
  } catch (error) {
    showRequestError(error);
  } finally {
    saving.value = false;
  }
};

const addLocation = () => {
  form.workLocations ??= [];
  form.workLocations.push({label: '', address: '', longitude: undefined, latitude: undefined});
};

onMounted(load);
</script>

<template>
  <section class="page-stack">
    <div class="page-toolbar">
      <div class="toolbar-search">
        <el-input v-model="keyword" clearable placeholder="搜索公司或简称" @keyup.enter="load" />
        <el-button @click="load">查询</el-button>
      </div>
      <div class="company-view-actions">
        <el-radio-group v-model="viewMode" aria-label="公司库视图">
          <el-radio-button value="list">公司列表</el-radio-button>
          <el-radio-button value="map">上海地图</el-radio-button>
        </el-radio-group>
        <el-button type="primary" @click="openCreate">新增公司</el-button>
      </div>
    </div>

    <ShanghaiCompanyMap v-if="viewMode === 'map'" :companies="rows" @edit="openEdit" @postings="viewPostings" />

    <div v-else class="table-panel">
      <el-table v-loading="loading" :data="rows" stripe empty-text="还没有公司，先录入目标公司">
        <el-table-column label="公司" min-width="180">
          <template #default="{row}">
            <strong>{{ row.name }}</strong>
            <div class="cell-subtitle">{{ row.alias || '无简称' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="业务属性" width="130">
          <template #default="{row}">{{ businessOptions.find(i => i.value === row.businessType)?.label }}</template>
        </el-table-column>
        <el-table-column label="产品所有权" width="125">
          <template #default="{row}">{{ ownershipOptions.find(i => i.value === row.productOwnership)?.label }}</template>
        </el-table-column>
        <el-table-column label="地址" min-width="180">
          <template #default="{row}">
            <div>{{ row.address || row.workLocations?.[0]?.address || '待补充' }}</div>
            <div v-if="row.workLocations?.length > 1" class="cell-subtitle">{{ row.workLocations.length }} 个工作地点 · 上海地图查看</div>
          </template>
        </el-table-column>
        <el-table-column label="官网投递渠道" width="135">
          <template #default="{row}">
            <el-button v-if="row.officialApplicationUrl" link type="primary" @click="openOfficialApplication(row)">官方招聘</el-button>
            <span v-else>未确认</span>
          </template>
        </el-table-column>
        <el-table-column label="通勤" width="90"><template #default="{row}">{{ row.commuteMinutes == null ? '-' : `${row.commuteMinutes} 分钟` }}</template></el-table-column>
        <el-table-column label="质量" width="80"><template #default="{row}">{{ row.qualityScore ?? '-' }}/20</template></el-table-column>
        <el-table-column label="状态" width="85"><template #default="{row}"><el-tag :type="row.active ? 'success' : 'info'">{{ row.active ? '启用' : '停用' }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{row}">
            <el-button link type="primary" @click="viewPostings(row)">查看 JD</el-button>
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑公司' : '新增公司'" width="680px">
      <el-form label-position="top" class="form-grid two-columns">
        <el-form-item label="公司名称" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="简称"><el-input v-model="form.alias" /></el-form-item>
        <el-form-item label="官网投递渠道链接" class="full-span"><el-input v-model="form.officialApplicationUrl" maxlength="2048" aria-label="官网投递渠道链接" placeholder="公司官方招聘页或官网指向的招聘站；未确认则留空" /></el-form-item>
        <el-form-item label="业务属性" required><el-select v-model="form.businessType"><el-option v-for="item in businessOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
        <el-form-item label="产品所有权" required><el-select v-model="form.productOwnership"><el-option v-for="item in ownershipOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
        <el-form-item label="办公地址"><el-input v-model="form.address" /></el-form-item>
        <el-form-item label="单程通勤（分钟）"><el-input-number v-model="form.commuteMinutes" :min="0" :max="300" /></el-form-item>
        <el-form-item label="公司质量评分（0–20）"><el-input-number v-model="form.qualityScore" :min="0" :max="20" /></el-form-item>
        <el-form-item label="用于新 JD"><el-switch v-model="form.active" active-text="启用" inactive-text="停用" /></el-form-item>
        <div class="full-span work-locations-editor">
          <div class="work-locations-heading"><strong>工作地点</strong><el-button :disabled="(form.workLocations?.length ?? 0) >= 50" @click="addLocation">添加工作地点</el-button></div>
          <p>支持多个办公点；填写上海地址后可在地图定位。经纬度为可选项，使用 WGS84 坐标；留空不会编造具体办公位置。</p>
          <div v-for="(location, index) in form.workLocations" :key="index" class="work-location-row">
            <div class="work-location-title"><strong>地点 {{ index + 1 }}</strong><el-button link type="danger" @click="form.workLocations?.splice(index, 1)">移除</el-button></div>
            <el-input v-model="location.label" :aria-label="`地点${index + 1}名称`" placeholder="地点名称，例如总部 / 徐汇办公点（选填）" maxlength="120" />
            <el-input v-model="location.address" :aria-label="`地点${index + 1}地址`" placeholder="工作地址，例如上海市徐汇区宜山路868号" maxlength="255" />
            <div class="coordinate-inputs">
              <el-input-number v-model="location.longitude" :aria-label="`地点${index + 1}经度`" :controls="false" :min="-180" :max="180" :precision="6" placeholder="经度（选填）" />
              <el-input-number v-model="location.latitude" :aria-label="`地点${index + 1}纬度`" :controls="false" :min="-90" :max="90" :precision="6" placeholder="纬度（选填）" />
            </div>
          </div>
        </div>
        <el-form-item label="研究备注" class="full-span"><el-input v-model="form.notes" type="textarea" :rows="5" placeholder="产品、团队、HC、驻场/实施风险等" /></el-form-item>
      </el-form>
      <template #footer><el-button :disabled="saving" @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </el-dialog>
  </section>
</template>

<style scoped lang="scss">
.company-view-actions { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
.work-locations-heading, .work-location-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.work-locations-editor > p { color: #879189; font-size: 12px; line-height: 1.7; }
.work-location-row { display: grid; gap: 10px; padding: 14px; border: 1px solid #e3e8de; border-radius: 10px; margin-top: 12px; background: #fafbf7; }
.work-location-title { font-size: 13px; color: #425647; }
.coordinate-inputs { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; .el-input-number { width: 100%; } }
</style>
