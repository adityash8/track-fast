'use client';
import { useRef, useState, type FormEvent, type ChangeEvent } from 'react';
import Link from 'next/link';
import { Report, importReport, results } from '../../cli/report.mjs';
import type { z } from 'zod';
type DoctorReport = z.infer<typeof Report>;
type Expected = DoctorReport['expected'];
const labels = { ga4: 'Google Analytics 4', posthog: 'PostHog', mixpanel: 'Mixpanel' };
export default function Home() {
  const [url, setUrl] = useState('');
  const [expected, setExpected] = useState<Expected>('any');
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const command = `trackfast doctor ${/^https?:\/\//.test(url) ? `'${url.replace(/'/g, `'\\''`)}'` : 'https://your-site.example'} --expect ${expected} --json --output report.json`;
  async function inspect(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setError(''); setBusy(true); setReport(null);
    try {
      const response = await fetch('/api/inspect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, expected }), signal: AbortSignal.timeout(25000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Inspection failed. Retry or import a CLI report.');
      setReport(Report.parse(data));
      requestAnimationFrame(() => resultHeading.current?.focus());
    } catch (e) { setError(e instanceof Error && e.name !== 'TimeoutError' ? e.message : 'Inspection timed out. Retry or import a CLI report.'); }
    finally { setBusy(false); }
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setError('');
    try {
      if (file.size > 5000000) throw new Error('Choose a CLI JSON or HAR file under 5 MB.');
      setReport(importReport(JSON.parse(await file.text()), expected));
      requestAnimationFrame(() => resultHeading.current?.focus());
    } catch { setError('Could not read this report. Choose a Trackfast JSON or DevTools HAR under 5 MB. Your existing report is preserved.'); }
    event.target.value = '';
  }
  function exportReport() {
    if (!report) return;
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = objectUrl; link.download = 'trackfast-report.json'; link.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
  const rows = report ? results(report) : [];
  return <>
    <a className="skip" href="#main">Skip to inspector</a>
    <header className="topbar"><Link className="brand" href="/">Trackfa.st <span>Analytics doctor</span></Link><nav aria-label="Resources"><a href="#setup">Setup</a><a href="/downloads/SETUP.md" download>Docs</a><a className="download" href="/downloads/trackfast-doctor-0.1.0.tgz" download>Download CLI</a></nav></header>
    <main id="main">
      <div className="intro"><p className="section-label">Tracking diagnostics</p><h1>Find the break in your analytics.</h1><p>Inspect a website, then use browser evidence to separate a loaded SDK from an accepted event.</p></div>
      <div className="workspace">
        <aside className="controls">
          <h2>Inspect a website</h2><p className="muted">Use a public URL you are authorized to inspect. Static scans do not send test events.</p>
          <form onSubmit={inspect}>
            <label htmlFor="url">Website URL</label><input id="url" type="url" required maxLength={2048} value={url} placeholder="https://your-site.example" onChange={e => { setUrl(e.target.value); setCopied(false); }} aria-describedby="url-help"/>
            <p id="url-help" className="hint">Public HTTP(S), port 80 or 443. Private networks are blocked.</p>
            <label htmlFor="vendor">Expected vendor</label><select id="vendor" value={expected} onChange={e => { const value = e.target.value as Expected; setExpected(value); if (report) setReport({ ...report, expected: value }); }}><option value="any">Any detected vendor</option><option value="ga4">Google Analytics 4</option><option value="posthog">PostHog</option><option value="mixpanel">Mixpanel</option></select>
            <button type="submit" className="primary" disabled={busy}>{busy ? 'Inspecting HTML and scripts…' : 'Inspect website'}</button>
          </form>
          <div className="import-block"><h3>Have browser evidence?</h3><p className="muted">Import CLI JSON or a DevTools HAR. Files stay in this tab; sensitive request data is discarded.</p><label htmlFor="report-file">Import report <span className="hint">JSON / HAR · up to 5 MB</span></label><input disabled={busy} id="report-file" type="file" accept=".json,.har,application/json" onChange={importFile}/></div>
          {error && <p role="alert" className="error">{error}</p>}
        </aside>
        <section className="report" aria-busy={busy} aria-labelledby="report-heading">
          <div className="report-toolbar"><h2 id="report-heading" ref={resultHeading} tabIndex={-1}>Evidence report</h2>{report && <button onClick={exportReport}>Export JSON</button>}</div>
          {busy ? <div role="status" className="empty"><div className="loading-line"/><h3>Reading website references</h3><p>Fetching bounded HTML and up to four scripts. This usually finishes within 20 seconds.</p></div> : !report ? <div className="empty"><div className="evidence-path" aria-label="Evidence stages"><span>SDK loaded</span><span>Request sent</span><span>Response accepted</span></div><h3>No site inspected yet</h3><p>Enter your website to find SDK references. For event delivery, download the CLI and import its browser report.</p><p className="muted">No score, sample traffic or provider health is assumed.</p></div> : <>
            <div className="report-meta"><strong>{report.target}</strong><span>{report.source === 'static' ? 'Static inspection' : report.source === 'har' ? 'Imported HAR' : 'Browser observation'} · {new Date(report.checkedAt).toLocaleString()}</span></div>
            <p className="report-note">{report.source === 'static' ? 'Static scans can detect SDK references. Request delivery remains unknown until you capture browser traffic.' : 'Imported evidence is supplied by the operator. Accepted responses do not prove downstream ingestion.'}</p>
            <div className="vendor-list">{rows.map(row => <article className="vendor-row" key={row.vendor}>
              <div className="vendor-title"><h3>{labels[row.vendor as keyof typeof labels]}</h3><span className={`status ${row.status}`}>{row.status}</span></div>
              <dl><div><dt>Reference</dt><dd>{row.detected ? 'Detected' : 'Not observed'}</dd></div><div><dt>Collection requests</dt><dd>{row.requests}</dd></div><div><dt>Provider acceptance</dt><dd>{row.accepted ? 'Observed' : 'Not confirmed'}</dd></div><div><dt>Downstream receipt</dt><dd>Unknown</dd></div></dl>
              <p>{row.explanation}</p>
              {report.evidence.filter(e => e.vendor === row.vendor).length > 0 && <details><summary>View recorded evidence</summary><ul>{report.evidence.filter(e => e.vendor === row.vendor).map((e, i) => <li key={i}><code>{e.kind}</code> {e.endpoint}{e.status !== undefined ? ` · HTTP ${e.status}` : ''}{e.accepted === false ? ' · rejected' : ''}</li>)}</ul></details>}
              {row.status !== 'pass' && <p className="fix"><strong>Template fix:</strong> {row.fix} Regenerate with <code>npm run gen:schema</code>, then rerun the doctor. If consent blocks tracking, grant it manually before exporting a HAR.</p>}
            </article>)}</div>
            <details className="notes"><summary>Scope and limits</summary><ul>{report.notes.map((note, index) => <li key={index}>{note}</li>)}</ul><p>Reports are kept in this tab. Export before closing it. Custom proxies, delayed events and consent gates can leave results unknown.</p></details>
          </>}
        </section>
      </div>
      <section id="setup" className="setup"><div><h2>Capture what the browser actually sends</h2><p>Install the downloadable package with Node 20+. The CLI observes normal page traffic and records real provider responses. It never injects events by default.</p><code className="install">npm install -g ./trackfast-doctor-0.1.0.tgz</code></div><div><label htmlFor="cli-command">Run on your authorized site</label><textarea id="cli-command" readOnly value={command} rows={3}/><button onClick={async () => { try { await navigator.clipboard.writeText(command); setCopied(true); } catch { setError('Clipboard unavailable. Select and copy the command below.'); } }}>{copied ? 'Copied command' : 'Copy command'}</button><span className="copy-status" role="status">{copied ? 'Ready to paste in your terminal.' : ''}</span><p className="hint">Exit 0: accepted · 1: failed · 2: unknown · 3: could not run. Import report.json here to review the evidence.</p></div></section>
      <footer><span>Trackfa.st · Observation first</span><a href="/api/track" target="_blank" rel="noreferrer">Own template configuration</a><a href="/downloads/SETUP.md" download>Read setup and privacy limits</a></footer>
    </main>
  </>;
}
