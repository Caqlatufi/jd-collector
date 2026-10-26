import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyCodexFailure, createCodexDiagnostics, failurePayload} from './errors.mjs';

test('final capacity error takes precedence over retries and model-list timeouts', () => {
  const diagnostics = createCodexDiagnostics();
  diagnostics.stderr('failed to refresh available models: request timed out\nunexpected status 503 Service Unavailable');
  diagnostics.stdout('{"type":"error","message":"Reconnecting... 2/5 (unexpected status 503 Service Unavailable)"}\n');
  const line = '{"type":"turn.failed","error":{"message":"Selected model is at capacity. Please try a different model."}}';
  diagnostics.stdout(line.slice(0,30));
  diagnostics.stdout(line.slice(30));
  assert.deepEqual(diagnostics.failure(false,1), {errorCode:'CODEX_MODEL_CAPACITY',httpStatus:503,exitCode:1});
});

test('login, quota, model, transport and CLI failures remain distinguishable', () => {
  for (const [message,code] of [
    ['refresh_token_reused', 'CODEX_AUTH_EXPIRED'],
    ['unexpected status 401 Unauthorized', 'CODEX_AUTH_REQUIRED'],
    ['You have hit your usage limit', 'CODEX_USAGE_LIMIT'],
    ['unexpected status 429 Too Many Requests', 'CODEX_RATE_LIMIT'],
    ['The model is not supported when using Codex with a ChatGPT account', 'CODEX_MODEL_UNAVAILABLE'],
    ['unexpected status 403 Forbidden', 'CODEX_PERMISSION_DENIED'],
    ['unexpected argument --ignore-rules', 'CODEX_ARGUMENTS'],
    ['unexpected status 502 Bad Gateway', 'CODEX_SERVER_UNAVAILABLE'],
    ['stream disconnected before completion: error sending request', 'CODEX_NETWORK'],
  ]) assert.equal(classifyCodexFailure(message),code,message);
  assert.equal(failurePayload(Object.assign(new Error('spawn failed'),{code:'ENOENT'})).errorCode,'CODEX_UNAVAILABLE');
  assert.equal(failurePayload(new Error('CODEX_NOT_FOUND')).errorCode,'CODEX_UNAVAILABLE');
});

test('timeout preserves upstream reason and diagnostics never expose raw secrets or assistant text', () => {
  const diagnostics = createCodexDiagnostics();
  diagnostics.stdout('{"type":"item.completed","item":{"type":"agent_message","text":"private resume; unauthorized"}}\n');
  diagnostics.stderr('request timed out; Bearer secret-token; private resume');
  const error = Object.assign(new Error('private resume'), {diagnostic:diagnostics.failure(true,null)});
  assert.deepEqual(failurePayload(error),{ok:false,errorCode:'CODEX_TIMEOUT',causeCode:'CODEX_NETWORK'});
  assert.equal(JSON.stringify(failurePayload(error)).includes('private'),false);
  assert.deepEqual(failurePayload(Object.assign(new Error('secret-token'),{diagnostic:{errorCode:'secret-token',httpStatus:1000,message:'secret-token'}})),{ok:false,errorCode:'CODEX_FAILED'});
  assert.equal(createCodexDiagnostics().failure(false,2).errorCode,'CODEX_FAILED');
});

test('oversized unknown diagnostics remain bounded and retain failure semantics', () => {
  const diagnostics = createCodexDiagnostics();
  diagnostics.stdout('x'.repeat(100000));
  diagnostics.stderr('x'.repeat(100000));
  assert.deepEqual(diagnostics.failure(false,1),{errorCode:'CODEX_FAILED',exitCode:1});
});
