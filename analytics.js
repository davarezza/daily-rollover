import { addDays, getWeekRange, normalizeWorkdays, parseDate, sumAmount, toDateStr } from './budget.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const inRange = (transactions, start, end) => transactions.filter((tx) => tx.date >= start && tx.date <= end);

export const getDailySeries = (transactions, weeklyBudget, workdayIndexes, now = new Date()) => {
    const workdays = normalizeWorkdays(workdayIndexes);
    const target = Math.round(weeklyBudget / workdays.length);
    const today = toDateStr(now);
    const monday = parseDate(getWeekRange(now).start);

    return Array.from({ length: 7 }, (_, index) => {
        const date = toDateStr(addDays(monday, index));
        return {
            date,
            index,
            spent: sumAmount(transactions.filter((tx) => tx.date === date)),
            target: workdays.includes(index) ? target : 0,
            isToday: date === today
        };
    });
};

export const getCategoryTotals = (transactions, start, end) => {
    const totals = new Map();
    inRange(transactions, start, end).forEach((tx) => {
        totals.set(tx.category, (totals.get(tx.category) ?? 0) + Number(tx.amount));
    });
    return [...totals].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
};

export const getWeeklyTotals = (transactions, count = 6, now = new Date()) => {
    const currentMonday = parseDate(getWeekRange(now).start);
    return Array.from({ length: count }, (_, index) => {
        const start = toDateStr(addDays(currentMonday, -7 * (count - 1 - index)));
        const end = toDateStr(addDays(parseDate(start), 6));
        return { start, end, spent: sumAmount(inRange(transactions, start, end)), isCurrent: index === count - 1 };
    });
};

export const compareWeeks = (transactions, now = new Date()) => {
    const currentStart = parseDate(getWeekRange(now).start);
    const elapsed = Math.round((parseDate(toDateStr(now)) - currentStart) / DAY_MS);
    const previousStart = addDays(currentStart, -7);
    const range = (monday) => [toDateStr(monday), toDateStr(addDays(monday, elapsed))];
    const [currentFrom, currentTo] = range(currentStart);
    const [previousFrom, previousTo] = range(previousStart);

    const current = sumAmount(inRange(transactions, currentFrom, currentTo));
    const previous = sumAmount(inRange(transactions, previousFrom, previousTo));
    const currentByCategory = new Map(getCategoryTotals(transactions, currentFrom, currentTo).map((row) => [row.category, row.total]));
    const previousByCategory = new Map(getCategoryTotals(transactions, previousFrom, previousTo).map((row) => [row.category, row.total]));
    const categories = [...new Set([...currentByCategory.keys(), ...previousByCategory.keys()])]
        .map((category) => ({
            category,
            current: currentByCategory.get(category) ?? 0,
            previous: previousByCategory.get(category) ?? 0
        }))
        .sort((a, b) => Math.max(b.current, b.previous) - Math.max(a.current, a.previous));

    return {
        elapsedDays: elapsed + 1,
        current,
        previous,
        previousFull: sumAmount(inRange(transactions, previousFrom, toDateStr(addDays(previousStart, 6)))),
        delta: current - previous,
        percent: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null,
        categories
    };
};
