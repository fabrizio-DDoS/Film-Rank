import { useState, useEffect, useCallback } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Landmark, Bitcoin, BarChart2, Layers, ChevronDown, ChevronUp, Plus, Trash2, RefreshCw } from "lucide-react";

const STORAGE_KEY = "financial-organizer-data-v1";

const formatBRL = (value) => {
  if (value === "" || value === null || value === undefined) return "";
  const num = parseFloat(value);
  if (isNaN(num)) return "";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
};

const parseBRL = (str) => {
  if (!str) return 0;
  const cleaned = str.toString().replace(/[R$\s.]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
};

const PALETTE = {
  cash: "#C9A84C",
  stocks: "#4C9AC9",
  land: "#4CC97A",
  alts: "#C94C9A",
};

const defaultData = {
  cashflow: { income: "", expenses: "" },
  assets: {
    cash: "",
    stocks: "",
    land: "",
    alts: "",
  },
  stocksDetail: [
    { id: 1, name: "S&P 500", value: "" },
    { id: 2, name: "IBOVESPA", value: "" },
  ],
  altsDetail: [
    { id: 1, name: "Bitcoin", value: "" },
    { id: 2, name: "Ouro", value: "" },
  ],
  history: [],
};

function CurrencyInput({ value, onChange, placeholder }) {
  const [display, setDisplay] = useState(value ? formatBRL(value) : "");

  useEffect(() => {
    setDisplay(value ? formatBRL(value) : "");
  }, [value]);

  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^0-9,]/g, "");
    setDisplay(raw);
    const num = parseBRL(raw);
    onChange(num);
  };

  const handleBlur = () => {
    const num = parseBRL(display);
    if (num) setDisplay(formatBRL(num));
    else setDisplay("");
  };

  const handleFocus = () => {
    const num = parseBRL(display);
    if (num) setDisplay(num.toFixed(2).replace(".", ","));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      placeholder={placeholder || "R$ 0,00"}
      style={{
        width: "100%",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(201,168,76,0.2)",
        borderRadius: "8px",
        padding: "10px 14px",
        color: "#E8DCC8",
        fontFamily: "'DM Mono', monospace",
        fontSize: "14px",
        outline: "none",
        transition: "border-color 0.2s",
        boxSizing: "border-box",
      }}
      onMouseEnter={(e) => (e.target.style.borderColor = "rgba(201,168,76,0.5)")}
      onMouseLeave={(e) => (e.target.style.borderColor = "rgba(201,168,76,0.2)")}
    />
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: "linear-gradient(145deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
      border: "1px solid rgba(201,168,76,0.15)",
      borderRadius: "16px",
      padding: "24px",
      backdropFilter: "blur(8px)",
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionTitle({ icon, label, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
      <div style={{
        width: 32, height: 32, borderRadius: "8px",
        background: `${color}22`,
        border: `1px solid ${color}44`,
        display: "flex", alignItems: "center", justifyContent: "center", color,
      }}>
        {icon}
      </div>
      <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "15px", color: "#E8DCC8", letterSpacing: "0.5px" }}>
        {label}
      </span>
    </div>
  );
}

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const d = payload[0];
    return (
      <div style={{
        background: "#1A1610", border: "1px solid rgba(201,168,76,0.3)",
        borderRadius: "10px", padding: "10px 16px",
      }}>
        <div style={{ color: d.payload.fill, fontFamily: "'DM Mono', monospace", fontSize: "13px" }}>{d.name}</div>
        <div style={{ color: "#E8DCC8", fontFamily: "'DM Mono', monospace", fontSize: "14px", fontWeight: "600" }}>
          {formatBRL(d.value)}
        </div>
        <div style={{ color: "#888", fontFamily: "'DM Mono', monospace", fontSize: "12px" }}>
          {d.payload.pct?.toFixed(1)}%
        </div>
      </div>
    );
  }
  return null;
};

export default function FinancialOrganizer() {
  const [data, setData] = useState(defaultData);
  const [expanded, setExpanded] = useState({ stocks: true, alts: true });
  const [saved, setSaved] = useState(false);
  const [nextId, setNextId] = useState(10);

  useEffect(() => {
    const fonts = document.createElement("link");
    fonts.rel = "stylesheet";
    fonts.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Mono:wght@300;400;500&display=swap";
    document.head.appendChild(fonts);

    (async () => {
      try {
        const stored = await window.storage.get(STORAGE_KEY);
        if (stored?.value) setData(JSON.parse(stored.value));
      } catch {}
    })();
  }, []);

  const save = useCallback(async (d) => {
    try {
      await window.storage.set(STORAGE_KEY, JSON.stringify(d));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {}
  }, []);

  const update = (path, value) => {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const parts = path.split(".");
      let obj = next;
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
      obj[parts[parts.length - 1]] = value;
      save(next);
      return next;
    });
  };

  const updateDetail = (section, id, value) => {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const item = next[section].find((x) => x.id === id);
      if (item) item.value = value;
      save(next);
      return next;
    });
  };

  const addDetail = (section, defaultName) => {
    const id = nextId;
    setNextId(id + 1);
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next[section].push({ id, name: defaultName, value: "" });
      save(next);
      return next;
    });
  };

  const removeDetail = (section, id) => {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next[section] = next[section].filter((x) => x.id !== id);
      save(next);
      return next;
    });
  };

  const updateDetailName = (section, id, name) => {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const item = next[section].find((x) => x.id === id);
      if (item) item.name = name;
      save(next);
      return next;
    });
  };

  // Calcs
  const income = parseBRL(data.cashflow.income);
  const expenses = parseBRL(data.cashflow.expenses);
  const netCashflow = income - expenses;

  const cash = parseBRL(data.assets.cash);
  const stocksTotal = data.stocksDetail.reduce((s, x) => s + parseBRL(x.value), 0) || parseBRL(data.assets.stocks);
  const land = parseBRL(data.assets.land);
  const altsTotal = data.altsDetail.reduce((s, x) => s + parseBRL(x.value), 0) || parseBRL(data.assets.alts);
  const total = cash + stocksTotal + land + altsTotal;

  const pct = (v) => (total > 0 ? (v / total) * 100 : 0);

  const pieData = [
    { name: "Caixa", value: cash, fill: PALETTE.cash, pct: pct(cash) },
    { name: "Ações", value: stocksTotal, fill: PALETTE.stocks, pct: pct(stocksTotal) },
    { name: "Terras", value: land, fill: PALETTE.land, pct: pct(land) },
    { name: "Alternativos", value: altsTotal, fill: PALETTE.alts, pct: pct(altsTotal) },
  ].filter((d) => d.value > 0);

  const categories = [
    { key: "cash", label: "Caixa", color: PALETTE.cash, value: cash, icon: <DollarSign size={15} /> },
    { key: "stocks", label: "Ações", color: PALETTE.stocks, value: stocksTotal, icon: <BarChart2 size={15} /> },
    { key: "land", label: "Terras", color: PALETTE.land, value: land, icon: <Landmark size={15} /> },
    { key: "alts", label: "Alternativos", color: PALETTE.alts, value: altsTotal, icon: <Layers size={15} /> },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0D0B08 0%, #16120D 50%, #0F0C09 100%)",
      fontFamily: "'DM Mono', monospace",
      padding: "0",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background texture */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at 20% 20%, rgba(201,168,76,0.05) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(76,154,201,0.04) 0%, transparent 50%)",
      }} />

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Header */}
        <div style={{ marginBottom: "40px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <div style={{ color: "#C9A84C", fontFamily: "'DM Mono', monospace", fontSize: "11px", letterSpacing: "3px", textTransform: "uppercase", marginBottom: "8px" }}>
                Gestão de Patrimônio
              </div>
              <h1 style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: "clamp(28px, 5vw, 44px)",
                color: "#E8DCC8",
                margin: 0,
                fontWeight: 700,
                lineHeight: 1.1,
              }}>
                Organizador<br />
                <span style={{ color: "#C9A84C" }}>Financeiro</span>
              </h1>
            </div>
            <div style={{
              background: "linear-gradient(135deg, rgba(201,168,76,0.12), rgba(201,168,76,0.04))",
              border: "1px solid rgba(201,168,76,0.25)",
              borderRadius: "14px",
              padding: "20px 28px",
              textAlign: "right",
            }}>
              <div style={{ color: "#888", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "6px" }}>Patrimônio Total</div>
              <div style={{ color: "#C9A84C", fontSize: "clamp(22px, 4vw, 36px)", fontWeight: "500", letterSpacing: "-1px" }}>
                {total > 0 ? formatBRL(total) : "R$ —"}
              </div>
              {saved && <div style={{ color: "#4CC97A", fontSize: "11px", marginTop: "6px" }}>✓ Salvo</div>}
            </div>
          </div>
        </div>

        {/* Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>

          {/* Fluxo de Caixa */}
          <Card>
            <SectionTitle icon={<TrendingUp size={16} />} label="Fluxo do Mês" color="#C9A84C" />
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ color: "#888", fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
                  Entrada
                </label>
                <CurrencyInput value={data.cashflow.income} onChange={(v) => update("cashflow.income", v)} />
              </div>
              <div>
                <label style={{ color: "#888", fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
                  Saída
                </label>
                <CurrencyInput value={data.cashflow.expenses} onChange={(v) => update("cashflow.expenses", v)} />
              </div>
              <div style={{
                marginTop: "8px",
                padding: "14px 16px",
                borderRadius: "10px",
                background: netCashflow >= 0 ? "rgba(76,201,122,0.08)" : "rgba(201,76,76,0.08)",
                border: `1px solid ${netCashflow >= 0 ? "rgba(76,201,122,0.2)" : "rgba(201,76,76,0.2)"}`,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{ color: "#888", fontSize: "12px" }}>Saldo líquido</span>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {netCashflow >= 0 ? <TrendingUp size={14} color="#4CC97A" /> : <TrendingDown size={14} color="#C94C4C" />}
                  <span style={{ color: netCashflow >= 0 ? "#4CC97A" : "#C94C4C", fontSize: "15px", fontWeight: "500" }}>
                    {income || expenses ? formatBRL(Math.abs(netCashflow)) : "—"}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Alocação Gráfica */}
          <Card>
            <SectionTitle icon={<BarChart2 size={16} />} label="Alocação do Portfólio" color="#4C9AC9" />
            {total > 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
                <div style={{ width: 140, height: 140, flexShrink: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={65} paddingAngle={3} dataKey="value">
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} strokeWidth={0} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px", minWidth: "120px" }}>
                  {categories.map((c) => (
                    c.value > 0 && (
                      <div key={c.key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                        <span style={{ color: "#888", fontSize: "12px", flex: 1 }}>{c.label}</span>
                        <span style={{ color: c.color, fontSize: "12px", fontWeight: "500" }}>
                          {pct(c.value).toFixed(1)}%
                        </span>
                      </div>
                    )
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ color: "#555", fontSize: "13px", textAlign: "center", padding: "30px 0" }}>
                Adicione valores para ver a alocação
              </div>
            )}
          </Card>
        </div>

        {/* Barras de patrimônio */}
        <div style={{ marginTop: "20px" }}>
          <Card>
            <SectionTitle icon={<Layers size={16} />} label="Distribuição Patrimonial" color="#C9A84C" />
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {categories.map((c) => (
                <div key={c.key}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", color: c.color, fontSize: "13px" }}>
                      {c.icon}{c.label}
                    </div>
                    <span style={{ color: "#E8DCC8", fontSize: "13px" }}>
                      {c.value > 0 ? formatBRL(c.value) : "—"} <span style={{ color: "#555" }}>({pct(c.value).toFixed(1)}%)</span>
                    </span>
                  </div>
                  <div style={{ height: "6px", background: "rgba(255,255,255,0.05)", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", width: `${pct(c.value)}%`,
                      background: `linear-gradient(90deg, ${c.color}cc, ${c.color})`,
                      borderRadius: "3px",
                      transition: "width 0.6s ease",
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Inputs de Ativos */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px", marginTop: "20px" }}>

          {/* Caixa */}
          <Card>
            <SectionTitle icon={<DollarSign size={16} />} label="Caixa" color={PALETTE.cash} />
            <CurrencyInput value={data.assets.cash} onChange={(v) => update("assets.cash", v)} />
          </Card>

          {/* Terras */}
          <Card>
            <SectionTitle icon={<Landmark size={16} />} label="Terras / Imóveis" color={PALETTE.land} />
            <CurrencyInput value={data.assets.land} onChange={(v) => update("assets.land", v)} />
          </Card>
        </div>

        {/* Ações */}
        <div style={{ marginTop: "20px" }}>
          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <SectionTitle icon={<BarChart2 size={16} />} label="Ações" color={PALETTE.stocks} />
              <button
                onClick={() => setExpanded((e) => ({ ...e, stocks: !e.stocks }))}
                style={{ background: "none", border: "none", color: "#888", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontSize: "12px" }}
              >
                {expanded.stocks ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
            {expanded.stocks && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {data.stocksDetail.map((item) => (
                  <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "10px", alignItems: "center" }}>
                    <input
                      value={item.name}
                      onChange={(e) => updateDetailName("stocksDetail", item.id, e.target.value)}
                      style={{
                        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(76,154,201,0.2)",
                        borderRadius: "8px", padding: "10px 14px", color: "#E8DCC8",
                        fontFamily: "'DM Mono', monospace", fontSize: "13px", outline: "none",
                      }}
                    />
                    <CurrencyInput value={item.value} onChange={(v) => updateDetail("stocksDetail", item.id, v)} />
                    <button
                      onClick={() => removeDetail("stocksDetail", item.id)}
                      style={{ background: "none", border: "none", color: "#555", cursor: "pointer", padding: "4px" }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addDetail("stocksDetail", "Nova Ação")}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    background: "rgba(76,154,201,0.08)", border: "1px dashed rgba(76,154,201,0.3)",
                    borderRadius: "8px", padding: "9px 14px", color: PALETTE.stocks,
                    fontSize: "12px", cursor: "pointer", fontFamily: "'DM Mono', monospace",
                  }}
                >
                  <Plus size={14} /> Adicionar ativo
                </button>
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "12px", display: "flex", justifyContent: "flex-end" }}>
                  <span style={{ color: "#888", fontSize: "12px" }}>Total: </span>
                  <span style={{ color: PALETTE.stocks, fontSize: "13px", marginLeft: "8px" }}>{formatBRL(stocksTotal) || "—"}</span>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Alternativos */}
        <div style={{ marginTop: "20px" }}>
          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <SectionTitle icon={<Bitcoin size={16} />} label="Alternativos" color={PALETTE.alts} />
              <button
                onClick={() => setExpanded((e) => ({ ...e, alts: !e.alts }))}
                style={{ background: "none", border: "none", color: "#888", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontSize: "12px" }}
              >
                {expanded.alts ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
            {expanded.alts && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {data.altsDetail.map((item) => (
                  <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "10px", alignItems: "center" }}>
                    <input
                      value={item.name}
                      onChange={(e) => updateDetailName("altsDetail", item.id, e.target.value)}
                      style={{
                        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(201,76,154,0.2)",
                        borderRadius: "8px", padding: "10px 14px", color: "#E8DCC8",
                        fontFamily: "'DM Mono', monospace", fontSize: "13px", outline: "none",
                      }}
                    />
                    <CurrencyInput value={item.value} onChange={(v) => updateDetail("altsDetail", item.id, v)} />
                    <button
                      onClick={() => removeDetail("altsDetail", item.id)}
                      style={{ background: "none", border: "none", color: "#555", cursor: "pointer", padding: "4px" }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addDetail("altsDetail", "Novo Ativo")}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    background: "rgba(201,76,154,0.08)", border: "1px dashed rgba(201,76,154,0.3)",
                    borderRadius: "8px", padding: "9px 14px", color: PALETTE.alts,
                    fontSize: "12px", cursor: "pointer", fontFamily: "'DM Mono', monospace",
                  }}
                >
                  <Plus size={14} /> Adicionar ativo
                </button>
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "12px", display: "flex", justifyContent: "flex-end" }}>
                  <span style={{ color: "#888", fontSize: "12px" }}>Total: </span>
                  <span style={{ color: PALETTE.alts, fontSize: "13px", marginLeft: "8px" }}>{formatBRL(altsTotal) || "—"}</span>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Resumo final */}
        <div style={{ marginTop: "20px" }}>
          <Card style={{ background: "linear-gradient(135deg, rgba(201,168,76,0.1), rgba(201,168,76,0.03))" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "20px" }}>
              {[
                { label: "Patrimônio Total", value: total, color: "#C9A84C" },
                { label: "Entrada Mensal", value: income, color: "#4CC97A" },
                { label: "Saída Mensal", value: expenses, color: "#C94C4C" },
                { label: "Saldo Líquido", value: netCashflow, color: netCashflow >= 0 ? "#4CC97A" : "#C94C4C" },
              ].map((item) => (
                <div key={item.label} style={{ textAlign: "center" }}>
                  <div style={{ color: "#666", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "8px" }}>{item.label}</div>
                  <div style={{ color: item.color, fontSize: "18px", fontWeight: "500" }}>
                    {item.value ? formatBRL(item.value) : "—"}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div style={{ textAlign: "center", marginTop: "24px", color: "#333", fontSize: "11px", letterSpacing: "1px" }}>
          Os dados são salvos automaticamente no seu navegador
        </div>
      </div>
    </div>
  );
}
