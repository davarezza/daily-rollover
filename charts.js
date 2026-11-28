import { escapeHtml, formatCompact, formatIDR } from './format.js';

const niceCeil = (value) => {
    if (value <= 0) return 1000;
    const magnitude = 10 ** Math.floor(Math.log10(value));
    return [1, 2, 5, 10].find((factor) => value <= factor * magnitude) * magnitude;
};

const tipAttrs = ({ title, value, note }) =>
    `data-tip-title="${escapeHtml(title)}" data-tip-value="${escapeHtml(value)}" data-tip-note="${escapeHtml(note)}"`;

export const tableHtml = (headers, rows) => `
    <details class="viz-table">
        <summary>Lihat sebagai tabel</summary>
        <div class="overflow-x-auto">
            <table>
                <thead><tr>${headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('')}</tr></thead>
                <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
            </table>
        </div>
    </details>`;

export const columnChartHtml = (items, headers) => {
    const peak = Math.max(...items.map((item) => item.value));
    const top = niceCeil(Math.max(peak, ...items.map((item) => item.target)));
    const percent = (value) => `${(value / top) * 100}%`;

    const column = (item) => {
        const over = item.target > 0 && item.value > item.target;
        const labelled = item.value > 0 && (over || item.current || item.value === peak);
        return `
            <div class="viz-col" tabindex="0" role="img" aria-label="${escapeHtml(item.aria)}" ${tipAttrs(item.tip)}>
                ${item.value > 0 ? `<div class="viz-bar${over ? ' is-over' : ''}" style="height:max(${percent(item.value)}, 2px)"></div>` : ''}
                ${item.target > 0 ? `<div class="viz-target" style="bottom:${percent(item.target)}"></div>` : ''}
                ${labelled ? `<span class="viz-value" style="bottom:calc(${percent(item.value)} + 4px)">${over ? '▲' : ''}${formatCompact(item.value)}</span>` : ''}
            </div>`;
    };

    const axisLabel = (item) =>
        `<span class="viz-x${item.current ? ' is-current' : ''}">${escapeHtml(item.label)}<small>${escapeHtml(item.caption)}</small></span>`;

    const chart = `
        <div class="viz" style="--n:${items.length}">
            <div class="viz-plot">
                <div class="viz-grid" style="bottom:100%"><span>${formatCompact(top)}</span></div>
                <div class="viz-grid" style="bottom:50%"><span>${formatCompact(top / 2)}</span></div>
                <div class="viz-cols">${items.map(column).join('')}</div>
            </div>
            <div class="viz-xaxis">${items.map(axisLabel).join('')}</div>
        </div>`;

    const rows = items.map((item) => [item.tableLabel, formatIDR(item.value), item.target > 0 ? formatIDR(item.target) : '—']);
    return chart + tableHtml(headers, rows);
};

export const rankedBarsHtml = (rows) => {
    const max = Math.max(...rows.map((row) => row.value));
    const width = (value) => (value > 0 ? Math.max((value / max) * 100, 1) : 0);
    return `
        <div class="rank-list">
            ${rows.map((row) => `
                <div class="rank-row" tabindex="0" ${tipAttrs(row.tip)}>
                    <div class="rank-head"><span>${escapeHtml(row.name)}</span><strong>${escapeHtml(row.display)}</strong></div>
                    <div class="rank-track"><div class="rank-bar${row.rest ? ' is-rest' : ''}" style="width:${width(row.value)}%"></div></div>
                </div>`).join('')}
        </div>`;
};

const describeChange = (comparison) => {
    if (comparison.percent === null) {
        return { tone: 'flat', icon: '–', text: comparison.current > 0 ? 'Belum ada pengeluaran minggu lalu di periode ini' : 'Belum ada pengeluaran di kedua minggu' };
    }
    if (comparison.delta === 0) return { tone: 'flat', icon: '=', text: 'Sama dengan minggu lalu' };
    const lower = comparison.delta < 0;
    const sign = comparison.percent > 0 ? '+' : '−';
    return {
        tone: lower ? 'good' : 'bad',
        icon: lower ? '▼' : '▲',
        text: `${lower ? 'Lebih hemat' : 'Lebih boros'} ${formatIDR(Math.abs(comparison.delta))} (${sign}${Math.abs(comparison.percent)}%)`
    };
};

const deltaCell = (current, previous) => {
    const delta = current - previous;
    if (delta === 0) return '<span class="delta is-flat">–</span>';
    return `<span class="delta ${delta < 0 ? 'is-good' : 'is-bad'}">${delta < 0 ? '▼' : '▲'} ${escapeHtml(formatIDR(Math.abs(delta)))}</span>`;
};

export const comparisonHtml = (comparison, periodLabel) => {
    const change = describeChange(comparison);
    const bars = rankedBarsHtml([
        { name: 'Minggu ini', value: comparison.current, display: formatIDR(comparison.current), tip: { title: 'Minggu ini', value: formatIDR(comparison.current), note: periodLabel } },
        { name: 'Minggu lalu', value: comparison.previous, display: formatIDR(comparison.previous), rest: true, tip: { title: 'Minggu lalu', value: formatIDR(comparison.previous), note: periodLabel } }
    ]);
    const rows = comparison.categories.map((row) => `
        <tr>
            <th scope="row">${escapeHtml(row.category)}</th>
            <td>${escapeHtml(formatIDR(row.current))}</td>
            <td>${escapeHtml(formatIDR(row.previous))}</td>
            <td>${deltaCell(row.current, row.previous)}</td>
        </tr>`).join('');

    return `
        <p class="viz-verdict is-${change.tone}"><span aria-hidden="true">${change.icon}</span> ${escapeHtml(change.text)}</p>
        ${bars}
        ${rows ? `
            <div class="overflow-x-auto">
                <table class="viz-compare">
                    <thead><tr><th scope="col">Kategori</th><th scope="col">Ini</th><th scope="col">Lalu</th><th scope="col">Selisih</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>` : ''}
        <p class="viz-note">Total minggu lalu penuh: ${escapeHtml(formatIDR(comparison.previousFull))}</p>`;
};
