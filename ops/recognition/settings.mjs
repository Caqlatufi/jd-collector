export const defaultRecognitionSettings = Object.freeze({model: 'gpt-6-astra', reasoningEffort: 'medium'});

export function recognitionSettings(env = process.env) {
  const model = env.JD_RECOGNITION_MODEL || defaultRecognitionSettings.model;
  const reasoningEffort = env.JD_RECOGNITION_REASONING_EFFORT || defaultRecognitionSettings.reasoningEffort;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$/.test(model) ||
      !['low', 'medium', 'high', 'xhigh'].includes(reasoningEffort)) {
    throw new Error('INVALID_RECOGNITION_SETTINGS');
  }
  return {model, reasoningEffort};
}
