import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

export function isPublicAddress(address: string): boolean {
  if (net.isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 192 && b === 88) || (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0));
  }
  // Only global unicast IPv6. Reject mapped, local, multicast, transition and documentation ranges.
  return net.isIP(address) === 6 && /^[23][0-9a-f]{0,3}:/i.test(address) && !/^(2001:|2002:|3fff:)/i.test(address);
}
export async function resolvePublic(raw: string, lookup = dns.lookup) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || raw.length > 2048 || url.port && !['80', '443'].includes(url.port)) throw new Error('Use a public HTTP(S) URL on port 80 or 443, without credentials.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const records = net.isIP(hostname) ? [{ address: hostname, family: net.isIP(hostname) }] : await lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some(record => !isPublicAddress(record.address))) throw new Error('Private, local and reserved network addresses are blocked.');
  return { url, address: records[0].address, family: records[0].family };
}
export async function safeFetch(raw: string, deadline = Date.now() + 15000, redirects = 0): Promise<{ text: string; url: string; contentType: string }> {
  if (redirects > 4 || Date.now() >= deadline) throw new Error('Inspection exceeded its redirect or time limit.');
  const remaining = deadline - Date.now();
  const resolved = await Promise.race([resolvePublic(raw), new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error('DNS lookup timed out.')), remaining); timer.unref(); })]);
  const { url, address, family } = resolved;
  const result = await new Promise<{ status: number; location?: string; text: string; contentType: string }>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).request(url, {
      method: 'GET', headers: { 'User-Agent': 'TrackfastDoctor/0.1 (static inspection)', Accept: 'text/html, application/javascript, text/javascript, text/plain' },
      // Pin the validated address while preserving TLS hostname verification and Host header.
      lookup: (_host, _opts, callback) => callback(null, address, family), agent: false,
    }, response => {
      const status = response.statusCode || 0;
      const contentType = String(response.headers['content-type'] || '');
      if (status >= 300 && status < 400) { response.destroy(); resolve({ status, location: response.headers.location, text: '', contentType }); return; }
      if (status < 200 || status >= 300) { response.destroy(); reject(new Error(`Website returned HTTP ${status}.`)); return; }
      if (!/text\/|javascript|html/i.test(contentType)) { response.destroy(); reject(new Error('Website did not return HTML or a text script.')); return; }
      let size = 0; const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 750000) { response.destroy(); reject(new Error('Website or script exceeds 750 KB.')); } else chunks.push(chunk); });
      response.on('error', () => reject(new Error('Website response interrupted.')));
      response.on('end', () => resolve({ status, text: Buffer.concat(chunks).toString('utf8'), contentType }));
    });
    const timer = setTimeout(() => request.destroy(new Error('Website request timed out.')), Math.max(1, deadline - Date.now()));
    request.on('close', () => clearTimeout(timer));
    request.on('error', () => reject(new Error('Website could not be fetched safely. Check the URL or import a browser report.')));
    request.end();
  });
  if (result.status >= 300 && result.status < 400) {
    if (!result.location) throw new Error('Redirect is missing a destination.');
    return safeFetch(new URL(result.location, url).href, deadline, redirects + 1);
  }
  return { text: result.text, url: url.href, contentType: result.contentType };
}
