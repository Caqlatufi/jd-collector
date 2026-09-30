<script setup lang="ts">
import {companyApi} from '@/company/api/companyApi';
import type {BusinessType, Company, CompanySave, ProductOwnership} from '@/common/model/domain';
import {showRequestError} from '@/common/utils/error';
import {ElMessage} from 'element-plus';
import {onMounted, reactive, ref} from 'vue';
import {useRouter} from 'vue-router';

const router = useRouter();

const rows = ref<Company[]>([]);
const loading = ref(false);
const dialogVisible = ref(false);
const editingId = ref<number>();
const keyword = ref('');

const businessOptions: {value: BusinessType; label: string}[] = [
  {value: 'PRODUCT', label: '产品公司'}, {value: 'TO_B_PRODUCT', label: 'ToB 产品'},
  {value: 'DELIVERY', label: '交付型'}, {value: 'OUTSOURCING', label: '外包'}, {value: 'UNKNOWN', label: '待核实'},
];
const ownershipOptions: {value: ProductOwnership; label: string}[] = [
  {value: 'HIGH', label: '核心自研'}, {value: 'MEDIUM', label: '部分自研'},
  {value: 'LOW', label: '低/实施为主'}, {value: 'UNKNOWN', label: '待核实'},
];

const emptyForm = (): CompanySave => ({
  name: '', alias: '', businessType: 'UNKNOWN', productOwnership: 'UNKNOWN', address: '',
  commuteMinutes: undefined, qualityScore: undefined, notes: '', active: true,
});
const form = reactive<CompanySave>(emptyForm());

const load = async () => {
  loading.value = true;
  try {
    rows.value = (await companyApi.list({keyword: keyword.value, size: 100})).result;
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
    productOwnership: row.productOwnership, address: row.address ?? '',
    commuteMinutes: row.commuteMinutes, qualityScore: row.qualityScore,
    notes: row.notes ?? '', active: row.active,
  });
  dialogVisible.value = true;
};

const viewPostings = (row: Company) => {
  router.push({path: '/postings', query: {companyId: row.id.toString()}});
};

const save = async () => {
  if (!form.name.trim()) {
    ElMessage.warning('请填写公司名称');
    return;
  }
  try {
    await companyApi.save({...form}, editingId.value);
    ElMessage.success(editingId.value ? '公司已更新' : '公司已新增');
    dialogVisible.value = false;
    await load();
  } catch (error) {
    showRequestError(error);
  }
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
      <el-button type="primary" @click="openCreate">新增公司</el-button>
    </div>

    <div class="table-panel">
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
        <el-table-column prop="address" label="地址" min-width="180" show-overflow-tooltip />
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
        <el-form-item label="业务属性" required><el-select v-model="form.businessType"><el-option v-for="item in businessOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
        <el-form-item label="产品所有权" required><el-select v-model="form.productOwnership"><el-option v-for="item in ownershipOptions" :key="item.value" v-bind="item" /></el-select></el-form-item>
        <el-form-item label="办公地址"><el-input v-model="form.address" /></el-form-item>
        <el-form-item label="单程通勤（分钟）"><el-input-number v-model="form.commuteMinutes" :min="0" :max="300" /></el-form-item>
        <el-form-item label="公司质量评分（0–20）"><el-input-number v-model="form.qualityScore" :min="0" :max="20" /></el-form-item>
        <el-form-item label="用于新 JD"><el-switch v-model="form.active" active-text="启用" inactive-text="停用" /></el-form-item>
        <el-form-item label="研究备注" class="full-span"><el-input v-model="form.notes" type="textarea" :rows="5" placeholder="产品、团队、HC、驻场/实施风险等" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
    </el-dialog>
  </section>
</template>
