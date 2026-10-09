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

// === FIREBASE CONFIGURATION ===
const firebaseConfig = {
    apiKey: "AIzaSyDRned2SdcBCoH0Yx-CWW1PMrmQskM8Jp8",
    authDomain: "daily-rollover.firebaseapp.com",
    projectId: "daily-rollover",
    storageBucket: "daily-rollover.firebasestorage.app",
    messagingSenderId: "152110821224",
    appId: "1:152110821224:web:ca1dfd917a2710d57f70dd",
    measurementId: "G-P3SWM1RSXW"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// === STATE MANAGEMENT ===
let state = {
    user: null,
    weeklyBudget: 175000,
    transactions: [],
    filterCategory: 'all',
    searchQuery: '',
    isRegisterMode: false
};

let unsubTx = null;
let unsubSettings = null;

// === DOM ELEMENTS ===
const elements = {
    authContainer: document.getElementById('auth-container'),
    appWrapper: document.getElementById('app-wrapper'),
    formAuth: document.getElementById('form-auth'),
    authEmail: document.getElementById('auth-email'),
    authPassword: document.getElementById('auth-password'),
    authTitle: document.getElementById('auth-title'),
    authSubtitle: document.getElementById('auth-subtitle'),
    btnAuthSubmit: document.getElementById('btn-auth-submit'),
    btnToggleAuth: document.getElementById('btn-toggle-auth'),
    authSwitchText: document.getElementById('auth-switch-text'),
    btnLogout: document.getElementById('btn-logout'),

    weeklyBudget: document.getElementById('val-weekly-budget'),
    weeklySpent: document.getElementById('val-weekly-spent'),
    weeklyRemaining: document.getElementById('val-weekly-remaining'),
    weeklyProgress: document.getElementById('bar-weekly-progress'),
    weeklyStatusBadge: document.getElementById('badge-weekly-status'),
    
    dailyBudget: document.getElementById('val-daily-budget'),
    dailySpent: document.getElementById('val-daily-spent'),
    dailyRemaining: document.getElementById('val-daily-remaining'),
    dailyPercentage: document.getElementById('val-daily-percentage'),
    dailyStatusBadge: document.getElementById('badge-daily-status'),
    
    carryOver: document.getElementById('val-carry-over'),

    transactionList: document.getElementById('transaction-list'),
    emptyState: document.getElementById('empty-state'),
    transactionCount: document.getElementById('transaction-count'),
    filterCategory: document.getElementById('filter-category'),
    searchInput: document.getElementById('search-input'),

    modalTransaction: document.getElementById('modal-transaction'),
    formTransaction: document.getElementById('form-transaction'),
    modalTitle: document.getElementById('modal-title'),
    txId: document.getElementById('tx-id'),
    txTitle: document.getElementById('tx-title'),
    txAmount: document.getElementById('tx-amount'),
    txCategory: document.getElementById('tx-category'),
    txDate: document.getElementById('tx-date'),
    
    modalSettings: document.getElementById('modal-settings'),
    formSettings: document.getElementById('form-settings'),
    setWeeklyBudget: document.getElementById('set-weekly-budget'),

    btnOpenAddModal: document.getElementById('btn-open-add-modal'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    btnCancelModal: document.getElementById('btn-cancel-modal'),
    btnOpenSettings: document.getElementById('btn-open-settings'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    btnCancelSettings: document.getElementById('btn-cancel-settings'),
    
    toastContainer: document.getElementById('toast-container')
};

// === HELPER FUNCTIONS ===
const formatIDR = (amount) => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
    }).format(amount);
};

const getTodayString = () => new Date().toISOString().split('T')[0];

const showToast = (message, type = 'success') => {
    const toast = document.createElement('div');
    const isSuccess = type === 'success';
    const bgClass = isSuccess ? 'bg-emerald-800' : 'bg-rose-800';
    const iconName = isSuccess ? 'check-circle' : 'alert-triangle';

    toast.className = `toast-enter pointer-events-auto flex items-center space-x-2 text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${bgClass}`;
    toast.innerHTML = `<i data-feather="${iconName}" class="w-4 h-4"></i><span>${message}</span>`;

    elements.toastContainer.appendChild(toast);
    feather.replace();
    setTimeout(() => toast.remove(), 3000);
};

const refreshIcons = () => setTimeout(() => feather.replace(), 0);

const getWeekRange = (d = new Date()) => {
    const date = new Date(d);
    const day = date.getDay();
    const diffToMonday = date.getDate() - day + (day === 0 ? -6 : 1);
    
    const monday = new Date(date.setDate(diffToMonday));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return {
        startStr: monday.toISOString().split('T')[0],
        endStr: sunday.toISOString().split('T')[0]
    };
};

const isWeekday = (dateString) => {
    const day = new Date(dateString).getDay();
    return day >= 1 && day <= 5;
};

// === AUTHENTICATION LOGIC ===
onAuthStateChanged(auth, (user) => {
    state.user = user;
    if (user) {
        elements.authContainer.classList.add('hidden');
        elements.appWrapper.classList.remove('hidden');
        elements.appWrapper.classList.add('flex');
        initUserRealtimeSync(user.uid);
    } else {
        if (unsubTx) unsubTx();
        if (unsubSettings) unsubSettings();
        elements.appWrapper.classList.add('hidden');
        elements.appWrapper.classList.remove('flex');
        elements.authContainer.classList.remove('hidden');
    }
});

elements.btnToggleAuth.addEventListener('click', () => {
    state.isRegisterMode = !state.isRegisterMode;
    if (state.isRegisterMode) {
        elements.authTitle.textContent = "Daftar Akun HematKu";
        elements.authSubtitle.textContent = "Buat akun baru untuk mulai mencatat keuanganmu.";
        elements.btnAuthSubmit.textContent = "Daftar";
        elements.authSwitchText.textContent = "Sudah punya akun?";
        elements.btnToggleAuth.textContent = "Masuk di sini";
    } else {
        elements.authTitle.textContent = "Masuk ke HematKu";
        elements.authSubtitle.textContent = "Kelola budget harian dan mingguan secara terorganisir.";
        elements.btnAuthSubmit.textContent = "Masuk";
        elements.authSwitchText.textContent = "Belum punya akun?";
        elements.btnToggleAuth.textContent = "Daftar sekarang";
    }
});

elements.formAuth.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = elements.authEmail.value.trim();
    const password = elements.authPassword.value;

    try {
        if (state.isRegisterMode) {
            await createUserWithEmailAndPassword(auth, email, password);
            showToast('Akun berhasil dibuat!');
        } else {
            await signInWithEmailAndPassword(auth, email, password);
            showToast('Berhasil masuk!');
        }
    } catch (error) {
        let msg = 'Terjadi kesalahan autentikasi';
        if (error.code === 'auth/email-already-in-use') msg = 'Email sudah terdaftar';
        if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') msg = 'Email atau password salah';
        if (error.code === 'auth/weak-password') msg = 'Password minimal 6 karakter';
        showToast(msg, 'error');
    }
});

elements.btnLogout.addEventListener('click', () => signOut(auth));

// === REALTIME SYNC (PER USER) ===
const initUserRealtimeSync = (uid) => {
    const userTxRef = collection(db, "users", uid, "transactions");
    const userSettingsRef = doc(db, "users", uid, "settings", "user_settings");

    unsubTx = onSnapshot(userTxRef, (snapshot) => {
        state.transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderDashboard();
    });

    unsubSettings = onSnapshot(userSettingsRef, (docSnap) => {
        if (docSnap.exists()) {
            state.weeklyBudget = docSnap.data().weeklyBudget || 700000;
            renderDashboard();
        }
    });
};

// === HELPER FORMAT TANGGAL INDONESIA ===
const formatDateIndonesian = (dateString) => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('id-ID', options);
};

// === KALKULASI BUDGET METRICS ===
const calculateBudgetMetrics = () => {
    const today = new Date();
    const todayStr = getTodayString();
    const isTodayWeekday = isWeekday(todayStr);

    const { startStr, endStr } = getWeekRange(today);

    // 1. Filter Transaksi Minggu Ini & Lalu
    const currentWeekTransactions = state.transactions.filter(tx => 
        tx.date >= startStr && tx.date <= endStr
    );
    const pastTransactions = state.transactions.filter(tx => tx.date < startStr);

    // 2. Transaksi & Sisa Budget Mingguan
    const totalWeeklySpent = currentWeekTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
    const weeklyRemaining = state.weeklyBudget - totalWeeklySpent;

    // 3. All-Time Weekly Carry-Over (Minggu-Minggu Lalu)
    const pastWeeksSet = new Set();
    pastTransactions.forEach(tx => {
        const { startStr: weekStart } = getWeekRange(new Date(tx.date));
        pastWeeksSet.add(weekStart);
    });

    const totalPastWeeklyAllocated = pastWeeksSet.size * state.weeklyBudget;
    const totalPastWeeklySpent = pastTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
    const weeklyCarryOver = totalPastWeeklyAllocated - totalPastWeeklySpent;

    // 4. Budget Dasar Harian (Weekday)
    const baseDailyBudget = Math.round(state.weeklyBudget / 5);

    // Pengeluaran Murni Hari Ini
    const todaySpent = currentWeekTransactions
        .filter(tx => tx.date === todayStr)
        .reduce((sum, tx) => sum + Number(tx.amount), 0);

    // Hitung Carry-Over Harian Minggu Aktif (Senin s/d Kemarin)
    let pastWeekdaysSpent = 0;
    let pastWeekdaysCount = 0;

    const curr = new Date(startStr);
    const target = new Date(todayStr);

    while (curr < target) {
        const dateStr = curr.toISOString().split('T')[0];
        if (isWeekday(dateStr)) {
            pastWeekdaysCount++;
            const spentOnDay = currentWeekTransactions
                .filter(tx => tx.date === dateStr)
                .reduce((sum, tx) => sum + Number(tx.amount), 0);
            pastWeekdaysSpent += spentOnDay;
        }
        curr.setDate(curr.getDate() + 1);
    }

    const dailyCarryOver = (pastWeekdaysCount * baseDailyBudget) - pastWeekdaysSpent;
    
    // Target murni hari ini & sisa efektif harian
    const rawDailyTarget = isTodayWeekday ? baseDailyBudget : 0;
    const effectiveDailyBudget = isTodayWeekday ? (baseDailyBudget + dailyCarryOver) : 0;
    const dailyRemaining = effectiveDailyBudget - todaySpent;

    return {
        weeklyBudget: state.weeklyBudget,
        weeklySpent: totalWeeklySpent,
        weeklyRemaining: weeklyRemaining,
        weeklyCarryOver: isNaN(weeklyCarryOver) ? 0 : weeklyCarryOver,
        dailyTarget: rawDailyTarget,               // Target murni harian
        dailyBudgetEffective: effectiveDailyBudget,// Target + Carry Over
        dailySpent: todaySpent,                    // Pengeluaran hari ini
        dailyRemaining: dailyRemaining,            // Sisa hari ini
        dailyCarryOver: isNaN(dailyCarryOver) ? 0 : dailyCarryOver,
        isTodayWeekday: isTodayWeekday
    };
};

const updateStatusBadge = (badgeEl, value, limit) => {
    const ratio = limit > 0 ? (value / limit) : 0;
    if (value < 0 || ratio > 1) {
        badgeEl.className = 'px-2 py-0.5 text-xs font-semibold rounded-full bg-rose-100 text-rose-800';
        badgeEl.textContent = 'Terlampaui';
    } else if (ratio >= 0.8) {
        badgeEl.className = 'px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800';
        badgeEl.textContent = 'Mendekati Batas';
    } else {
        badgeEl.className = 'px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800';
        badgeEl.textContent = 'Aman';
    }
};

// === RENDER DASHBOARD ===
const renderDashboard = () => {
    const metrics = calculateBudgetMetrics();

    // 1. Metric Mingguan
    elements.weeklyBudget.textContent = formatIDR(metrics.weeklyBudget);
    elements.weeklySpent.textContent = formatIDR(metrics.weeklySpent);
    elements.weeklyRemaining.textContent = formatIDR(metrics.weeklyRemaining);
    elements.weeklyRemaining.className = `text-2xl font-bold ${metrics.weeklyRemaining < 0 ? 'text-rose-600' : 'text-emerald-600'}`;
    
    const weeklyPercentage = Math.min(Math.round((metrics.weeklySpent / metrics.weeklyBudget) * 100) || 0, 100);
    elements.weeklyProgress.style.width = `${weeklyPercentage}%`;
    elements.weeklyProgress.className = `h-2 rounded-full transition-all duration-300 ${weeklyPercentage >= 100 ? 'bg-rose-500' : weeklyPercentage >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`;
    
    updateStatusBadge(elements.weeklyStatusBadge, metrics.weeklySpent, metrics.weeklyBudget);

    // 2. Target Hari Ini (Murni) & Pengeluaran Hari Ini
    if (!metrics.isTodayWeekday) {
        elements.dailyBudget.textContent = "Weekend (Rp 0)";
        elements.dailyPercentage.textContent = "Hari Libur Budget";
    } else {
        elements.dailyBudget.textContent = formatIDR(metrics.dailyTarget);
    }
    elements.dailySpent.textContent = formatIDR(metrics.dailySpent);

    // 3. Sisa Hari Ini (Sisa Efektif dari Target + Carry Over)
    elements.dailyRemaining.textContent = formatIDR(metrics.dailyRemaining);
    elements.dailyRemaining.className = `text-2xl font-bold ${metrics.dailyRemaining < 0 ? 'text-rose-600' : 'text-emerald-600'}`;

    const dailyUsedPercent = metrics.dailyBudgetEffective > 0 
        ? Math.round((metrics.dailySpent / metrics.dailyBudgetEffective) * 100) 
        : 0;
    
    if (metrics.isTodayWeekday) {
        elements.dailyPercentage.textContent = `${dailyUsedPercent}% terpakai`;
    }

    updateStatusBadge(elements.dailyStatusBadge, metrics.dailySpent, metrics.dailyBudgetEffective);

    // 4. Carry-Over Cards
    elements.carryOver.textContent = formatIDR(metrics.dailyCarryOver);
    elements.carryOver.className = `text-2xl font-bold ${metrics.dailyCarryOver < 0 ? 'text-rose-600' : 'text-indigo-600'}`;

    const weeklyCarryEl = document.getElementById('val-weekly-carry-over');
    if (weeklyCarryEl) {
        weeklyCarryEl.textContent = formatIDR(metrics.weeklyCarryOver);
        weeklyCarryEl.className = `text-2xl font-bold ${metrics.weeklyCarryOver < 0 ? 'text-rose-600' : 'text-indigo-600'}`;
    }

    renderTransactions();
};

// === RENDER TRANSAKSI (GIFTED WITH SECTION PER HARI) ===
const renderTransactions = () => {
    let filtered = state.transactions.filter(tx => {
        const matchesCategory = state.filterCategory === 'all' || tx.category === state.filterCategory;
        const matchesSearch = tx.title.toLowerCase().includes(state.searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    elements.transactionCount.textContent = `${filtered.length} transaksi`;

    if (filtered.length === 0) {
        elements.transactionList.innerHTML = '';
        elements.transactionList.appendChild(elements.emptyState);
        elements.emptyState.classList.remove('hidden');
    } else {
        elements.emptyState.classList.add('hidden');

        // Grouping transaksi per tanggal
        const grouped = filtered.reduce((groups, tx) => {
            const date = tx.date;
            if (!groups[date]) groups[date] = [];
            groups[date].push(tx);
            return groups;
        }, {});

        // Sort tanggal terbaru di atas
        const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

        const html = sortedDates.map(dateStr => {
            const txs = grouped[dateStr];
            const totalSpentOnDate = txs.reduce((sum, t) => sum + Number(t.amount), 0);

            const txItemsHtml = txs.map(tx => `
                <div class="p-4 sm:px-5 flex items-center justify-between hover:bg-slate-50/80 transition-colors">
                    <div class="flex items-center space-x-3.5 min-w-0">
                        <div class="p-2.5 bg-slate-100 text-slate-600 rounded-lg shrink-0">
                            <i data-feather="tag" class="w-4 h-4"></i>
                        </div>
                        <div class="min-w-0">
                            <p class="text-sm font-semibold text-slate-900 truncate">${tx.title}</p>
                            <span class="inline-block bg-slate-100 px-2 py-0.5 rounded text-xs text-slate-600 font-medium mt-0.5">${tx.category}</span>
                        </div>
                    </div>
                    <div class="flex items-center space-x-3 shrink-0 ml-3">
                        <span class="text-sm font-bold text-slate-900">${formatIDR(tx.amount)}</span>
                        <div class="flex items-center space-x-1">
                            <button data-action="edit" data-id="${tx.id}" aria-label="Edit transaksi" class="btn-action p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100">
                                <i data-feather="edit-2" class="w-4 h-4 pointer-events-none"></i>
                            </button>
                            <button data-action="delete" data-id="${tx.id}" aria-label="Hapus transaksi" class="btn-action p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100">
                                <i data-feather="trash-2" class="w-4 h-4 pointer-events-none"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');

            return `
                <div class="border-b border-slate-100 last:border-b-0">
                    <!-- Header Section Tanggal -->
                    <div class="bg-slate-100/70 px-4 sm:px-5 py-2 flex items-center justify-between border-y border-slate-200/60">
                        <span class="text-xs font-bold text-slate-700 tracking-wide">${formatDateIndonesian(dateStr)}</span>
                        <span class="text-xs font-semibold text-slate-500">Total: ${formatIDR(totalSpentOnDate)}</span>
                    </div>
                    <!-- Daftar Transaksi Tanggal Tersebut -->
                    <div class="divide-y divide-slate-100">
                        ${txItemsHtml}
                    </div>
                </div>
            `;
        }).join('');

        elements.transactionList.innerHTML = html;
    }
    refreshIcons();
};

elements.transactionList.addEventListener('click', (e) => {
    const target = e.target.closest('.btn-action');
    if (!target) return;
    const action = target.getAttribute('data-action');
    const id = target.getAttribute('data-id');

    if (action === 'edit') editTransaction(id);
    if (action === 'delete') deleteTransaction(id);
});

// === MODAL CONTROLS & EVENT HANDLERS ===
const openModal = (modal) => modal.classList.remove('hidden');
const closeModal = (modal) => modal.classList.add('hidden');

const resetTransactionForm = () => {
    elements.txId.value = '';
    elements.txTitle.value = '';
    elements.txAmount.value = '';
    elements.txCategory.value = 'Makanan & Minuman';
    elements.txDate.value = getTodayString();
    elements.modalTitle.textContent = 'Tambah Transaksi';
};

elements.formTransaction.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.user) return;

    const id = elements.txId.value || Date.now().toString();
    const title = elements.txTitle.value.trim();
    const amount = Number(elements.txAmount.value);
    const category = elements.txCategory.value;
    const date = elements.txDate.value;

    try {
        await setDoc(doc(db, "users", state.user.uid, "transactions", id), {
            title, amount, category, date
        });
        showToast(elements.txId.value ? 'Transaksi diperbarui' : 'Transaksi ditambahkan');
        closeModal(elements.modalTransaction);
    } catch (error) {
        showToast('Gagal menyimpan transaksi', 'error');
    }
});

const editTransaction = (id) => {
    const tx = state.transactions.find(t => t.id === id);
    if (tx) {
        elements.txId.value = tx.id;
        elements.txTitle.value = tx.title;
        elements.txAmount.value = tx.amount;
        elements.txCategory.value = tx.category;
        elements.txDate.value = tx.date;
        elements.modalTitle.textContent = 'Edit Transaksi';
        openModal(elements.modalTransaction);
    }
};

const deleteTransaction = async (id) => {
    if (!state.user) return;
    if (confirm('Apakah Anda yakin ingin menghapus transaksi ini?')) {
        try {
            await deleteDoc(doc(db, "users", state.user.uid, "transactions", id));
            showToast('Transaksi dihapus');
        } catch (error) {
            showToast('Gagal menghapus', 'error');
        }
    }
};

elements.formSettings.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.user) return;
    const newBudget = Number(elements.setWeeklyBudget.value);

    if (newBudget >= 0) {
        try {
            await setDoc(doc(db, "users", state.user.uid, "settings", "user_settings"), {
                weeklyBudget: newBudget
            });
            closeModal(elements.modalSettings);
            showToast('Pengaturan disimpan');
        } catch (error) {
            showToast('Gagal menyimpan pengaturan', 'error');
        }
    }
});

elements.btnOpenAddModal.addEventListener('click', () => {
    resetTransactionForm();
    openModal(elements.modalTransaction);
});

elements.btnCloseModal.addEventListener('click', () => closeModal(elements.modalTransaction));
elements.btnCancelModal.addEventListener('click', () => closeModal(elements.modalTransaction));

elements.btnOpenSettings.addEventListener('click', () => {
    elements.setWeeklyBudget.value = state.weeklyBudget;
    openModal(elements.modalSettings);
});

elements.btnCloseSettings.addEventListener('click', () => closeModal(elements.modalSettings));
elements.btnCancelSettings.addEventListener('click', () => closeModal(elements.modalSettings));

elements.filterCategory.addEventListener('change', (e) => {
    state.filterCategory = e.target.value;
    renderTransactions();
});

elements.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderTransactions();
});

window.addEventListener('click', (e) => {
    if (e.target === elements.modalTransaction) closeModal(elements.modalTransaction);
    if (e.target === elements.modalSettings) closeModal(elements.modalSettings);
});