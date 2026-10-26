const limit = 65536;
const statusPattern = /(?:unexpected status|HTTP(?: status)?|status(?: code)?)\s*[:=]?\s*(4\d{2}|5\d{2})\b/i;

export function classifyCodexFailure(message) {
  if (/selected model is at capacity|model.*(?:overloaded|at capacity)/i.test(message)) return 'CODEX_MODEL_CAPACITY';
  if (/refresh_token_reused|refresh token.*(?:expired|revoked|already)|token.*(?:expired|revoked)|invalid_grant/i.test(message)) return 'CODEX_AUTH_EXPIRED';
  if (/not logged in|please (?:log|sign) in|authentication required|unauthorized|invalid_api_key|authentication_error|\b401\b/i.test(message)) return 'CODEX_AUTH_REQUIRED';
  if (/insufficient_quota|usage limit|quota exceeded|exceeded.*quota/i.test(message)) return 'CODEX_USAGE_LIMIT';
  if (/rate_limit|rate limit|too many requests|\b429\b/i.test(message)) return 'CODEX_RATE_LIMIT';
  if (/model.*(?:not supported|not found|does not exist|do not have access)|unsupported.*model|model_not_found/i.test(message)) return 'CODEX_MODEL_UNAVAILABLE';
  if (/permission denied|forbidden|\b403\b/i.test(message)) return 'CODEX_PERMISSION_DENIED';
  if (/unexpected argument|unrecognized option|unknown (?:option|flag|variant)|invalid value.*(?:--|feature)/i.test(message)) return 'CODEX_ARGUMENTS';
  if (/\b50[0234]\b|service unavailable|internal server error|bad gateway/i.test(message)) return 'CODEX_SERVER_UNAVAILABLE';
  if (/request timed out|connection.*(?:failed|refused|reset|closed)|stream disconnected|error sending request|dns|certificate|tls|ENOTFOUND|ECONN|ETIMEDOUT/i.test(message)) return 'CODEX_NETWORK';
  return 'CODEX_FAILED';
}

// Only error events are considered. Assistant messages, JD/resume text, and raw
// diagnostics never leave this process. Output contains allowlisted codes/numbers.
export function createCodexDiagnostics() {
  let pending = '';
  let stderr = '';
  let latestError = '';
  let finalError = '';
  function readLine(line) {
    try {
      const event = JSON.parse(line);
      if (event.type === 'error' && typeof event.message === 'string') latestError = event.message.slice(-limit);
      if (event.type === 'turn.failed' && typeof event.error?.message === 'string') finalError = event.error.message.slice(-limit);
    } catch { /* Non-JSON output is not a public diagnostic. */ }
  }
  return {
    stdout(chunk) {
      pending += chunk;
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        readLine(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
      }
      if (pending.length > limit) pending = pending.slice(-limit);
    },
    stderr(chunk) { stderr = (stderr + chunk).slice(-limit); },
    failure(timedOut, exitCode) {
      if (pending) { readLine(pending); pending = ''; }
      const message = finalError || latestError || stderr;
      const causeCode = classifyCodexFailure(message);
      const status = (message.match(statusPattern) || stderr.match(statusPattern))?.[1];
      return {
        errorCode: timedOut ? 'CODEX_TIMEOUT' : causeCode,
        ...(timedOut && causeCode !== 'CODEX_FAILED' ? {causeCode} : {}),
        ...(status ? {httpStatus: Number(status)} : {}),
        ...(Number.isInteger(exitCode) ? {exitCode} : {}),
      };
    },
  };
}

export function failurePayload(error) {
  const allowed = new Set(['CODEX_TIMEOUT', 'CODEX_FAILED', 'CODEX_MODEL_CAPACITY', 'CODEX_AUTH_EXPIRED',
    'CODEX_AUTH_REQUIRED', 'CODEX_USAGE_LIMIT', 'CODEX_RATE_LIMIT', 'CODEX_MODEL_UNAVAILABLE',
    'CODEX_PERMISSION_DENIED', 'CODEX_ARGUMENTS', 'CODEX_SERVER_UNAVAILABLE', 'CODEX_NETWORK',
    'CODEX_UNAVAILABLE', 'INVALID_RESULT', 'INVALID_INPUT']);
  const diagnostic = error.diagnostic || {};
  const errorCode = allowed.has(diagnostic.errorCode) ? diagnostic.errorCode
    : allowed.has(error.message) ? error.message
    : error.message === 'CODEX_NOT_FOUND' || ['ENOENT', 'EACCES', 'EPERM'].includes(error.code) ? 'CODEX_UNAVAILABLE' : 'CODEX_FAILED';
  return {ok: false, errorCode,
    ...(allowed.has(diagnostic.causeCode) ? {causeCode: diagnostic.causeCode} : {}),
    ...(Number.isInteger(diagnostic.httpStatus) && diagnostic.httpStatus >= 400 && diagnostic.httpStatus <= 599 ? {httpStatus: diagnostic.httpStatus} : {}),
    ...(Number.isInteger(diagnostic.exitCode) ? {exitCode: diagnostic.exitCode} : {}),
  };
}
