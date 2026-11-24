export const WORKDAYS = 5;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const pad = (number) => String(number).padStart(2, '0');

export const toDateStr = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const parseDate = (dateStr) => new Date(`${dateStr}T00:00:00`);

export const addDays = (date, days) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
};

export const getWeekRange = (date = new Date()) => {
    const monday = addDays(parseDate(toDateStr(date)), -((date.getDay() + 6) % 7));
    return { start: toDateStr(monday), end: toDateStr(addDays(monday, 6)) };
};

export const sumAmount = (transactions) => transactions.reduce((total, tx) => total + Number(tx.amount), 0);

const countPastWeeks = (pastTransactions, currentStart) => {
    if (!pastTransactions.length) return 0;
    const earliest = pastTransactions.map((tx) => tx.date).sort()[0];
    const firstWeekStart = getWeekRange(parseDate(earliest)).start;
    return Math.round((parseDate(currentStart) - parseDate(firstWeekStart)) / WEEK_MS);
};

export const calculateMetrics = (transactions, weeklyBudget, now = new Date()) => {
    const today = toDateStr(now);
    const { start, end } = getWeekRange(now);
    const baseDaily = Math.round(weeklyBudget / WORKDAYS);

    const weekTransactions = transactions.filter((tx) => tx.date >= start && tx.date <= end);
    const pastTransactions = transactions.filter((tx) => tx.date < start);
    const workdays = Array.from({ length: WORKDAYS }, (_, index) => toDateStr(addDays(parseDate(start), index)));
    const passedWorkdays = workdays.filter((day) => day < today);
    const isWorkday = workdays.includes(today);

    const weeklySpent = sumAmount(weekTransactions);
    const weeklyRemaining = weeklyBudget - weeklySpent;
    const dailySpent = sumAmount(weekTransactions.filter((tx) => tx.date === today));
    const dailyCarryOver = passedWorkdays.length * baseDaily
        - sumAmount(weekTransactions.filter((tx) => passedWorkdays.includes(tx.date)));
    const dailyTarget = isWorkday ? baseDaily : 0;
    const dailyLimit = isWorkday ? baseDaily + dailyCarryOver : 0;
    const dailyRemaining = dailyLimit - dailySpent;

    return {
        today,
        workdays,
        isWorkday,
        workdayNumber: workdays.indexOf(today) + 1,
        remainingWorkdays: workdays.filter((day) => day > today).length,
        weeklyBudget,
        weeklySpent,
        weeklyRemaining,
        weeklyCarryOver: countPastWeeks(pastTransactions, start) * weeklyBudget - sumAmount(pastTransactions),
        dailyTarget,
        dailyCarryOver,
        dailyLimit,
        dailySpent,
        dailyRemaining,
        spendLimit: isWorkday ? Math.min(dailyRemaining, weeklyRemaining) : 0
    };
};