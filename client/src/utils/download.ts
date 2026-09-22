/**
 * 前端侧导出工具。
 *
 * 说明：正式的报名名单 / 统计 Excel 由后端 exceljs 生成（成员 D 负责），
 * 见 `ApiEnvelope` 之外的 blob 接口。这里提供一份**零依赖**的兜底导出，
 * 用于后端导出接口尚未就绪时演示与应急。
 */

/** 把二维数据导出为 .xlsx（实为 Excel 可直接打开的 HTML 表格，兼容中文） */
export function exportExcelTable(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
): void {
  const escapeHtml = (value: string | number | null | undefined) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const head = headers.map((h) => `<th style="font-weight:600;background:#f0f5ff">${escapeHtml(h)}</th>`).join('');
  const body = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td style="text-align:center">${escapeHtml(cell)}</td>`).join('')}</tr>`
    )
    .join('\n');

  const html =
    `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8" />` +
    `<style>td,th{border:1px solid #d9d9d9;padding:4px 8px;font-family:Arial}</style></head>` +
    `<body><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;

  const blob = new Blob(['﻿', html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  triggerDownload(blob, filename.endsWith('.xls') ? filename : `${filename}.xls`);
}

/** CSV 导出（带 BOM，避免 Excel 打开中文乱码） */
export function exportCsv(filename: string, rows: string[][]): void {
  const escape = (cell: string) => {
    const s = String(cell ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((row) => row.map(escape).join(',')).join('\r\n');
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
