// Pure platform recipe names. PNG-calibrated steps live in ignored runtime, never DOM selectors.
export default {
  platform: 'BOSS',
  steps: [
    'search.input', 'search.submit',
    'region.open', 'region.openEmpty', 'region.district', 'region.area', 'region.kangjian',
    'region.clear', 'region.confirm',
    'region.metro', 'region.line1', 'region.line3', 'region.caobao',
    'region.caoxi', 'region.shilong',
    'experience.open', 'experience.select', 'experience.clear', 'experience.13', 'experience.35',
    'experience.remove13', 'experience.remove35', 'experience.confirm',
    'salary.open', 'salary.select', 'salary.clear', 'salary.10to20',
    'salary.min', 'salary.max', 'salary.confirm',
    'size.open', 'size.select', 'size.more', 'size.clear', 'size.100to499',
    'size.500to999', 'size.1000to9999', 'size.remove10000', 'size.confirm',
    'education.open', 'education.clear', 'education.bachelor', 'education.confirm',
    'type.open', 'type.select', 'type.clear', 'type.fulltime', 'type.confirm',
    'menu.close'
  ]
};
