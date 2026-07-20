import { useState, useEffect, useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Plus, TrendingUp, Wallet, Sparkles, Trash2, Eye, EyeOff, X } from "lucide-react";

const CATEGORIES = [
    { name: "Food", color: "#C9A227" },
    { name: "Transport", color: "#2F6F52" },
    { name: "Bills", color: "#B5493B" },
    { name: "Shopping", color: "#6E7FB5" },
    { name: "Health", color: "#9B6FA6" },
    { name: "Other", color: "#7A8288" },
];

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export default function Ledger() {
    const [entries, setEntries] = useState([]);
    const [budget, setBudget] = useState(50000);
    const [loaded, setLoaded] = useState(false);
    const [amount, setAmount] = useState("");
    const [category, setCategory] = useState("Food");
    const [note, setNote] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [showKey, setShowKey] = useState(false);
    const [insight, setInsight] = useState("");
    const [insightLoading, setInsightLoading] = useState(false);
    const [insightError, setInsightError] = useState("");
    const [budgetDraft, setBudgetDraft] = useState("50000");
    const [editingBudget, setEditingBudget] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const e = await window.storage.get("ledger:entries");
                if (e) setEntries(JSON.parse(e.value));
            } catch { }
            try {
                const b = await window.storage.get("ledger:budget");
                if (b) {
                    setBudget(JSON.parse(b.value));
                    setBudgetDraft(String(JSON.parse(b.value)));
                }
            } catch { }
            setLoaded(true);
        })();
    }, []);

    useEffect(() => {
        if (!loaded) return;
        window.storage.set("ledger:entries", JSON.stringify(entries)).catch(() => { });
    }, [entries, loaded]);

    useEffect(() => {
        if (!loaded) return;
        window.storage.set("ledger:budget", JSON.stringify(budget)).catch(() => { });
    }, [budget, loaded]);

    const total = useMemo(() => entries.reduce((s, e) => s + e.amount, 0), [entries]);
    const remaining = budget - total;
    const pct = budget > 0 ? Math.min(100, (total / budget) * 100) : 0;

    const byCategory = useMemo(() => {
        const map = {};
        entries.forEach((e) => {
            map[e.category] = (map[e.category] || 0) + e.amount;
        });
        return CATEGORIES.map((c) => ({ name: c.name, value: map[c.name] || 0, color: c.color })).filter(
            (c) => c.value > 0
        );
    }, [entries]);

    function addEntry() {
        const num = parseFloat(amount);
        if (!num || num <= 0) return;
        setEntries([{ id: uid(), amount: num, category, note: note.trim(), date: new Date().toISOString() }, ...entries]);
        setAmount("");
        setNote("");
    }

    function removeEntry(id) {
        setEntries(entries.filter((e) => e.id !== id));
    }

    function saveBudget() {
        const num = parseFloat(budgetDraft);
        if (num > 0) setBudget(num);
        setEditingBudget(false);
    }

    async function getInsight() {
        if (!apiKey.trim()) {
            setInsightError("Apni Gemini API key daalein pehle.");
            return;
        }
        if (entries.length === 0) {
            setInsightError("Pehle kuch expenses add karein.");
            return;
        }
        setInsightLoading(true);
        setInsightError("");
        setInsight("");
        try {
            const summary = byCategory.map((c) => `${c.name}: PKR ${c.value.toLocaleString()}`).join(", ");
            const prompt = `You are a friendly personal finance assistant inside a budgeting app called Ledger. Here is the user's data:
Monthly budget: PKR ${budget.toLocaleString()}
Total spent so far: PKR ${total.toLocaleString()}
Remaining: PKR ${remaining.toLocaleString()}
Spending by category: ${summary}
Recent transactions: ${entries.slice(0, 8).map((e) => `${e.category} PKR ${e.amount} (${e.note || "no note"})`).join("; ")}

Give a short, encouraging, specific analysis in 3-4 sentences: call out the top spending category, whether they're on track for the month, and one concrete actionable tip. Keep it conversational, no markdown headers, no bullet points.`;

            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${encodeURIComponent(
                    apiKey.trim()
                )}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                    }),
                }
            );
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error?.message || "API request failed");
            }
            const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
            if (!text) throw new Error("Empty response from model.");
            setInsight(text);
        } catch (err) {
            setInsightError(err.message || "Kuch ghalat ho gaya. API key check karein.");
        } finally {
            setInsightLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-[#12161A] text-[#F2EFE9] font-sans">
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
        .font-display { font-family: 'Fraunces', serif; }
        .font-sans { font-family: 'Inter', sans-serif; }
        .num { font-variant-numeric: tabular-nums; }
      `}</style>

            <div className="max-w-2xl mx-auto px-5 py-10">
                <header className="mb-8 flex items-baseline justify-between">
                    <div>
                        <div className="text-[11px] tracking-[0.2em] uppercase text-[#C9A227] mb-1">Ledger</div>
                        <h1 className="font-display text-3xl font-semibold">Where it went.</h1>
                    </div>
                    <Wallet className="w-6 h-6 text-[#7A8288]" />
                </header>

                {/* Budget summary */}
                <div className="bg-[#1B2026] rounded-2xl p-6 mb-6 border border-[#262C33]">
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <div className="text-xs text-[#8A9099] mb-1">Spent this month</div>
                            <div className="font-display text-4xl num">
                                PKR {total.toLocaleString()}
                            </div>
                        </div>
                        <button
                            onClick={() => setEditingBudget(!editingBudget)}
                            className="text-xs text-[#C9A227] hover:underline mt-1"
                        >
                            {editingBudget ? "cancel" : "edit budget"}
                        </button>
                    </div>

                    {editingBudget ? (
                        <div className="flex gap-2 mb-4">
                            <input
                                type="number"
                                value={budgetDraft}
                                onChange={(e) => setBudgetDraft(e.target.value)}
                                className="flex-1 bg-[#12161A] border border-[#333A42] rounded-lg px-3 py-2 text-sm num outline-none focus:border-[#C9A227]"
                            />
                            <button onClick={saveBudget} className="px-4 py-2 bg-[#C9A227] text-[#12161A] rounded-lg text-sm font-medium">
                                Save
                            </button>
                        </div>
                    ) : null}

                    <div className="w-full h-2 bg-[#12161A] rounded-full overflow-hidden mb-2">
                        <div
                            className="h-full rounded-full transition-all"
                            style={{
                                width: `${pct}%`,
                                backgroundColor: remaining < 0 ? "#B5493B" : pct > 80 ? "#C9A227" : "#2F6F52",
                            }}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-[#8A9099] num">
                        <span>Budget: PKR {budget.toLocaleString()}</span>
                        <span className={remaining < 0 ? "text-[#D9695C]" : ""}>
                            {remaining < 0 ? "Over by " : "Remaining: "}PKR {Math.abs(remaining).toLocaleString()}
                        </span>
                    </div>
                </div>

                {/* Add entry */}
                <div className="bg-[#1B2026] rounded-2xl p-5 mb-6 border border-[#262C33]">
                    <div className="text-xs text-[#8A9099] mb-3 uppercase tracking-wide">Add expense</div>
                    <div className="flex gap-2 mb-3">
                        <input
                            type="number"
                            placeholder="Amount"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-32 bg-[#12161A] border border-[#333A42] rounded-lg px-3 py-2 text-sm num outline-none focus:border-[#C9A227]"
                        />
                        <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="bg-[#12161A] border border-[#333A42] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#C9A227]"
                        >
                            {CATEGORIES.map((c) => (
                                <option key={c.name} value={c.name}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                        <input
                            type="text"
                            placeholder="Note (optional)"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            className="flex-1 bg-[#12161A] border border-[#333A42] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#C9A227]"
                        />
                    </div>
                    <button
                        onClick={addEntry}
                        className="w-full flex items-center justify-center gap-2 bg-[#2F6F52] hover:bg-[#356B4E] text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
                    >
                        <Plus className="w-4 h-4" /> Add
                    </button>
                </div>

                {/* Chart + list */}
                {entries.length > 0 && (
                    <div className="bg-[#1B2026] rounded-2xl p-5 mb-6 border border-[#262C33]">
                        <div className="text-xs text-[#8A9099] mb-3 uppercase tracking-wide">By category</div>
                        <div className="flex items-center gap-4">
                            <div className="w-28 h-28 shrink-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={byCategory} dataKey="value" innerRadius={30} outerRadius={50} paddingAngle={2}>
                                            {byCategory.map((c, i) => (
                                                <Cell key={i} fill={c.color} stroke="none" />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(v) => `PKR ${v.toLocaleString()}`}
                                            contentStyle={{ background: "#12161A", border: "1px solid #333A42", borderRadius: 8, fontSize: 12 }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="flex-1 space-y-1.5">
                                {byCategory.map((c) => (
                                    <div key={c.name} className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                                            <span className="text-[#B8BEC5]">{c.name}</span>
                                        </div>
                                        <span className="num text-[#8A9099]">PKR {c.value.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                <div className="mb-6">
                    <div className="text-xs text-[#8A9099] mb-3 uppercase tracking-wide px-1">Recent</div>
                    <div className="space-y-1.5">
                        {entries.length === 0 && (
                            <div className="text-sm text-[#5C636B] text-center py-8 bg-[#1B2026] rounded-2xl border border-[#262C33] border-dashed">
                                No expenses yet. Add your first one above.
                            </div>
                        )}
                        {entries.map((e) => {
                            const cat = CATEGORIES.find((c) => c.name === e.category);
                            return (
                                <div
                                    key={e.id}
                                    className="flex items-center justify-between bg-[#1B2026] border border-[#262C33] rounded-xl px-4 py-3 group"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat?.color }} />
                                        <div>
                                            <div className="text-sm">{e.category}</div>
                                            {e.note && <div className="text-xs text-[#6B7178]">{e.note}</div>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="num text-sm">PKR {e.amount.toLocaleString()}</span>
                                        <button
                                            onClick={() => removeEntry(e.id)}
                                            className="opacity-0 group-hover:opacity-100 text-[#6B7178] hover:text-[#D9695C] transition-opacity"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* AI Insights */}
                <div className="bg-gradient-to-br from-[#1B2026] to-[#1F2530] rounded-2xl p-5 border border-[#2A3038]">
                    <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-4 h-4 text-[#C9A227]" />
                        <div className="text-xs text-[#8A9099] uppercase tracking-wide">AI Spending Insight</div>
                    </div>

                    <div className="mb-3">
                        <label className="text-xs text-[#6B7178] mb-1 block">Gemini API key (session only, not saved)</label>
                        <div className="relative">
                            <input
                                type={showKey ? "text" : "password"}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="Paste your Gemini API key"
                                className="w-full bg-[#12161A] border border-[#333A42] rounded-lg px-3 py-2 pr-9 text-sm outline-none focus:border-[#C9A227]"
                            />
                            <button
                                onClick={() => setShowKey(!showKey)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6B7178]"
                            >
                                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <button
                        onClick={getInsight}
                        disabled={insightLoading}
                        className="w-full flex items-center justify-center gap-2 bg-[#C9A227] hover:bg-[#D4AD30] disabled:opacity-50 text-[#12161A] rounded-lg py-2.5 text-sm font-medium transition-colors"
                    >
                        {insightLoading ? (
                            "Thinking..."
                        ) : (
                            <>
                                <TrendingUp className="w-4 h-4" /> Get Insight
                            </>
                        )}
                    </button>

                    {insightError && (
                        <div className="mt-3 text-xs text-[#D9695C] flex items-start gap-1.5">
                            <X className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {insightError}
                        </div>
                    )}

                    {insight && (
                        <div className="mt-4 text-sm leading-relaxed text-[#D8DBDF] font-display italic border-l-2 border-[#C9A227] pl-3">
                            {insight}
                        </div>
                    )}
                </div>

                <div className="text-center text-[10px] text-[#4A5057] mt-8 tracking-wide">
                    Built with Google AI Studio &amp; Antigravity &middot; AI Seekho 2026
                </div>
            </div>
        </div>
    );
}
