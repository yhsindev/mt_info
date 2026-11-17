import type { PlanDraft } from './types';

export function exportFilename(draft: PlanDraft, suffix: string): string {
  const extension = suffix.replace(/^\.+/, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'txt';
  let title = (draft.title || '登山行程草稿').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '');
  title = Array.from(title || '登山行程草稿').slice(0, 80).join('');
  if (/^(?:con|prn|aux|nul|com\d|lpt\d)$/i.test(title)) title = `行程_${title}`;
  const date = /^\d{4}-\d\d-\d\d$/.test(draft.startDate) ? `_${draft.startDate}` : '';
  return `${title}${date}.${extension}`;
}
