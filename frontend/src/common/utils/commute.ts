// 本地人工研究保存在风险备注中；只识别明确标签，不从分数/行政区推断通勤。
export function commuteSummary(notes?: string) {
  const field = (name: string) => notes?.match(new RegExp(`^【${name}】([^\\r\\n]*)`, 'm'))?.[1]?.trim();
  const estimate = field('通勤估算');
  const hasEstimate = Boolean(estimate && !['无可靠时间', '未知', '待核验', '未核验', '暂无', '-', '未填写'].includes(estimate));
  const note = field('通勤备注') ?? '';
  return {
    estimate: hasEstimate ? estimate! : '未填写',
    hasEstimate,
    // 兼容早期自动生成的占位备注；手动提交后没有后续核验步骤。
    note: ['手动填写，待核验', '手动填写'].includes(note) ? '' : note,
    address: field('办公点证据') || '以风险备注中的证据为准',
    route: field('通勤路线') || '尚无完整路线',
  };
}
