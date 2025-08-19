
"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth.tsx';
import { useFirestore } from "@/hooks/useFirestore";
import { DateRange } from "react-day-picker";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Check, ChevronDown, Pencil, Trash, PlusCircle, ChevronsUpDown, Eye, EyeOff, FileDown, LogOut } from "lucide-react";
import { DatePickerWithPresets } from "@/components/DatePickerWithPresets";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";


// Helpers
const fmtBRL = (n) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(n || 0)
  );

const todayYM = () => {
  const d = new Date();
  const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};
const ymFromDate = (iso) => (iso ? iso.slice(0, 7) : "");
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`;

// Calculadoras
const groupSign = (g) => (g === "saida" ? -1 : 1);
const categoryById = (data, id) => data.categorias.find((c) => c.id === id);
const subcatById = (data, id) => data.subcategorias.find((s) => s.id === id);
const catName = (data, id) => categoryById(data, id)?.name || "";
const subName = (data, id) => subcatById(data, id)?.name || "";

const entriesInDateRange = (entries, range) => {
  if (!range?.from) return entries;
  
  const from = new Date(range.from);
  from.setHours(0, 0, 0, 0);
  const to = new Date(range.to || range.from);
  to.setHours(23, 59, 59, 999);
  
  return entries.filter((e) => {
    try {
      const entryDate = new Date(e.date);
      return entryDate >= from && entryDate <= to;
    } catch {
      return false;
    }
  });
};

const computeKpisForRange = (data, range) => {
  const inRange = entriesInDateRange(data.entries, range);
  const kpis = { Entradas: 0, Saidas: 0, Resultado: 0 };
  data.categorias.forEach(c => kpis[c.name] = 0);

  for (const e of inRange) {
    const cat = categoryById(data, e.categoryId);
    if (!cat) continue;
    const s = Number(e.value) || 0; // GARANTIR que é número
    const sign = groupSign(cat.group);
    
    if (cat.group === "entrada") kpis.Entradas += s;
    if (cat.group === "saida") kpis.Saidas -= s;
    
    kpis[cat.name] = (kpis[cat.name] || 0) + (sign * s);
  }
  kpis.Resultado = kpis.Entradas + kpis.Saidas;
  return kpis;
};


const buildSeriesForRange = (data, range) => {
    const inRange = range && range.from ? entriesInDateRange(data.entries, range) : data.entries;
    
    if (inRange.length === 0) return [];
    
    const dailyData = {};

    const initDayData = () => {
        const dayData = { Entradas: 0, Saidas: 0, Resultado: 0 };
        data.categorias.forEach(c => dayData[c.name] = 0);
        return dayData;
    };
    
    for (const e of inRange) {
        const day = e.date;
        if (!day) continue;
        
        if (!dailyData[day]) {
            dailyData[day] = initDayData();
        }
        
        const cat = categoryById(data, e.categoryId);
        if (!cat) continue;
        
        const value = Number(e.value) || 0; // GARANTIR que é número
        const sign = groupSign(cat.group);
        
        if (cat.group === "entrada") {
            dailyData[day].Entradas += value;
        } else if (cat.group === "saida") {
            dailyData[day].Saidas -= value;
        }
        
        dailyData[day][cat.name] = (dailyData[day][cat.name] || 0) + (sign * value);
    }
    
    Object.keys(dailyData).forEach(day => {
        const dayKpis = dailyData[day];
        dayKpis.Resultado = dayKpis.Entradas + dayKpis.Saidas;
    });
    
    return Object.entries(dailyData)
        .map(([date, values]) => ({ date, ...values }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

// Ordenação
const sortEntries = (list, data, sort) => {
  if (!sort || !sort.col || !sort.dir) return list;
  const m = [...list];
  m.sort((a, b) => {
    const dir = sort.dir === "asc" ? 1 : -1;
    let va, vb;
    switch (sort.col) {
      case "date": va = a.date || ""; vb = b.date || ""; return va.localeCompare(vb) * dir;
      case "category": va = catName(data, a.categoryId); vb = catName(data, b.categoryId); return va.localeCompare(vb) * dir;
      case "subcategory": va = subName(data, a.subcategoryId); vb = subName(data, b.subcategoryId); return va.localeCompare(vb) * dir;
      case "description": va = a.description || ""; vb = b.description || ""; return va.localeCompare(vb) * dir;
      case "value": va = groupSign(categoryById(data, a.categoryId)?.group) * (a.value || 0); vb = groupSign(categoryById(data, b.categoryId)?.group) * (b.value || 0); return (va - vb) * dir;
      default: return 0;
    }
  });
  return m;
};

// Icons
const Spinner = ({ className = "w-4 h-4" }) => (
  <span className={`inline-block ${className} rounded-full border-2 border-current border-t-transparent animate-spin`} aria-hidden />
);

const Arrows = ({ state }) => <span className="inline-block w-3 text-xs ml-1 opacity-60">{state === "asc" ? "▲" : state === "desc" ? "▼" : ""}</span>;

// Small UI
function Toast({ toast, onHide }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onHide, toast.timeout ?? 2200);
    return () => clearTimeout(t);
  }, [toast, onHide]);
  if (!toast) return null;
  const color = toast.kind === "error" ? "bg-red-600" : toast.kind === "success" ? "bg-emerald-600" : "bg-slate-800";
  return (
    <div className={`fixed bottom-4 right-4 text-white ${color} rounded-xl shadow-lg px-4 py-2 z-50 flex items-center gap-2`} role="status" aria-live="polite">
      {toast.kind === "loading" ? <Spinner /> : toast.kind === "success" ? <Check className="h-4 w-4" /> : null}
      <span className="text-sm">{toast.message}</span>
      <button className="ml-2 opacity-70 hover:opacity-100" onClick={onHide}>✕</button>
    </div>
  );
}

const METRIC_COLORS = {
  "Entradas": "#10b981",
  "Saidas": "#ef4444",
  "Resultado": "#0ea5e9",
};

const generateColor = (str) => {
    if (!str) return '#CCCCCC';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = '#';
    for (let i = 0; i < 3; i++) {
        const value = (hash >> (i * 8)) & 0xFF;
        color += ('00' + value.toString(16)).substr(-2);
    }
    return color;
}

function InteractiveKpi({ title, value, onMetricChange, color, metricOptions, privacy }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="flex-1 p-4 rounded-2xl shadow-sm border border-gray-100 cursor-pointer" style={{ backgroundColor: `${color}1A`}}>
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color }}>
                <span>{title}</span>
                <ChevronDown className="h-4 w-4 opacity-70" />
            </div>
            <div className={`text-2xl font-semibold mt-1 tracking-tight text-slate-900 ${privacy ? 'blur-sm' : ''}`}>{fmtBRL(value)}</div>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {metricOptions.map(metric => (
          <DropdownMenuItem key={metric} onSelect={() => onMetricChange(metric)}>
            {metric}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortHeader({ label, col, sort, onToggle }) {
  const state = sort.col === col ? sort.dir : null;
  return (
    <button className="flex items-center" onClick={() => onToggle(col)}>
      <span>{label}</span>
      <Arrows state={state} />
    </button>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white text-slate-900 rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg mx-4 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// App
export default function App() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  
  const { data, config, setConfig, service, loading: firestoreLoading } = useFirestore(user?.uid);
  
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterSub, setFilterSub] = useState("");
  const [sort, setSort] = useState({ col: "date", dir: "asc" });
  const [modal, setModal] = useState({ type: null, payload: null });
  const [editingEntry, setEditingEntry] = useState(null);
  const [entryForm, setEntryForm] = useState({ date: new Date().toISOString().split('T')[0], categoryId: "", subcategoryId: "", description: "", value: "" });

  const [editingCategory, setEditingCategory] = useState(null);
  const [editingSubcategory, setEditingSubcategory] = useState(null);

  const [activeMetrics, setActiveMetrics] = useState([]);
  
  const [toast, setToast] = useState(null);
  const showToast = (message, kind = "info", timeout = 2200) => setToast({ id: Date.now(), message, kind, timeout });

  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  
  const loading = authLoading || firestoreLoading;

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);


  useEffect(() => {
    if (data.categorias.length > 0) {
      setActiveMetrics(["Resultado", "Entradas", "Saidas", data.categorias[0].name]);
    } else {
      setActiveMetrics(["Resultado", "Entradas", "Saidas"]);
    }
  }, [data.categorias]);


  const kpis = useMemo(() => (config.dateRange ? computeKpisForRange(data, config.dateRange) : {}), [data, config.dateRange]);
  const series = useMemo(() => buildSeriesForRange(data, config.dateRange), [data, config.dateRange]);
  const metricOptions = useMemo(() => ["Entradas", "Saidas", "Resultado", ...data.categorias.map(c => c.name)], [data.categorias]);
  const metricColors = useMemo(() => {
    const colors = { ...METRIC_COLORS };
    data.categorias.forEach(c => {
      if (!colors[c.name]) {
        colors[c.name] = generateColor(c.name);
      }
    });
    return colors;
  }, [data.categorias]);

  const subOptionsFor = (catId) => {
    if (!catId) return [];
    return data.subcategorias.filter((s) => s.categoryId === catId);
  };

  const availableSubcategoriesForFilter = useMemo(() => {
    if (!filterCat) return [];
    return data.subcategorias.filter((s) => s.categoryId === filterCat);
  }, [data.subcategorias, filterCat]);

  const entriesInRange = useMemo(() => entriesInDateRange(data.entries, config.dateRange), [data.entries, config.dateRange]);
  
  const entriesFiltered = useMemo(() => {
    let list = entriesInRange;
    
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) => 
        (catName(data, e.categoryId) || "").toLowerCase().includes(q) || 
        (subName(data, e.subcategoryId) || "").toLowerCase().includes(q) || 
        (e.description || "").toLowerCase().includes(q)
      );
    }
    
    if (filterCat) {
      list = list.filter((e) => e.categoryId === filterCat);
    }
    
    if (filterSub && filterCat) {
      list = list.filter((e) => e.subcategoryId === filterSub);
    }
    
    return list;
  }, [entriesInRange, filterCat, filterSub, search, data]);
  
  const entriesSorted = useMemo(() => sortEntries(entriesFiltered, data, sort), [entriesFiltered, data, sort]);

  const toggleSort = (col) => setSort((prev) => (prev.col !== col ? { col, dir: "asc" } : prev.dir === "asc" ? { col, dir: "desc" } : prev.dir === "desc" ? { col, dir: null } : { col, dir: "asc" }));
  
  const handleCategoryChangeForForm = (categoryId) => {
    setEntryForm(f => ({ 
      ...f, 
      categoryId: categoryId, 
      subcategoryId: "" 
    }));
  };

  const handleCategoryChangeForEditingEntry = (categoryId) => {
    setEditingEntry(currentEntry => ({
        ...currentEntry,
        categoryId: categoryId,
        subcategoryId: "", // Reset subcategory when category changes
    }));
  };

  const handleFilterCategoryChange = (categoryId) => {
    setFilterCat(categoryId);
    setFilterSub(""); 
  };

  // --- CRUD Lançamentos ---
  const addEntry = async () => {
    if (!entryForm.date || !entryForm.categoryId || !entryForm.subcategoryId || entryForm.value === "") {
      showToast("Preencha data, categoria, subcategoria e valor.", "error");
      return;
    }
    const e = { 
      id: uid(), 
      date: entryForm.date, 
      yearMonth: ymFromDate(entryForm.date), 
      categoryId: entryForm.categoryId, 
      subcategoryId: entryForm.subcategoryId, 
      description: entryForm.description || "", 
      value: Number(entryForm.value) 
    };
    await service.addEntry(e);
    setEntryForm({ date: new Date().toISOString().split('T')[0], categoryId: "", subcategoryId: "", description: "", value: "" });
    showToast("Lançamento adicionado!", "success");
  };

  const askDeleteEntry = (id) => setModal({ 
    type: "confirm", 
    payload: { 
      title: "Excluir lançamento", 
      message: "Tem certeza?", 
      onConfirm: async () => { 
        await service.deleteEntry(id);
        setModal({ type: null, payload: null }); 
        showToast("Lançamento excluído!", "success"); 
      } 
    } 
  });
  
  const startEditEntry = (entry) => {
    setEditingEntry({ ...entry });
  };
  
  const saveEditEntry = async () => {
    if (!editingEntry) return;
    if (!editingEntry.date || !editingEntry.categoryId || !editingEntry.subcategoryId || editingEntry.value === "") {
      showToast("Preencha data, categoria, subcategoria e valor.", "error");
      return;
    }
    await service.updateEntry(editingEntry.id, editingEntry);
    setEditingEntry(null);
    showToast("Lançamento atualizado!", "success");
  };

  // --- CRUD Categorias ---
  const saveCategory = async () => {
    if (!editingCategory.name || !editingCategory.group) {
      showToast("Preencha nome e grupo.", "error");
      return;
    }
    const catData = {...editingCategory};
    if (catData.id) { // Update
      await service.updateCategoria(catData.id, catData);
      showToast("Categoria atualizada!", "success");
    } else { // Create
      catData.id = uid();
      await service.addCategoria(catData);
      showToast("Categoria criada!", "success");
    }
    setEditingCategory(null);
  };

  const askDeleteCategory = (catId) => {
    const subs = data.subcategorias.filter(s => s.categoryId === catId);
    const ents = data.entries.filter(e => e.categoryId === catId);
    if (subs.length > 0 || ents.length > 0) {
      return showToast(`Não é possível excluir: Há ${subs.length} subcategorias e ${ents.length} lançamentos associados.`, "error", 4000);
    }
    setModal({ 
      type: "confirm", 
      payload: { 
        title: "Excluir Categoria", 
        message: `Tem certeza que deseja excluir a categoria "${catName(data, catId)}"?`, 
        onConfirm: async () => {
          await service.deleteCategoria(catId);
          setModal({ type: null, payload: null });
          showToast("Categoria excluída!", "success");
        }
      }
    });
  };

  // --- CRUD Subcategorias ---
  const saveSubcategory = async () => {
    if (!editingSubcategory.name || !editingSubcategory.categoryId) {
      showToast("Preencha nome e selecione a categoria pai.", "error");
      return;
    }
    const subData = {...editingSubcategory};
    if (subData.id) { // Update
      await service.updateSubcategoria(subData.id, subData);
      showToast("Subcategoria atualizada!", "success");
    } else { // Create
      subData.id = uid();
      await service.addSubcategoria(subData);
      showToast("Subcategoria criada!", "success");
    }
    setEditingSubcategory(null);
  };

  const askDeleteSubcategory = (subId) => {
    const ents = data.entries.filter(e => e.subcategoryId === subId);
    if (ents.length > 0) {
      return showToast(`Não é possível excluir: Há ${ents.length} lançamentos associados.`, "error", 4000);
    }
    setModal({ 
      type: "confirm", 
      payload: { 
        title: "Excluir Subcategoria", 
        message: `Tem certeza que deseja excluir a subcategoria "${subName(data, subId)}"?`, 
        onConfirm: async () => {
          await service.deleteSubcategoria(subId);
          setModal({ type: null, payload: null });
          showToast("Subcategoria excluída!", "success");
        }
      }
    });
  };

  const handleDownloadPdf = async () => {
    const chartElement = chartRef.current;
    if (!chartElement) return;

    setIsDownloadingPdf(true);
    showToast("Gerando PDF...", "loading", 5000);

    try {
        const autoTable = (await import('jspdf-autotable')).default;
        const pdf = new jsPDF();

        // Header
        pdf.setFontSize(18);
        pdf.text("Relatório Financeiro", 14, 22);
        pdf.setFontSize(11);
        pdf.text("Gateway Financeiro", 14, 28);
        
        const dateRangeText = config.dateRange?.from 
            ? `${new Date(config.dateRange.from).toLocaleDateString('pt-BR')} - ${new Date(config.dateRange.to || config.dateRange.from).toLocaleDateString('pt-BR')}`
            : "Todo o período";

        pdf.text(`Período: ${dateRangeText}`, 14, 34);
        pdf.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 40);


        // KPIs
        const kpiY = 55;
        pdf.setFontSize(12);
        pdf.text("Resumo do Período", 14, kpiY);
        pdf.setFontSize(10);
        pdf.text(`Resultado: ${fmtBRL(kpis.Resultado)}`, 14, kpiY + 7);
        pdf.text(`Entradas: ${fmtBRL(kpis.Entradas)}`, 14, kpiY + 12);
        pdf.text(`Saídas: ${fmtBRL(kpis.Saidas)}`, 14, kpiY + 17);

        // Chart Image
        const canvas = await html2canvas(chartElement, {
            useCORS: true,
            backgroundColor: '#ffffff' // Force white background for consistency
        });
        const imgData = canvas.toDataURL('image/png');
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const imgWidth = pdfWidth - 28;
        const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
        pdf.addImage(imgData, 'PNG', 14, kpiY + 25, imgWidth, imgHeight);


        // Entries Table
        const tableData = entriesSorted.map(e => {
          const cat = categoryById(data, e.categoryId);
          const sub = subcatById(data, e.subcategoryId);
          const signedValue = groupSign(cat?.group) * (e.value || 0);
          return [
            e.date,
            cat?.name || '',
            sub?.name || '',
            e.description || '',
            fmtBRL(signedValue)
          ];
        });

        autoTable(pdf, {
            startY: kpiY + 25 + imgHeight + 10,
            head: [['Data', 'Categoria', 'Subcategoria', 'Descrição', 'Valor']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [41, 128, 185] }, // Blue header
            didParseCell: function(data) {
                // Color rows based on value
                if (data.column.dataKey === 4) { // 'Valor' column
                    if (data.cell.raw.toString().includes('-')) {
                        data.cell.styles.textColor = [231, 76, 60]; // Red for negative
                    } else {
                        data.cell.styles.textColor = [39, 174, 96]; // Green for positive
                    }
                }
            }
        });

        pdf.save(`relatorio-financeiro-${new Date().toISOString().slice(0, 10)}.pdf`);
        showToast("PDF gerado com sucesso!", "success");

    } catch (error) {
        console.error("Erro ao gerar PDF:", error);
        showToast("Falha ao gerar o PDF.", "error");
    } finally {
        setIsDownloadingPdf(false);
    }
  };
  
  const handleMetricChange = (index, newMetric) => {
    setActiveMetrics(currentMetrics => {
        const updatedMetrics = [...currentMetrics];
        updatedMetrics[index] = newMetric;
        return updatedMetrics;
    });
  };

  const handleSignOut = async () => {
    await logout();
    router.push('/login');
  };

  const rootBg = config.dark ? "bg-slate-950 text-slate-100" : "bg-gradient-to-b from-slate-50 to-white text-slate-900";
  const heroBg = config.dark ? "bg-gradient-to-r from-black via-slate-900 to-black text-white" : "bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-900 text-white";

  if (loading || !user) {
    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50">
            <Spinner className="w-10 h-10" />
        </div>
    );
  }

  return (
    <div className={`min-h-screen ${rootBg}`}>
      <Toast toast={toast} onHide={() => setToast(null)} />
      
      {/* Hero */}
      <div className={heroBg}>
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">Gateway Financeiro</h1>
                <p className="text-sm/6 text-white/70">Dashboard de finanças inteligente: visualize, filtre e exporte com praticidade.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <DatePickerWithPresets 
                date={config.dateRange}
                onDateChange={(range) => setConfig(c => ({...c, dateRange: range}))}
              />
              <div className="hidden md:block w-px h-6 bg-white/20" />
              <Button variant="outline" className="bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white" onClick={() => setConfig((c) => ({ ...c, privacy: !c.privacy }))}>
                {config.privacy ? <EyeOff /> : <Eye />}
              </Button>
              <Button variant="outline" className="bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white" onClick={() => setConfig((c) => ({ ...c, dark: !c.dark }))}>{config.dark ? "Tema: Escuro" : "Tema: Claro"}</Button>
              <Button variant="outline" className="bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white" onClick={handleDownloadPdf} disabled={isDownloadingPdf}>
                {isDownloadingPdf ? <Spinner /> : <FileDown />}
                {isDownloadingPdf ? "Gerando..." : "Baixar PDF"}
              </Button>
               <Button variant="outline" className="bg-red-500 text-white border-red-500/30 hover:bg-red-600" onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2 flex-1">
            <input className="w-full md:max-w-sm border rounded-lg px-3 py-2" placeholder="Buscar por descrição, categoria ou subcategoria" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button className="text-sm text-slate-600 hover:underline" onClick={() => setSearch("")}>limpar</button>}
          </div>
          <div className="text-sm text-slate-500">Resultado do período: <span className={`${kpis.Resultado < 0 ? "text-red-600" : "text-emerald-600"} font-semibold ${config.privacy ? 'blur-sm' : ''}`}>{fmtBRL(kpis.Resultado)}</span></div>
        </div>

        <section className="bg-white text-slate-900 rounded-2xl shadow-sm border border-gray-100 p-4 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              {activeMetrics.map((metric, index) => (
                  <InteractiveKpi 
                    key={index}
                    title={metric}
                    value={kpis[metric]}
                    onMetricChange={(newMetric) => handleMetricChange(index, newMetric)}
                    color={metricColors[metric]}
                    metricOptions={metricOptions}
                    privacy={config.privacy}
                  />
              ))}
          </div>

          <div ref={chartRef} className={`w-full h-72 ${config.privacy ? 'blur-sm' : ''}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(v) => fmtBRL(v)} />
                <Legend />
                {Array.from(new Set(activeMetrics)).map(metric => (
                  <Line key={metric} type="monotone" dataKey={metric} stroke={metricColors[metric]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <section className="bg-white text-slate-900 rounded-2xl shadow-sm border border-gray-100 p-4 lg:col-span-2">
            <h2 className="font-semibold tracking-tight mb-4">Lançar novo item</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end mb-4">
                <div className="md:col-span-1">
                    <label className="text-xs text-slate-500">Data</label>
                    <input type="date" className="w-full border rounded-lg px-3 py-2" value={entryForm.date} onChange={(e) => setEntryForm((f) => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="md:col-span-1">
                    <label className="text-xs text-slate-500">Categoria</label>
                    <select className="w-full border rounded-lg px-3 py-2" value={entryForm.categoryId} onChange={(e) => handleCategoryChangeForForm(e.target.value)}>
                    <option value="">Selecione…</option>
                    {data.categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <div className="md:col-span-1">
                    <label className="text-xs text-slate-500">Subcategoria</label>
                    <select className="w-full border rounded-lg px-3 py-2" value={entryForm.subcategoryId} onChange={(e) => setEntryForm((f) => ({ ...f, subcategoryId: e.target.value }))} disabled={!entryForm.categoryId}>
                    <option value="">Selecione…</option>
                    {subOptionsFor(entryForm.categoryId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
                <div className="md:col-span-1">
                    <label className="text-xs text-slate-500">Valor</label>
                    <input type="number" min="0" step="0.01" className="w-full border rounded-lg px-3 py-2" value={entryForm.value} onChange={(e) => setEntryForm((f) => ({ ...f, value: e.target.value }))} />
                </div>
                 <div className="md:col-span-1 flex justify-end gap-2">
                    <Button variant="outline" onClick={() => { setEntryForm({ date: "", categoryId: "", subcategoryId: "", description: "", value: "" }); }}>Limpar</Button>
                    <Button onClick={addEntry}>Adicionar</Button>
                </div>
                <div className="md:col-span-5">
                    <label className="text-xs text-slate-500">Descrição</label>
                    <input className="w-full border rounded-lg px-3 py-2" value={entryForm.description} onChange={(e) => setEntryForm((f) => ({ ...f, description: e.target.value }))} placeholder="(opcional)" />
                </div>
            </div>

            {/* Filtros da tabela */}
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <div>
                <label className="text-xs text-slate-500">Filtrar por categoria</label>
                <select className="border rounded-lg px-3 py-2" value={filterCat} onChange={(e) => handleFilterCategoryChange(e.target.value)}>
                  <option value="">Todas</option>
                  {data.categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Filtrar por subcategoria</label>
                <select className="border rounded-lg px-3 py-2" value={filterSub} onChange={(e) => setFilterSub(e.target.value)} disabled={!filterCat}>
                  <option value="">Todas</option>
                  {availableSubcategoriesForFilter.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-2 pr-3"><SortHeader label="Data" col="date" sort={sort} onToggle={toggleSort} /></th>
                    <th className="py-2 pr-3"><SortHeader label="Categoria" col="category" sort={sort} onToggle={toggleSort} /></th>
                    <th className="py-2 pr-3"><SortHeader label="Subcategoria" col="subcategory" sort={sort} onToggle={toggleSort} /></th>
                    <th className="py-2 pr-3"><SortHeader label="Descrição" col="description" sort={sort} onToggle={toggleSort} /></th>
                    <th className="py-2 pr-3 text-right"><SortHeader label="Valor (±)" col="value" sort={sort} onToggle={toggleSort} /></th>
                    <th className="py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {entriesSorted.map((e) => {
                    const cat = categoryById(data, e.categoryId);
                    const sub = subcatById(data, e.subcategoryId);
                    const signed = groupSign(cat?.group) * (e.value || 0);
                    return (
                      <tr key={e.id} className="border-t">
                        <td className="py-2 pr-3 whitespace-nowrap">{e.date}</td>
                        <td className="py-2 pr-3">{cat?.name || ""}</td>
                        <td className="py-2 pr-3">{sub?.name || ""}</td>
                        <td className="py-2 pr-3">{e.description}</td>
                        <td className={`py-2 pr-3 text-right ${signed < 0 ? "text-red-600" : "text-emerald-700"} ${config.privacy ? 'blur-sm' : ''}`}>{fmtBRL(signed)}</td>
                        <td className="py-2 flex items-center gap-2">
                          <Button variant="outline" size="icon" title="Editar" onClick={() => startEditEntry(e)}>
                            <Pencil />
                          </Button>
                          <Button variant="outline" size="icon" title="Excluir" onClick={() => askDeleteEntry(e.id)}>
                            <Trash />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {entriesSorted.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  {filterCat || filterSub || search ? "Nenhum lançamento encontrado com os filtros aplicados" : "Nenhum lançamento no período selecionado"}
                </div>
              )}
            </div>
          </section>

          <section className="bg-white text-slate-900 rounded-2xl shadow-sm border border-gray-100">
             <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger className="px-4 py-3 font-semibold hover:no-underline">
                  <div className="flex items-center gap-2">
                    <ChevronsUpDown className="h-4 w-4" />
                    Gerenciar Categorias e Subcategorias
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">Categorias</h3>
                    <Button variant="ghost" size="sm" onClick={() => setEditingCategory({name: '', group: 'saida'})}><PlusCircle className="mr-2 h-4 w-4" /> Nova</Button>
                  </div>
                  <ul className="space-y-1 text-sm mb-4">
                    {data.categorias.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2 p-1 rounded-md hover:bg-slate-50">
                        <span>{c.name} <span className="text-xs text-slate-500">({c.group})</span></span>
                         <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-6 w-6" title="Editar Categoria" onClick={() => setEditingCategory({...c})}><Pencil className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" title="Excluir Categoria" onClick={() => askDeleteCategory(c.id)}><Trash className="h-3 w-3" /></Button>
                         </div>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">Subcategorias</h3>
                    <Button variant="ghost" size="sm" onClick={() => setEditingSubcategory({name: '', categoryId: ''})}><PlusCircle className="mr-2 h-4 w-4" /> Nova</Button>
                  </div>
                  <ul className="space-y-1 text-sm">
                    {data.subcategorias.map((s) => (
                       <li key={s.id} className="flex items-center justify-between gap-2 p-1 rounded-md hover:bg-slate-50">
                          <span>{s.name} <span className="text-xs text-slate-500">({catName(data, s.categoryId)})</span></span>
                           <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-6 w-6" title="Editar Subcategoria" onClick={() => setEditingSubcategory({...s})}><Pencil className="h-3 w-3" /></Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" title="Excluir Subcategoria" onClick={() => askDeleteSubcategory(s.id)}><Trash className="h-3 w-3" /></Button>
                           </div>
                        </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </section>
        </div>
      </main>

      {/* Modais */}
      {modal?.type === "confirm" && (
        <Modal title={modal.payload?.title || "Confirmar"} onClose={() => setModal({ type: null, payload: null })}>
          <p className="text-slate-700 mb-4">{modal.payload?.message || "Tem certeza?"}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModal({ type: null, payload: null })}>Cancelar</Button>
            <Button variant="destructive" onClick={() => modal.payload?.onConfirm?.()}>Confirmar</Button>
          </div>
        </Modal>
      )}

      {editingEntry && (
        <Modal title="Editar lançamento" onClose={() => setEditingEntry(null)}>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs text-slate-500">Data</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2" value={editingEntry.date} onChange={(e) => setEditingEntry((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-slate-500">Categoria</label>
              <select className="w-full border rounded-lg px-3 py-2" value={editingEntry.categoryId} onChange={(e) => handleCategoryChangeForEditingEntry(e.target.value)}>
                <option value="">Selecione…</option>
                {data.categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-slate-500">Subcategoria</label>
              <select className="w-full border rounded-lg px-3 py-2" value={editingEntry.subcategoryId} onChange={(e) => setEditingEntry((f) => ({ ...f, subcategoryId: e.target.value }))}>
                <option value="">Selecione…</option>
                {subOptionsFor(editingEntry.categoryId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-slate-500">Valor</label>
              <input type="number" min="0" step="0.01" className="w-full border rounded-lg px-3 py-2" value={editingEntry.value} onChange={(e) => setEditingEntry((f) => ({ ...f, value: e.target.value }))} />
            </div>
            <div className="md:col-span-4">
              <label className="text-xs text-slate-500">Descrição</label>
              <input className="w-full border rounded-lg px-3 py-2" value={editingEntry.description} onChange={(e) => setEditingEntry((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="md:col-span-6 flex justify-end gap-2 mt-2">
              <Button variant="outline" onClick={() => setEditingEntry(null)}>Cancelar</Button>
              <Button onClick={saveEditEntry}>Salvar</Button>
            </div>
          </div>
        </Modal>
      )}

      {editingCategory && (
        <Modal title={editingCategory.id ? "Editar Categoria" : "Nova Categoria"} onClose={() => setEditingCategory(null)}>
          <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500">Nome da Categoria</label>
                <input className="w-full border rounded-lg px-3 py-2" value={editingCategory.name} onChange={(e) => setEditingCategory(c => ({...c, name: e.target.value}))} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Grupo da Categoria</label>
                <select className="w-full border rounded-lg px-3 py-2" value={editingCategory.group} onChange={(e) => setEditingCategory(c => ({...c, group: e.target.value}))}>
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <Button variant="outline" onClick={() => setEditingCategory(null)}>Cancelar</Button>
                <Button onClick={saveCategory}>Salvar</Button>
              </div>
          </div>
        </Modal>
      )}

      {editingSubcategory && (
        <Modal title={editingSubcategory.id ? "Editar Subcategoria" : "Nova Subcategoria"} onClose={() => setEditingSubcategory(null)}>
          <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500">Nome da Subcategoria</label>
                <input className="w-full border rounded-lg px-3 py-2" value={editingSubcategory.name} onChange={(e) => setEditingSubcategory(s => ({...s, name: e.target.value}))} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Categoria Pai</label>
                <select className="w-full border rounded-lg px-3 py-2" value={editingSubcategory.categoryId} onChange={(e) => setEditingSubcategory(s => ({...s, categoryId: e.target.value}))}>
                  <option value="">Selecione...</option>
                  {data.categorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <Button variant="outline" onClick={() => setEditingSubcategory(null)}>Cancelar</Button>
                <Button onClick={saveSubcategory}>Salvar</Button>
              </div>
          </div>
        </Modal>
      )}
      <footer className="text-center py-4 text-sm text-slate-500">
        Desenvolvido por Yuri Rodrigues 🚀
      </footer>
    </div>
  );
}
