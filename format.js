import { parseDate } from './budget.js';

export const formatIDR = (amount) => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
}).format(amount);

export const formatCompact = (amount) => new Intl.NumberFormat('id-ID', {
    notation: 'compact',
    maximumFractionDigits: 1
}).format(amount);

export const formatSigned = (amount) => `${amount < 0 ? '−' : '+'} ${formatIDR(Math.abs(amount))}`;

export const formatDate = (dateStr, options) => parseDate(dateStr).toLocaleDateString('id-ID', options);

export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
));
