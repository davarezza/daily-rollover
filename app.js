import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getFirestore,
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    collection,
    doc,
    setDoc,
    deleteDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { DEFAULT_WORKDAYS, addDays, calculateMetrics, getWeekRange, normalizeWorkdays, parseDate, sumAmount, toDateStr } from "./budget.js";
import { compareWeeks, getCategoryTotals, getDailySeries, getWeeklyTotals } from "./analytics.js";
import { columnChartHtml, comparisonHtml, rankedBarsHtml, tableHtml } from "./charts.js";
import { escapeHtml, formatDate, formatIDR, formatSigned } from "./format.js";

const firebaseConfig = {
    apiKey: "AIzaSyDRned2SdcBCoH0Yx-CWW1PMrmQskM8Jp8",
    authDomain: "daily-rollover.firebaseapp.com",
    projectId: "daily-rollover",
    storageBucket: "daily-rollover.firebasestorage.app",
    messagingSenderId: "152110821224",
    appId: "1:152110821224:web:ca1dfd917a2710d57f70dd",
    measurementId: "G-P3SWM1RSXW"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

const createDb = () => {
    try {
        return initializeFirestore(firebaseApp, {
            localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
        });
    } catch {
        return getFirestore(firebaseApp);
    }
};
const db = createDb();

const DEFAULT_BUDGET = 700000;
const CATEGORIES = ['Makanan & Minuman', 'Transportasi', 'Belanja', 'Tagihan', 'Hiburan', 'Lainnya'];
const DAY_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const BADGE_CLASS = 'px-2 py-0.5 text-xs font-semibold rounded-full';
const INSTALL_DISMISSED_KEY = 'install-dismissed';

const TONES = {
    safe: { label: 'Aman', badge: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-500' },
    warn: { label: 'Mendekati Batas', badge: 'bg-amber-100 text-amber-800', bar: 'bg-amber-500' },
    over: { label: 'Terlampaui', badge: 'bg-rose-100 text-rose-800', bar: 'bg-rose-500' }
};

const DAY_CHIPS = {
    past: 'bg-slate-100 text-slate-400',
    today: 'bg-indigo-600 text-white',
    upcoming: 'bg-indigo-50 text-indigo-600 border border-indigo-200'
};

const AUTH_COPY = {
    login: {
        title: 'Masuk ke Daily Rollover',
        subtitle: 'Kelola budget harian dan mingguan secara terorganisir.',
        submit: 'Masuk',
        switchText: 'Belum punya akun?',
        switchAction: 'Daftar sekarang'
    },
    register: {
        title: 'Daftar Akun Daily Rollover',
        subtitle: 'Buat akun baru untuk mulai mencatat keuanganmu.',
        submit: 'Daftar',
        switchText: 'Sudah punya akun?',
        switchAction: 'Masuk di sini'
    }
};

const AUTH_ERRORS = {
    'auth/email-already-in-use': 'Email sudah terdaftar',
    'auth/wrong-password': 'Email atau password salah',
    'auth/user-not-found': 'Email atau password salah',
    'auth/invalid-credential': 'Email atau password salah',
    'auth/weak-password': 'Password minimal 6 karakter'
};

const state = {
    user: null,
    weeklyBudget: DEFAULT_BUDGET,
    workdays: DEFAULT_WORKDAYS,
    transactions: [],
    templates: [],
    filterCategory: 'all',
    searchQuery: '',
    selectedWeek: 'current',
    registerMode: false
};

let unsubscribers = [];
let renderedDay = toDateStr(new Date());
let installPrompt = null;

const camelCase = (id) => id.replace(/-(\w)/g, (_, char) => char.toUpperCase());
const el = Object.fromEntries(Array.from(document.querySelectorAll('[id]'), (node) => [camelCase(node.id), node]));

const formatShortRange = (start) => {
    const short = { day: 'numeric', month: 'short' };
    return `${formatDate(start, short)} - ${formatDate(toDateStr(addDays(parseDate(start), 6)), short)}`;
};

const optionTags = (values) => values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
const refreshIcons = () => feather.replace();
const transactionRef = (id) => doc(db, 'users', state.user.uid, 'transactions', id);
const templateRef = (id) => doc(db, 'users', state.user.uid, 'templates', id);
const settingsRef = (uid) => doc(db, 'users', uid, 'settings', 'user_settings');

const toTransactionData = ({ title, amount, category, date }) => ({ title, amount, category, date });
const toTemplateData = ({ title, amount, category }) => ({ title, amount, category });
const dayIndex = (dateStr) => (parseDate(dateStr).getDay() + 6) % 7;

const readStorage = (key) => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

const writeStorage = (key, value) => {
    try {
        localStorage.setItem(key, value);
    } catch {
        return;
    }
};

const showToast = (message, type = 'success', action) => {
    const isSuccess = type === 'success';
    const toast = document.createElement('div');
    toast.className = `toast-enter pointer-events-auto flex items-center space-x-2 text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${isSuccess ? 'bg-emerald-800' : 'bg-rose-800'}`;
    toast.innerHTML = `<i data-feather="${isSuccess ? 'check-circle' : 'alert-triangle'}" class="w-4 h-4"></i><span></span>`;
    toast.lastElementChild.textContent = message;
    if (action) {
        const button = document.createElement('button');
        button.className = 'ml-2 underline font-semibold';
        button.textContent = action.label;
        button.addEventListener('click', () => {
            action.onClick();
            toast.remove();
        });
        toast.append(button);
    }
    el.toastContainer.append(toast);
    refreshIcons();
    setTimeout(() => toast.remove(), action ? 6000 : 3000);
};

const commit = (write, failureMessage) => write.catch(() => showToast(failureMessage, 'error'));

const getTone = (spent, limit) => {
    const ratio = limit > 0 ? spent / limit : Number(spent > 0) * 2;
    if (ratio > 1) return TONES.over;
    return ratio >= 0.8 ? TONES.warn : TONES.safe;
};

const setBadge = (node, tone) => {
    node.className = `${BADGE_CLASS} ${tone.badge}`;
    node.textContent = tone.label;
};

const setAmount = (node, amount, positiveColor) => {
    node.textContent = formatIDR(amount);
    node.className = `text-2xl font-bold ${amount < 0 ? 'text-rose-600' : positiveColor}`;
};

const renderTodayBanner = (metrics) => {
    el.todayDate.textContent = formatDate(metrics.today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const { isWorkday, remainingWorkdays } = metrics;
    const remaining = remainingWorkdays
        ? `${remainingWorkdays} hari kerja tersisa setelah hari ini`
        : isWorkday ? 'hari kerja terakhir minggu ini' : 'jatah harian dimulai lagi minggu depan';
    el.todayContext.textContent = isWorkday
        ? `Hari kerja ke-${metrics.workdayNumber} dari ${metrics.workdays.length} · ${remaining}`
        : `Libur budget · ${remaining}`;

    el.weekDays.innerHTML = metrics.workdays.map((day) => {
        const status = day < metrics.today ? 'past' : day === metrics.today ? 'today' : 'upcoming';
        return `
            <li class="flex-1 sm:flex-none sm:w-12 py-1.5 text-center text-xs font-semibold rounded-lg ${DAY_CHIPS[status]}">
                ${DAY_LABELS[dayIndex(day)]}
                <span class="block text-[10px] font-normal">${parseDate(day).getDate()}</span>
            </li>`;
    }).join('');
};

const renderDashboard = () => {
    const metrics = calculateMetrics(state.transactions, state.weeklyBudget, state.workdays);
    const weeklyTone = getTone(metrics.weeklySpent, metrics.weeklyBudget);
    const dailyTone = getTone(metrics.dailySpent, metrics.dailyLimit);
    const weeklyPercent = metrics.weeklyBudget > 0
        ? Math.min(Math.round((metrics.weeklySpent / metrics.weeklyBudget) * 100), 100)
        : 0;
    const dailyPercent = metrics.dailyLimit > 0 ? Math.round((metrics.dailySpent / metrics.dailyLimit) * 100) : 0;

    renderTodayBanner(metrics);

    el.valWeeklyBudget.textContent = formatIDR(metrics.weeklyBudget);
    el.valWeeklySpent.textContent = formatIDR(metrics.weeklySpent);
    setAmount(el.valWeeklyRemaining, metrics.weeklyRemaining, 'text-emerald-600');
    setBadge(el.badgeWeeklyStatus, weeklyTone);
    el.barWeeklyProgress.style.width = `${weeklyPercent}%`;
    el.barWeeklyProgress.className = `h-2 rounded-full transition-all duration-300 ${weeklyTone.bar}`;
    el.valSpendLimit.textContent = metrics.isWorkday ? formatIDR(Math.max(metrics.spendLimit, 0)) : 'Libur budget';

    el.valDailyTarget.textContent = formatIDR(metrics.dailyTarget);
    el.txtDailyTargetNote.textContent = metrics.isWorkday
        ? `Budget mingguan ÷ ${metrics.workdays.length} hari kerja`
        : 'Hari ini libur budget, tidak ada jatah harian';

    setAmount(el.valDailyRemaining, metrics.dailyRemaining, 'text-emerald-600');
    setBadge(el.badgeDailyStatus, dailyTone);
    el.formulaTarget.textContent = formatSigned(metrics.dailyTarget);
    el.formulaCarry.textContent = formatSigned(metrics.dailyLimit - metrics.dailyTarget);
    el.formulaSpent.textContent = `− ${formatIDR(metrics.dailySpent)} (${dailyPercent}%)`;

    setAmount(el.valCarryOver, metrics.dailyCarryOver, 'text-indigo-600');
    setAmount(el.valWeeklyCarryOver, metrics.weeklyCarryOver, 'text-indigo-600');
};

const describeDay = (day) => {
    if (day.target === 0) return 'Hari libur budget';
    const over = day.spent - day.target;
    return over > 0 ? `Target ${formatIDR(day.target)} · lebih ${formatIDR(over)}` : `Target ${formatIDR(day.target)}`;
};

const withAria = (item) => ({ ...item, aria: `${item.tip.title}: ${item.tip.value}. ${item.tip.note}` });

const renderAnalysis = () => {
    const now = new Date();
    const { start, end } = getWeekRange(now);
    const dayFormat = { weekday: 'long', day: 'numeric', month: 'short' };

    el.subDaily.textContent = `Minggu ini (${formatShortRange(start)}) dibanding target harian`;
    el.chartDaily.innerHTML = columnChartHtml(
        getDailySeries(state.transactions, state.weeklyBudget, state.workdays, now).map((day) => withAria({
            label: DAY_LABELS[day.index],
            caption: String(parseDate(day.date).getDate()),
            tableLabel: formatDate(day.date, dayFormat),
            value: day.spent,
            target: day.target,
            current: day.isToday,
            tip: { title: formatDate(day.date, dayFormat), value: formatIDR(day.spent), note: describeDay(day) }
        })),
        ['Hari', 'Pengeluaran', 'Target']
    );

    const categories = getCategoryTotals(state.transactions, start, end);
    const grandTotal = sumAmount(categories.map((row) => ({ amount: row.total })));
    const share = (total) => Math.round((total / grandTotal) * 100);
    el.subCategory.textContent = `Minggu ini · total ${formatIDR(grandTotal)}`;
    el.chartCategory.innerHTML = categories.length
        ? rankedBarsHtml(categories.map((row) => ({
            name: row.category,
            value: row.total,
            display: `${formatIDR(row.total)} · ${share(row.total)}%`,
            tip: { title: row.category, value: formatIDR(row.total), note: `${share(row.total)}% dari total minggu ini` }
        }))) + tableHtml(
            ['Kategori', 'Jumlah', 'Porsi'],
            categories.map((row) => [row.category, formatIDR(row.total), `${share(row.total)}%`])
        )
        : '<p class="viz-note">Belum ada pengeluaran minggu ini.</p>';

    const comparison = compareWeeks(state.transactions, now);
    const period = comparison.elapsedDays === 1 ? DAY_LABELS[0] : `${DAY_LABELS[0]}–${DAY_LABELS[comparison.elapsedDays - 1]}`;
    el.subCompare.textContent = `Sampai hari yang sama (${period})`;
    el.chartCompare.innerHTML = comparisonHtml(comparison, period);

    el.chartTrend.innerHTML = columnChartHtml(
        getWeeklyTotals(state.transactions, 6, now).map((week) => {
            const over = week.spent - state.weeklyBudget;
            return withAria({
                label: formatDate(week.start, { day: 'numeric', month: 'short' }),
                caption: week.isCurrent ? 'ini' : '',
                tableLabel: `${formatShortRange(week.start)}${week.isCurrent ? ' (minggu ini)' : ''}`,
                value: week.spent,
                target: state.weeklyBudget,
                current: week.isCurrent,
                tip: {
                    title: `Minggu ${formatShortRange(week.start)}`,
                    value: formatIDR(week.spent),
                    note: over > 0 ? `Budget ${formatIDR(state.weeklyBudget)} · lebih ${formatIDR(over)}` : `Budget ${formatIDR(state.weeklyBudget)}`
                }
            });
        }),
        ['Minggu', 'Pengeluaran', 'Budget']
    );
};

const resolveWeek = (selection) => {
    if (selection === 'all') return null;
    const currentStart = getWeekRange().start;
    const start = selection === 'current' ? currentStart
        : selection === 'last' ? toDateStr(addDays(parseDate(currentStart), -7))
        : selection;
    return { start, end: toDateStr(addDays(parseDate(start), 6)) };
};

const renderWeekOptions = () => {
    const currentStart = getWeekRange().start;
    const lastStart = toDateStr(addDays(parseDate(currentStart), -7));
    const olderStarts = [...new Set(state.transactions.map((tx) => getWeekRange(parseDate(tx.date)).start))]
        .filter((start) => start < lastStart)
        .sort()
        .reverse();

    const options = [
        ['current', `Minggu Ini (${formatShortRange(currentStart)})`],
        ['last', `Minggu Lalu (${formatShortRange(lastStart)})`],
        ['all', 'Semua Minggu'],
        ...olderStarts.map((start) => [start, `Minggu ${formatShortRange(start)}`])
    ];

    el.filterWeek.innerHTML = options.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    el.filterWeek.value = state.selectedWeek;
    if (el.filterWeek.value !== state.selectedWeek) {
        state.selectedWeek = 'current';
        el.filterWeek.value = 'current';
    }
};

const transactionRow = (tx) => `
    <div class="p-4 sm:px-5 flex items-center justify-between hover:bg-slate-50/80 transition-colors">
        <div class="flex items-center space-x-3.5 min-w-0">
            <div class="p-2.5 bg-slate-100 text-slate-600 rounded-lg shrink-0">
                <i data-feather="tag" class="w-4 h-4"></i>
            </div>
            <div class="min-w-0">
                <p class="text-sm font-semibold text-slate-900 truncate">${escapeHtml(tx.title)}</p>
                <span class="inline-block bg-slate-100 px-2 py-0.5 rounded text-xs text-slate-600 font-medium mt-0.5">${escapeHtml(tx.category)}</span>
            </div>
        </div>
        <div class="flex items-center space-x-3 shrink-0 ml-3">
            <span class="text-sm font-bold text-slate-900">${formatIDR(tx.amount)}</span>
            <div class="flex items-center space-x-1">
                <button data-action="edit" data-id="${escapeHtml(tx.id)}" aria-label="Edit transaksi" class="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100">
                    <i data-feather="edit-2" class="w-4 h-4 pointer-events-none"></i>
                </button>
                <button data-action="delete" data-id="${escapeHtml(tx.id)}" aria-label="Hapus transaksi" class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100">
                    <i data-feather="trash-2" class="w-4 h-4 pointer-events-none"></i>
                </button>
            </div>
        </div>
    </div>`;

const dayGroup = (date, transactions) => `
    <div>
        <div class="bg-slate-100/70 px-4 sm:px-5 py-2 flex items-center justify-between border-y border-slate-200/60">
            <span class="text-xs font-bold text-slate-700 tracking-wide">${formatDate(date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            <span class="text-xs font-semibold text-slate-500">Total: ${formatIDR(sumAmount(transactions))}</span>
        </div>
        <div class="divide-y divide-slate-100">${transactions.map(transactionRow).join('')}</div>
    </div>`;

const groupByDate = (transactions) => transactions.reduce((groups, tx) => {
    (groups[tx.date] ||= []).push(tx);
    return groups;
}, {});

const getFilteredTransactions = () => {
    const week = resolveWeek(state.selectedWeek);
    const query = state.searchQuery.trim().toLowerCase();
    return state.transactions.filter((tx) =>
        (state.filterCategory === 'all' || tx.category === state.filterCategory)
        && tx.title.toLowerCase().includes(query)
        && (!week || (tx.date >= week.start && tx.date <= week.end))
    );
};

const renderTransactions = () => {
    const filtered = getFilteredTransactions();
    const groups = groupByDate(filtered);

    el.transactionCount.textContent = `${filtered.length} transaksi`;
    el.weeklyTotalSpent.textContent = `Total: ${formatIDR(sumAmount(filtered))}`;
    el.emptyState.classList.toggle('hidden', filtered.length > 0);
    el.transactionList.innerHTML = Object.keys(groups).sort().reverse().map((date) => dayGroup(date, groups[date])).join('');
    refreshIcons();
};

const templateChip = (template) => `
    <div class="template-chip">
        <button type="button" data-action="use-template" data-id="${escapeHtml(template.id)}" title="${escapeHtml(template.category)}" class="template-use">
            <span class="font-semibold">${escapeHtml(template.title)}</span>
            <span class="template-amount">${formatIDR(template.amount)}</span>
        </button>
        <button type="button" data-action="edit-template" data-id="${escapeHtml(template.id)}" aria-label="Edit template ${escapeHtml(template.title)}" class="template-edit">
            <i data-feather="edit-2" class="w-3.5 h-3.5 pointer-events-none"></i>
        </button>
    </div>`;

const renderTemplates = () => {
    el.templateEmpty.hidden = state.templates.length > 0;
    el.templateList.innerHTML = state.templates.map(templateChip).join('');
    refreshIcons();
};

const hideTooltip = () => {
    el.chartTooltip.hidden = true;
};

const showTooltip = (node, x, y) => {
    el.tipTitle.textContent = node.dataset.tipTitle;
    el.tipValue.textContent = node.dataset.tipValue;
    el.tipNote.textContent = node.dataset.tipNote;
    el.chartTooltip.hidden = false;

    const { offsetWidth: width, offsetHeight: height } = el.chartTooltip;
    const above = y - height - 12;
    el.chartTooltip.style.left = `${Math.max(8, Math.min(x + 12, window.innerWidth - width - 8))}px`;
    el.chartTooltip.style.top = `${above < 8 ? y + 16 : above}px`;
};

const showTooltipAtNode = (node) => {
    const rect = node.getBoundingClientRect();
    showTooltip(node, rect.left + rect.width / 2, rect.top);
};

const setView = (view) => {
    document.querySelectorAll('.tab').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.view === view)));
    el.viewTransactions.hidden = view !== 'transactions';
    el.viewAnalysis.hidden = view !== 'analysis';
    hideTooltip();
};

const render = () => {
    renderedDay = toDateStr(new Date());
    renderDashboard();
    renderWeekOptions();
    renderTransactions();
    renderAnalysis();
    hideTooltip();
    refreshIcons();
};

const subscribeToUserData = (uid) => {
    const onError = () => showToast('Gagal menyinkronkan data', 'error');
    return [
        onSnapshot(collection(db, 'users', uid, 'transactions'), (snapshot) => {
            state.transactions = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
            render();
        }, onError),
        onSnapshot(collection(db, 'users', uid, 'templates'), (snapshot) => {
            state.templates = snapshot.docs
                .map((item) => ({ id: item.id, ...item.data() }))
                .sort((a, b) => a.id.localeCompare(b.id));
            renderTemplates();
        }, onError),
        onSnapshot(settingsRef(uid), (snapshot) => {
            const settings = snapshot.data();
            state.weeklyBudget = settings?.weeklyBudget ?? DEFAULT_BUDGET;
            state.workdays = normalizeWorkdays(settings?.workdays);
            render();
        }, onError)
    ];
};

const renderAuthMode = () => {
    const copy = AUTH_COPY[state.registerMode ? 'register' : 'login'];
    el.authTitle.textContent = copy.title;
    el.authSubtitle.textContent = copy.subtitle;
    el.btnAuthSubmit.textContent = copy.submit;
    el.authSwitchText.textContent = copy.switchText;
    el.btnToggleAuth.textContent = copy.switchAction;
};

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const renderInstall = () => {
    const showIosGuide = isIos() && !isStandalone();
    el.btnInstallHeader.hidden = !installPrompt;
    el.btnInstall.hidden = !installPrompt;
    el.installBanner.hidden = !(installPrompt || showIosGuide) || readStorage(INSTALL_DISMISSED_KEY) === '1';
    el.installText.textContent = installPrompt
        ? 'Buka langsung dari layar utama, tanpa membuka browser.'
        : 'Ketuk ikon Bagikan di Safari, lalu pilih "Tambah ke Layar Utama".';
};

const promptInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    renderInstall();
};

const renderConnection = () => {
    el.offlineBar.hidden = navigator.onLine;
};

const openModal = (modal) => modal.classList.remove('hidden');
const closeModal = (modal) => modal.classList.add('hidden');

const openTransactionModal = (tx) => {
    el.txId.value = tx?.id ?? '';
    el.txTitle.value = tx?.title ?? '';
    el.txAmount.value = tx?.amount ?? '';
    el.txCategory.value = tx?.category ?? CATEGORIES[0];
    el.txDate.value = tx?.date ?? toDateStr(new Date());
    el.modalTitle.textContent = tx ? 'Edit Transaksi' : 'Tambah Transaksi';
    el.txSaveTemplate.checked = false;
    el.saveTemplateRow.hidden = Boolean(tx);
    openModal(el.modalTransaction);
};

const openTemplateModal = (template) => {
    el.templateId.value = template?.id ?? '';
    el.templateTitle.value = template?.title ?? '';
    el.templateAmount.value = template?.amount ?? '';
    el.templateCategory.value = template?.category ?? CATEGORIES[0];
    el.templateModalTitle.textContent = template ? 'Edit Template' : 'Template Baru';
    el.btnDeleteTemplate.hidden = !template;
    openModal(el.modalTemplate);
};

const useTemplate = (template) => {
    const id = Date.now().toString();
    commit(setDoc(transactionRef(id), { ...toTransactionData(template), date: toDateStr(new Date()) }), 'Gagal menambahkan transaksi');
    showToast(`${template.title} ditambahkan`, 'success', {
        label: 'Urungkan',
        onClick: () => commit(deleteDoc(transactionRef(id)), 'Gagal mengurungkan')
    });
};

const deleteTemplate = (template) => {
    commit(deleteDoc(templateRef(template.id)), 'Gagal menghapus template');
    closeModal(el.modalTemplate);
    showToast('Template dihapus', 'success', {
        label: 'Urungkan',
        onClick: () => commit(setDoc(templateRef(template.id), toTemplateData(template)), 'Gagal mengembalikan template')
    });
};

const deleteTransaction = (id) => {
    const tx = state.transactions.find((item) => item.id === id);
    if (!tx) return;
    commit(deleteDoc(transactionRef(id)), 'Gagal menghapus');
    showToast('Transaksi dihapus', 'success', {
        label: 'Urungkan',
        onClick: () => commit(setDoc(transactionRef(tx.id), toTransactionData(tx)), 'Gagal mengembalikan transaksi')
    });
};

const getSelectedWorkdays = () => Array.from(el.workdayOptions.querySelectorAll('input:checked'), (input) => Number(input.value));

const setSelectedWorkdays = (workdays) => {
    el.workdayOptions.querySelectorAll('input').forEach((input) => {
        input.checked = workdays.includes(Number(input.value));
    });
};

const renderSettingsHint = () => {
    const count = getSelectedWorkdays().length;
    el.settingsHint.textContent = count
        ? `${formatIDR(Math.round(Number(el.setWeeklyBudget.value) / count))} per hari kerja (${count} hari)`
        : 'Pilih minimal satu hari kerja';
};

onAuthStateChanged(auth, (user) => {
    state.user = user;
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    unsubscribers = user ? subscribeToUserData(user.uid) : [];
    if (!user) {
        Object.assign(state, { transactions: [], templates: [], weeklyBudget: DEFAULT_BUDGET, workdays: DEFAULT_WORKDAYS });
    }
    el.authContainer.classList.toggle('hidden', Boolean(user));
    el.appWrapper.classList.toggle('hidden', !user);
    el.appWrapper.classList.toggle('flex', Boolean(user));
});

el.formAuth.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = el.authEmail.value.trim();
    const password = el.authPassword.value;
    const authenticate = state.registerMode ? createUserWithEmailAndPassword : signInWithEmailAndPassword;

    el.btnAuthSubmit.disabled = true;
    try {
        await authenticate(auth, email, password);
        showToast(state.registerMode ? 'Akun berhasil dibuat!' : 'Berhasil masuk!');
    } catch (error) {
        showToast(AUTH_ERRORS[error.code] ?? 'Terjadi kesalahan autentikasi', 'error');
    } finally {
        el.btnAuthSubmit.disabled = false;
    }
});

el.btnToggleAuth.addEventListener('click', () => {
    state.registerMode = !state.registerMode;
    renderAuthMode();
});

el.btnLogout.addEventListener('click', () => signOut(auth));

el.btnTheme.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    writeStorage('theme', theme);
});

el.formTransaction.addEventListener('submit', (event) => {
    event.preventDefault();
    const isEdit = Boolean(el.txId.value);
    const id = el.txId.value || Date.now().toString();
    const data = {
        title: el.txTitle.value.trim(),
        amount: Number(el.txAmount.value),
        category: el.txCategory.value,
        date: el.txDate.value
    };

    commit(setDoc(transactionRef(id), data), 'Gagal menyimpan transaksi');
    if (!isEdit && el.txSaveTemplate.checked) commit(setDoc(templateRef(id), toTemplateData(data)), 'Gagal menyimpan template');
    showToast(isEdit ? 'Transaksi diperbarui' : 'Transaksi ditambahkan');
    closeModal(el.modalTransaction);
});

el.formTemplate.addEventListener('submit', (event) => {
    event.preventDefault();
    const isEdit = Boolean(el.templateId.value);
    const template = {
        title: el.templateTitle.value.trim(),
        amount: Number(el.templateAmount.value),
        category: el.templateCategory.value
    };

    commit(setDoc(templateRef(el.templateId.value || Date.now().toString()), template), 'Gagal menyimpan template');
    showToast(isEdit ? 'Template diperbarui' : 'Template ditambahkan');
    closeModal(el.modalTemplate);
});

el.formSettings.addEventListener('submit', (event) => {
    event.preventDefault();
    const weeklyBudget = Number(el.setWeeklyBudget.value);
    const workdays = getSelectedWorkdays();
    if (!Number.isFinite(weeklyBudget) || weeklyBudget < 0) return;
    if (!workdays.length) return showToast('Pilih minimal satu hari kerja', 'error');

    commit(setDoc(settingsRef(state.user.uid), { weeklyBudget, workdays }), 'Gagal menyimpan pengaturan');
    closeModal(el.modalSettings);
    showToast('Pengaturan disimpan');
});

el.transactionList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === 'edit') openTransactionModal(state.transactions.find((tx) => tx.id === id));
    if (action === 'delete') deleteTransaction(id);
});

el.btnOpenAddModal.addEventListener('click', () => openTransactionModal());
el.btnAddTemplate.addEventListener('click', () => openTemplateModal());

el.btnDeleteTemplate.addEventListener('click', () => {
    const template = state.templates.find((item) => item.id === el.templateId.value);
    if (template) deleteTemplate(template);
});

el.templateList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    const template = state.templates.find((item) => item.id === button?.dataset.id);
    if (!template) return;
    if (button.dataset.action === 'use-template') useTemplate(template);
    else openTemplateModal(template);
});

el.btnOpenSettings.addEventListener('click', () => {
    el.setWeeklyBudget.value = state.weeklyBudget;
    setSelectedWorkdays(state.workdays);
    renderSettingsHint();
    openModal(el.modalSettings);
});

el.formSettings.addEventListener('input', renderSettingsHint);

el.workdayPresets.addEventListener('click', (event) => {
    const preset = event.target.closest('[data-preset]');
    if (!preset) return;
    setSelectedWorkdays(preset.dataset.preset.split(',').map(Number));
    renderSettingsHint();
});

document.querySelector('.tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-view]');
    if (tab) setView(tab.dataset.view);
});

document.querySelector('.tabs').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const [first, second] = document.querySelectorAll('.tab');
    const next = event.target === first ? second : first;
    setView(next.dataset.view);
    next.focus();
});

el.viewAnalysis.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    const node = event.target.closest('[data-tip-title]');
    if (node) showTooltip(node, event.clientX, event.clientY);
    else hideTooltip();
});

el.viewAnalysis.addEventListener('pointerleave', hideTooltip);
el.viewAnalysis.addEventListener('focusout', hideTooltip);

el.viewAnalysis.addEventListener('focusin', (event) => {
    const node = event.target.closest('[data-tip-title]');
    if (node) showTooltipAtNode(node);
});

document.addEventListener('click', (event) => {
    const tipNode = event.target.closest('[data-tip-title]');
    if (tipNode) showTooltipAtNode(tipNode);
    else hideTooltip();

    const modal = event.target.closest('[data-close]')?.closest('.modal')
        ?? (event.target.classList.contains('modal') ? event.target : null);
    if (modal) closeModal(modal);
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        document.querySelectorAll('.modal').forEach(closeModal);
        hideTooltip();
    }
});

window.addEventListener('scroll', hideTooltip, { passive: true });

el.filterWeek.addEventListener('change', (event) => {
    state.selectedWeek = event.target.value;
    renderTransactions();
});

el.filterCategory.addEventListener('change', (event) => {
    state.filterCategory = event.target.value;
    renderTransactions();
});

el.searchInput.addEventListener('input', (event) => {
    state.searchQuery = event.target.value;
    renderTransactions();
});

window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    renderInstall();
});

window.addEventListener('appinstalled', () => {
    installPrompt = null;
    renderInstall();
    showToast('Aplikasi terpasang di layar utama');
});

el.btnInstall.addEventListener('click', promptInstall);
el.btnInstallHeader.addEventListener('click', promptInstall);

el.btnDismissInstall.addEventListener('click', () => {
    writeStorage(INSTALL_DISMISSED_KEY, '1');
    renderInstall();
});

window.addEventListener('online', renderConnection);
window.addEventListener('offline', renderConnection);

setInterval(() => {
    if (state.user && toDateStr(new Date()) !== renderedDay) render();
}, 60000);

el.workdayOptions.innerHTML = DAY_LABELS.map((label, index) => `
    <label class="day-toggle"><input type="checkbox" value="${index}"><span>${label}</span></label>`).join('');
el.txCategory.innerHTML = optionTags(CATEGORIES);
el.templateCategory.innerHTML = optionTags(CATEGORIES);
el.filterCategory.innerHTML = `<option value="all">Semua Kategori</option>${optionTags(CATEGORIES)}`;
refreshIcons();
renderConnection();
renderInstall();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
