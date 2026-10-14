export async function readJSON(request: Request, limit: number): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > limit) throw new Error('Body too large');
  const reader = request.body?.getReader(); if (!reader) throw new Error('JSON required');
  let total = 0; const chunks: Uint8Array[] = [];
  try { while (true) { const { done, value } = await Promise.race([reader.read(), new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error('Body timed out')), 5000); timer.unref(); })]); if (done) break; total += value.length; if (total > limit) { await reader.cancel(); throw new Error('Body too large'); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
