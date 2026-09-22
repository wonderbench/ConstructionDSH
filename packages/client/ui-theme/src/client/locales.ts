/** `settings.theme` namespace dictionaries (the Appearance and font-size rows' copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'appearance.title': '外观',
  'appearance.light': '浅色',
  'appearance.dark': '深色',
  'appearance.system': '跟随系统',
  'fontSize.title': '字号大小',
  'fontSize.description': '仅影响会话内容的字号',
  'fontSize.unit': 'px',
  'fontSize.increase': '增大字号',
  'fontSize.decrease': '减小字号',
  'outputDenoise.title': '输出降噪',
  'outputDenoise.beta': 'Beta',
  'outputDenoise.description': '实验功能：默认收起模型的说明性内容，只保留结论与成果',
  'outputDenoise.toggle': '切换输出降噪',
  'uiMode.title': '界面模式',
  'uiMode.description': '仅影响界面呈现，不改变功能与权限；审批与确认在任何模式下都完整显示',
  'uiMode.business': '业务',
  'uiMode.expert': '专家',
} satisfies Record<string, string>

/** The settings.theme namespace key union. */
export type ThemeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'appearance.title': 'Appearance',
  'appearance.light': 'Light',
  'appearance.dark': 'Dark',
  'appearance.system': 'System',
  'fontSize.title': 'Font size',
  'fontSize.description': 'Only affects conversation content',
  'fontSize.unit': 'px',
  'fontSize.increase': 'Increase font size',
  'fontSize.decrease': 'Decrease font size',
  'outputDenoise.title': 'Output denoise',
  'outputDenoise.beta': 'Beta',
  'outputDenoise.description': 'Experimental: folds explanatory model output by default, keeping conclusions and results',
  'outputDenoise.toggle': 'Toggle output denoise',
  'uiMode.title': 'Interface mode',
  'uiMode.description': 'Affects presentation only — never changes features or permissions; approvals and confirmations stay visible in every mode',
  'uiMode.business': 'Business',
  'uiMode.expert': 'Expert',
} satisfies Record<ThemeKey, string>
