import { Injectable, Logger } from '@nestjs/common';
import { ReportingService } from '../reporting/reporting.service';
import * as fs from 'fs';
import * as path from 'path';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import type { Browser } from 'puppeteer-core';
import { Buffer } from 'node:buffer';

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return '-';
  return typeof n === 'number' ? n.toString() : String(n);
}

@Injectable()
export class PdfExportService {
  private readonly logger = new Logger(PdfExportService.name);

  constructor(private reporting: ReportingService) {}

  private ensureDir(p: string) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }

  // ---------- HTML builders ----------
  private buildSettersHtml(title: string, rows: any[], from?: string, to?: string) {
    const period = [from, to].filter(Boolean).join(' → ');
    const tableRows = rows.map((r: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td>${r.name}</td>
        <td>${r.email}</td>
        <td>${r.leadsReceived}</td>
        <td>${r.rv0Count}</td>
        <td>${r.rv1FromHisLeads}</td>
        <td>${fmt(r.ttfcAvgMinutes)}</td>
        <td>${fmt(r.revenueFromHisLeads)}</td>
        <td>${fmt(r.cpl)}</td>
        <td>${fmt(r.cpRv0)}</td>
        <td>${fmt(r.cpRv1)}</td>
        <td>${fmt(r.roas)}</td>
      </tr>
    `).join('');

    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 24px; }
    h1 { margin: 0 0 4px 0; font-size: 20px; }
    .muted { color: #666; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="muted">Période : ${period || '—'}</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Setter</th>
        <th>Email</th>
        <th>Leads reçus</th>
        <th>RV0</th>
        <th>RV1 (sur ses leads)</th>
        <th>TTFC (min)</th>
        <th>CA via ses leads</th>
        <th>CPL</th>
        <th>CP-RV0</th>
        <th>CP-RV1</th>
        <th>ROAS</th>
      </tr>
    </thead>
    <tbody>${tableRows || '<tr><td colspan="12">Aucune donnée</td></tr>'}</tbody>
  </table>
</body>
</html>`;
  }

  private buildClosersHtml(title: string, rows: any[], from?: string, to?: string) {
    const period = [from, to].filter(Boolean).join(' → ');
    const tableRows = rows.map((r: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td>${r.name}</td>
        <td>${r.email}</td>
        <td>${r.rv1Planned}</td>
        <td>${r.rv1Honored}</td>
        <td>${r.rv1NoShow}</td>
        <td>${r.rv2Planned}</td>
        <td>${r.rv2Honored}</td>
        <td>${r.salesClosed}</td>
        <td>${fmt(r.revenueTotal)}</td>
        <td>${fmt(r.rosPlanned)}</td>
        <td>${fmt(r.rosHonored)}</td>
      </tr>
    `).join('');

    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 24px; }
    h1 { margin: 0 0 4px 0; font-size: 20px; }
    .muted { color: #666; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="muted">Période : ${period || '—'}</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Closer</th>
        <th>Email</th>
        <th>RV1 planifiés</th>
        <th>RV1 honorés</th>
        <th>RV1 no-show</th>
        <th>RV2 planifiés</th>
        <th>RV2 honorés</th>
        <th>Ventes</th>
        <th>CA</th>
        <th>ROS (planifiés)</th>
        <th>ROS (honorés)</th>
      </tr>
    </thead>
    <tbody>${tableRows || '<tr><td colspan="12">Aucune donnée</td></tr>'}</tbody>
  </table>
</body>
</html>`;
  }

  // ---------- helpers ----------
  async htmlToPdfBuffer(html: string): Promise<Buffer> {
    let browser: Browser | undefined;
    try {
      const resolvedPath = process.env.PUPPETEER_EXECUTABLE_PATH ?? await chromium.executablePath();
      browser = await puppeteer.launch({
        executablePath: resolvedPath,
        headless: 'shell',
        args: chromium.args,
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const pdfData = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
      });
      return Buffer.from(pdfData);
    } catch (err: unknown) {
      this.logger.error(`PDF error: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    } finally {
      await browser?.close();
    }
  }


  // ----- Setters -----
  async exportSettersHtml(from?: string, to?: string): Promise<string> {
    const rows = await this.reporting.settersReport(from, to);
    return this.buildSettersHtml('Bilan Setters', rows, from, to);
  }

  async exportSettersPdf(from?: string, to?: string): Promise<Buffer> {
    const html = await this.exportSettersHtml(from, to);
    return this.htmlToPdfBuffer(html);
  }

  async exportAndArchiveSetters(from?: string, to?: string): Promise<{ pdf: Buffer; filepath: string }> {
    const pdf = await this.exportSettersPdf(from, to);
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const baseDir = path.resolve(process.env.VERCEL ? '/tmp' : process.cwd(), 'storage', 'reports', 'setters', ym);
    this.ensureDir(baseDir);
    const filepath = path.join(baseDir, `report_setters_${ts}.pdf`);
    fs.writeFileSync(filepath, pdf);
    return { pdf, filepath };
  }

  // ----- Closers -----
  async exportClosersHtml(from?: string, to?: string): Promise<string> {
    const rows = await this.reporting.closersReport(from, to);
    return this.buildClosersHtml('Bilan Closers', rows, from, to);
  }

  async exportClosersPdf(from?: string, to?: string): Promise<Buffer> {
    const html = await this.exportClosersHtml(from, to);
    return this.htmlToPdfBuffer(html);
  }

  async exportAndArchiveClosers(from?: string, to?: string): Promise<{ pdf: Buffer; filepath: string }> {
    const pdf = await this.exportClosersPdf(from, to);
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const baseDir = path.resolve(process.env.VERCEL ? '/tmp' : process.cwd(), 'storage', 'reports', 'closers', ym);
    this.ensureDir(baseDir);
    const filepath = path.join(baseDir, `report_closers_${ts}.pdf`);
    fs.writeFileSync(filepath, pdf);
    return { pdf, filepath };
  }
  
}
