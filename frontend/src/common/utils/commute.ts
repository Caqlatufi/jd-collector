// 本地人工研究保存在风险备注中；只识别明确标签，不从分数/行政区推断通勤。
export function commuteSummary(notes?: string) {
  const field = (name: string) => notes?.match(new RegExp(`^【${name}】([^\\r\\n]+)`, 'm'))?.[1]?.trim();
  return {
    status: field('通勤状态') || '未核验',
    estimate: field('通勤估算') || '无可靠时间',
    address: field('办公点证据') || '以风险备注中的证据为准',
    route: field('通勤路线') || '尚无完整路线',
  };
}
