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
    collection,
    doc,
    setDoc,
    deleteDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { WORKDAYS, addDays, calculateMetrics, getWeekRange, parseDate, sumAmount, toDateStr } from "./budget.js";

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
const db = getFirestore(firebaseApp);

const DEFAULT_BUDGET = 700000;
const CATEGORIES = ['Makanan & Minuman', 'Transportasi', 'Belanja', 'Tagihan', 'Hiburan', 'Lainnya'];
const DAY_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum'];
const BADGE_CLASS = 'px-2 py-0.5 text-xs font-semibold rounded-full';

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
    transactions: [],
    filterCategory: 'all',
    searchQuery: '',
    selectedWeek: 'current',
    registerMode: false
};

let unsubscribers = [];
let renderedDay = toDateStr(new Date());

const camelCase = (id) => id.replace(/-(\w)/g, (_, char) => char.toUpperCase());
const el = Object.fromEntries(Array.from(document.querySelectorAll('[id]'), (node) => [camelCase(node.id), node]));

const formatIDR = (amount) => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
}).format(amount);

const formatSigned = (amount) => `${amount < 0 ? '−' : '+'} ${formatIDR(Math.abs(amount))}`;
const formatDate = (dateStr, options) => parseDate(dateStr).toLocaleDateString('id-ID', options);
const formatShortRange = (start) => {
    const short = { day: 'numeric', month: 'short' };
    return `${formatDate(start, short)} - ${formatDate(toDateStr(addDays(parseDate(start), 6)), short)}`;
};

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
));

const optionTags = (values) => values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
const refreshIcons = () => feather.replace();
const transactionRef = (id) => doc(db, 'users', state.user.uid, 'transactions', id);
const settingsRef = (uid) => doc(db, 'users', uid, 'settings', 'user_settings');

const showToast = (message, type = 'success') => {
    const isSuccess = type === 'success';
    const toast = document.createElement('div');
    toast.className = `toast-enter pointer-events-auto flex items-center space-x-2 text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${isSuccess ? 'bg-emerald-800' : 'bg-rose-800'}`;
    toast.innerHTML = `<i data-feather="${isSuccess ? 'check-circle' : 'alert-triangle'}" class="w-4 h-4"></i><span></span>`;
    toast.lastElementChild.textContent = message;
    el.toastContainer.append(toast);
    refreshIcons();
    setTimeout(() => toast.remove(), 3000);
};

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

    if (!metrics.isWorkday) {
        el.todayContext.textContent = 'Akhir pekan · libur budget, jatah harian dimulai lagi hari Senin';
    } else {
        const remaining = metrics.remainingWorkdays
            ? `${metrics.remainingWorkdays} hari kerja tersisa setelah hari ini`
            : 'hari kerja terakhir minggu ini';
        el.todayContext.textContent = `Hari kerja ke-${metrics.workdayNumber} dari ${WORKDAYS} · ${remaining}`;
    }

    el.weekDays.innerHTML = metrics.workdays.map((day, index) => {
        const status = day < metrics.today ? 'past' : day === metrics.today ? 'today' : 'upcoming';
        return `
            <li class="w-12 py-1.5 text-center text-xs font-semibold rounded-lg ${DAY_CHIPS[status]}">
                ${DAY_LABELS[index]}
                <span class="block text-[10px] font-normal">${parseDate(day).getDate()}</span>
            </li>`;
    }).join('');
};

const renderDashboard = () => {
    const metrics = calculateMetrics(state.transactions, state.weeklyBudget);
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
        ? `Budget mingguan ÷ ${WORKDAYS} hari kerja`
        : 'Akhir pekan tidak mendapat jatah harian';

    setAmount(el.valDailyRemaining, metrics.dailyRemaining, 'text-emerald-600');
    setBadge(el.badgeDailyStatus, dailyTone);
    el.formulaTarget.textContent = formatSigned(metrics.dailyTarget);
    el.formulaCarry.textContent = formatSigned(metrics.dailyLimit - metrics.dailyTarget);
    el.formulaSpent.textContent = `− ${formatIDR(metrics.dailySpent)} (${dailyPercent}%)`;

    setAmount(el.valCarryOver, metrics.dailyCarryOver, 'text-indigo-600');
    setAmount(el.valWeeklyCarryOver, metrics.weeklyCarryOver, 'text-indigo-600');
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

const renderTransactions = () => {
    const week = resolveWeek(state.selectedWeek);
    const query = state.searchQuery.trim().toLowerCase();
    const filtered = state.transactions.filter((tx) =>
        (state.filterCategory === 'all' || tx.category === state.filterCategory)
        && tx.title.toLowerCase().includes(query)
        && (!week || (tx.date >= week.start && tx.date <= week.end))
    );
    const groups = groupByDate(filtered);

    el.transactionCount.textContent = `${filtered.length} transaksi`;
    el.weeklyTotalSpent.textContent = `Total: ${formatIDR(sumAmount(filtered))}`;
    el.emptyState.classList.toggle('hidden', filtered.length > 0);
    el.transactionList.innerHTML = Object.keys(groups).sort().reverse().map((date) => dayGroup(date, groups[date])).join('');
    refreshIcons();
};

const render = () => {
    renderedDay = toDateStr(new Date());
    renderDashboard();
    renderWeekOptions();
    renderTransactions();
    refreshIcons();
};

const subscribeToUserData = (uid) => {
    const onError = () => showToast('Gagal menyinkronkan data', 'error');
    return [
        onSnapshot(collection(db, 'users', uid, 'transactions'), (snapshot) => {
            state.transactions = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
            render();
        }, onError),
        onSnapshot(settingsRef(uid), (snapshot) => {
            state.weeklyBudget = snapshot.data()?.weeklyBudget ?? DEFAULT_BUDGET;
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

const openModal = (modal) => modal.classList.remove('hidden');
const closeModal = (modal) => modal.classList.add('hidden');

const openTransactionModal = (tx) => {
    el.txId.value = tx?.id ?? '';
    el.txTitle.value = tx?.title ?? '';
    el.txAmount.value = tx?.amount ?? '';
    el.txCategory.value = tx?.category ?? CATEGORIES[0];
    el.txDate.value = tx?.date ?? toDateStr(new Date());
    el.modalTitle.textContent = tx ? 'Edit Transaksi' : 'Tambah Transaksi';
    openModal(el.modalTransaction);
};

const deleteTransaction = async (id) => {
    if (!confirm('Apakah Anda yakin ingin menghapus transaksi ini?')) return;
    try {
        await deleteDoc(transactionRef(id));
        showToast('Transaksi dihapus');
    } catch {
        showToast('Gagal menghapus', 'error');
    }
};

onAuthStateChanged(auth, (user) => {
    state.user = user;
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    unsubscribers = user ? subscribeToUserData(user.uid) : [];
    if (!user) {
        Object.assign(state, { transactions: [], weeklyBudget: DEFAULT_BUDGET });
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

el.formTransaction.addEventListener('submit', async (event) => {
    event.preventDefault();
    const isEdit = Boolean(el.txId.value);
    const id = el.txId.value || Date.now().toString();

    try {
        await setDoc(transactionRef(id), {
            title: el.txTitle.value.trim(),
            amount: Number(el.txAmount.value),
            category: el.txCategory.value,
            date: el.txDate.value
        });
        showToast(isEdit ? 'Transaksi diperbarui' : 'Transaksi ditambahkan');
        closeModal(el.modalTransaction);
    } catch {
        showToast('Gagal menyimpan transaksi', 'error');
    }
});

el.formSettings.addEventListener('submit', async (event) => {
    event.preventDefault();
    const weeklyBudget = Number(el.setWeeklyBudget.value);
    if (!Number.isFinite(weeklyBudget) || weeklyBudget < 0) return;

    try {
        await setDoc(settingsRef(state.user.uid), { weeklyBudget });
        closeModal(el.modalSettings);
        showToast('Pengaturan disimpan');
    } catch {
        showToast('Gagal menyimpan pengaturan', 'error');
    }
});

el.transactionList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === 'edit') openTransactionModal(state.transactions.find((tx) => tx.id === id));
    if (action === 'delete') deleteTransaction(id);
});

el.btnOpenAddModal.addEventListener('click', () => openTransactionModal());

el.btnOpenSettings.addEventListener('click', () => {
    el.setWeeklyBudget.value = state.weeklyBudget;
    openModal(el.modalSettings);
});

document.addEventListener('click', (event) => {
    const modal = event.target.closest('[data-close]')?.closest('.modal')
        ?? (event.target.classList.contains('modal') ? event.target : null);
    if (modal) closeModal(modal);
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') document.querySelectorAll('.modal').forEach(closeModal);
});

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

setInterval(() => {
    if (state.user && toDateStr(new Date()) !== renderedDay) render();
}, 60000);

el.txCategory.innerHTML = optionTags(CATEGORIES);
el.filterCategory.innerHTML = `<option value="all">Semua Kategori</option>${optionTags(CATEGORIES)}`;
refreshIcons();