/** URL syntax only. Whether the page is a JD is decided from screenshots. */
export function normalizeJobUrl(value) {
  if (typeof value !== 'string' || value.length > 1000) throw new Error('INVALID_URL');
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.port) throw new Error('INVALID_URL');
  if (['www.zhipin.com', 'zhipin.com'].includes(url.hostname) && /^\/job_detail\/[a-zA-Z0-9_~-]{1,100}\.html$/.test(url.pathname)) {
    return 'https://www.zhipin.com' + url.pathname;
  }
  // Preserve functional query parameters and SPA fragments used to identify jobs.
  for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key)) url.searchParams.delete(key);
  return url.href;
}
