

"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth.tsx';
import { useFirestore } from "@/hooks/useFirestore";
import { useCountUp } from "@/hooks/useCountUp";
import { DateRange } from "react-day-picker";
import { addMonths, format, subDays, startOfDay } from 'date-fns';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Check, ChevronDown, Pencil, Trash, PlusCircle, ChevronsUpDown, Eye, EyeOff, FileDown, LogOut, User as UserIcon, Wallet, LineChart as LineChartIcon, BarChart3, PieChart as PieChartIcon, CheckCircle2, Circle, ArrowDown, ArrowUp } from "lucide-react";
import { DatePickerWithPresets } from "@/components/DatePickerWithPresets";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuGroup } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
import { cn } from "@/lib/utils";


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
const accountById = (data, id) => data.accounts.find((a) => a.id === id);
const catName = (data, id) => categoryById(data, id)?.name || "";
const subName = (data, id) => subcatById(data, id)?.name || "";
const accountName = (data, id) => accountById(data, id)?.name || "";
const getSubcatMetricName = (catName, subName) => `${catName} > ${subName}`;

const entriesInDateRange = (entries, range) => {
  if (!range?.from) {
    return entries;
  }

  const from = startOfDay(new Date(range.from));
  const to = new Date(range.to || range.from);
  to.setHours(23, 59, 59, 999);

  return entries.filter((e) => {
    if (!e.date) return false;
    
    // Split the date string and create a Date object in the user's local timezone
    const parts = e.date.split('-').map(part => parseInt(part, 10));
    const entryDate = new Date(parts[0], parts[1] - 1, parts[2]);
    entryDate.setHours(0, 0, 0, 0); // Normalize to the beginning of the day

    return entryDate >= from && entryDate <= to;
  });
};


const computeKpisForRange = (data, range) => {
  const inRange = entriesInDateRange(data.entries, range);
  const kpis = { Entradas: 0, Saidas: 0, Resultado: 0, "Saldo Total Atual": 0 };
  
  let totalBalance = data.accounts.reduce((acc, account) => acc + (Number(account.initialBalance) || 0), 0);
  
  for (const e of data.entries) {
      if (e.status !== 'paid') continue;
      const cat = categoryById(data, e.categoryId);
      if (!cat) continue;
      const s = Number(e.value) || 0;
      totalBalance += s * groupSign(cat.group);
  }
  kpis["Saldo Total Atual"] = totalBalance;
  
  data.categorias.forEach(c => kpis[c.name] = 0);
  data.subcategorias.forEach(s => {
      const cat = catName(data, s.categoryId);
      if (cat) kpis[getSubcatMetricName(cat, s.name)] = 0;
  });

  for (const e of inRange) {
    if (e.status !== 'paid') continue;
    const cat = categoryById(data, e.categoryId);
    const sub = subcatById(data, e.subcategoryId);
    if (!cat) continue;
    
    const s = Number(e.value) || 0;
    const sign = groupSign(cat.group);
    
    if (cat.group === "entrada") kpis.Entradas += s;
    if (cat.group === "saida") kpis.Saidas -= s;
    
    kpis[cat.name] = (kpis[cat.name] || 0) + (sign * s);
    if (sub) {
        const subcatMetricName = getSubcatMetricName(cat.name, sub.name);
        kpis[subcatMetricName] = (kpis[subcatMetricName] || 0) + (sign * s);
    }
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
        data.subcategorias.forEach(s => {
            const cat = catName(data, s.categoryId);
            if (cat) dayData[getSubcatMetricName(cat, s.name)] = 0;
        });
        return dayData;
    };
    
    for (const e of inRange) {
        if (e.status !== 'paid') continue;
        const day = e.date;
        if (!day) continue;
        
        if (!dailyData[day]) {
            dailyData[day] = initDayData();
        }
        
        const cat = categoryById(data, e.categoryId);
        const sub = subcatById(data, e.subcategoryId);
        if (!cat) continue;
        
        const value = Number(e.value) || 0; 
        const sign = groupSign(cat.group);
        
        if (cat.group === "entrada") {
            dailyData[day].Entradas += value;
        } else if (cat.group === "saida") {
            dailyData[day].Saidas -= value;
        }
        
        dailyData[day][cat.name] = (dailyData[day][cat.name] || 0) + (sign * value);
        if (sub) {
            const subcatMetricName = getSubcatMetricName(cat.name, sub.name);
            dailyData[day][subcatMetricName] = (dailyData[day][subcatMetricName] || 0) + (sign * value);
        }
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
      case "account": va = accountName(data, a.accountId); vb = accountName(data, b.accountId); return va.localeCompare(vb) * dir;
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
  "Saldo Total Atual": "#8b5cf6",
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
  const animatedValue = useCountUp(value, 1500);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="flex-1 p-4 rounded-2xl shadow-sm border border-gray-100 cursor-pointer" style={{ backgroundColor: `${color}1A`}}>
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color }}>
                <span>{title}</span>
                {metricOptions && <ChevronDown className="h-4 w-4 opacity-70" />}
            </div>
            <div className={`text-2xl font-semibold mt-1 tracking-tight text-slate-900 ${privacy ? 'blur-sm' : ''}`}>{fmtBRL(animatedValue)}</div>
        </div>
      </DropdownMenuTrigger>
       {metricOptions && (
        <DropdownMenuContent>
            {metricOptions.map((metric, index) => {
            if (typeof metric === 'string') {
                return (
                <DropdownMenuItem key={metric} onSelect={() => onMetricChange(metric)}>
                    {metric}
                </DropdownMenuItem>
                );
            }
            if (metric.subcategories.length === 0) {
                return (
                <DropdownMenuItem key={metric.name} onSelect={() => onMetricChange(metric.name)}>
                    {metric.name}
                </DropdownMenuItem>
                );
            }
            return (
                <DropdownMenuSub key={metric.name}>
                <DropdownMenuSubTrigger>
                    <span>{metric.name}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                    <DropdownMenuItem onSelect={() => onMetricChange(metric.name)}>Ver total da categoria</DropdownMenuItem>
                    <DropdownMenuGroup>
                    {metric.subcategories.map(sub => (
                        <DropdownMenuItem key={sub.name} onSelect={() => onMetricChange(sub.fullName)}>
                        {sub.name}
                        </DropdownMenuItem>
                    ))}
                    </DropdownMenuGroup>
                </DropdownMenuSubContent>
                </DropdownMenuSub>
            );
            })}
        </DropdownMenuContent>
       )}
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

function Modal({ title, children, onClose, show }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white text-slate-900 rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg mx-4 p-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900">✕</button>
        </div>
        <div className="overflow-y-auto pr-2 -mr-2">
            {children}
        </div>
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
  
  const [modal, setModal] = useState({ type: null, payload: null, show: false });
  const [entryModal, setEntryModal] = useState({ show: false, type: 'saida', entry: null });

  const [editingCategory, setEditingCategory] = useState(null);
  const [editingSubcategory, setEditingSubcategory] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileTheme, setProfileTheme] = useState("default");
  
  const [editingAccount, setEditingAccount] = useState(null);
  
  const [chartType, setChartType] = useState('line');


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
    if (config.name) setProfileName(config.name);
    if (config.theme) setProfileTheme(config.theme);
  }, [config]);

  useEffect(() => {
    if (data.categorias.length > 0) {
      setActiveMetrics(["Resultado", "Entradas", "Saidas", "Saldo Total Atual"]);
    } else {
      setActiveMetrics(["Resultado", "Entradas", "Saidas", "Saldo Total Atual"]);
    }
  }, [data.categorias]);


  const kpis = useMemo(() => computeKpisForRange(data, config.dateRange), [data, config.dateRange]);
  const series = useMemo(() => buildSeriesForRange(data, config.dateRange), [data, config.dateRange]);
  
  const summaryData = useMemo(() => {
    return activeMetrics.map(metric => ({
        name: metric,
        value: kpis[metric] || 0
    }));
  }, [activeMetrics, kpis]);

  const animatedTotalBalance = useCountUp(kpis["Saldo Total Atual"], 1500);

  const metricOptions = useMemo(() => {
    const baseMetrics = ["Entradas", "Saidas", "Resultado", "Saldo Total Atual"];
    const categoryMetrics = data.categorias.map(cat => ({
      name: cat.name,
      subcategories: data.subcategorias
        .filter(sub => sub.categoryId === cat.id)
        .map(sub => ({ name: sub.name, fullName: getSubcatMetricName(cat.name, sub.name) }))
    }));
    return [...baseMetrics, ...categoryMetrics];
  }, [data.categorias, data.subcategorias]);

  const metricColors = useMemo(() => {
    const colors = { ...METRIC_COLORS };
    data.categorias.forEach(c => {
      if (!colors[c.name]) {
        colors[c.name] = generateColor(c.name);
      }
      const subs = data.subcategorias.filter(s => s.categoryId === c.id);
      subs.forEach(s => {
          const subcatMetricName = getSubcatMetricName(c.name, s.name);
          if(!colors[subcatMetricName]) {
              colors[subcatMetricName] = generateColor(subcatMetricName);
          }
      });
    });
    activeMetrics.forEach(metric => {
        if (!colors[metric]) {
            colors[metric] = generateColor(metric);
        }
    })
    return colors;
  }, [data.categorias, data.subcategorias, activeMetrics]);


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
        (accountName(data, e.accountId) || "").toLowerCase().includes(q) || 
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
  
  const handleFilterCategoryChange = (categoryId) => {
    setFilterCat(categoryId);
    setFilterSub(""); 
  };

  const handleOpenEditProfile = () => {
    setProfileName(config.name || "");
    setProfileTheme(config.theme || "default");
    setEditingProfile(true);
  };

  const saveProfile = () => {
    setConfig(c => ({...c, name: profileName, theme: profileTheme }));
    setEditingProfile(false);
    showToast("Perfil atualizado com sucesso!", "success");
  };

  const handleOpenEntryModal = (type, entry = null) => {
    setEntryModal({ show: true, type, entry });
  };

  const handleCloseEntryModal = () => {
    setEntryModal({ show: false, type: 'saida', entry: null });
  };
  
  const handleSaveEntry = async (entryData, installments) => {
    try {
      if (entryData.id && installments <= 1) { // Simple update
        await service.updateEntry(entryData.id, entryData);
        showToast("Lançamento atualizado!", "success");
      } else { // New entry or recurring entry
        const batch = [];
        const originalDescription = entryData.description || "";
        for (let i = 0; i < installments; i++) {
          const newDate = new Date(entryData.date);
          newDate.setMonth(newDate.getMonth() + i);
  
          const newEntry = {
            ...entryData,
            id: uid(),
            date: format(newDate, 'yyyy-MM-dd'),
            yearMonth: format(newDate, 'yyyy-MM'),
            description: installments > 1 ? `${originalDescription} (${i + 1}/${installments})` : originalDescription,
            status: i === 0 && entryData.status === 'paid' ? 'paid' : 'pending',
          };
          batch.push(newEntry);
        }
        await service.addBatchEntries(batch);
        showToast(installments > 1 ? "Lançamentos parcelados criados!" : "Lançamento adicionado!", "success");
      }
      handleCloseEntryModal();
    } catch (error) {
        console.error("Failed to save entry:", error);
        showToast("Erro ao salvar lançamento.", "error");
    }
  };
  
  const handleToggleEntryStatus = async (entry) => {
    const newStatus = entry.status === 'paid' ? 'pending' : 'paid';
    await service.updateEntry(entry.id, { ...entry, status: newStatus });
    showToast(`Status alterado para ${newStatus === 'paid' ? 'pago' : 'pendente'}`, "success");
  };

  const askDeleteEntry = (id) => setModal({ 
    show: true,
    type: "confirm", 
    payload: { 
      title: "Excluir lançamento", 
      message: "Tem certeza?", 
      onConfirm: async () => { 
        await service.deleteEntry(id);
        setModal({ type: null, payload: null, show: false }); 
        showToast("Lançamento excluído!", "success"); 
      } 
    } 
  });
  
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
      show: true,
      type: "confirm", 
      payload: { 
        title: "Excluir Categoria", 
        message: `Tem certeza que deseja excluir a categoria "${catName(data, catId)}"?`, 
        onConfirm: async () => {
          await service.deleteCategoria(catId);
          setModal({ type: null, payload: null, show: false });
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
      show: true,
      type: "confirm", 
      payload: { 
        title: "Excluir Subcategoria", 
        message: `Tem certeza que deseja excluir a subcategoria "${subName(data, subId)}"?`, 
        onConfirm: async () => {
          await service.deleteSubcategoria(subId);
          setModal({ type: null, payload: null, show: false });
          showToast("Subcategoria excluída!", "success");
        }
      }
    });
  };

  // --- CRUD Accounts ---
    const saveAccount = async () => {
        if (!editingAccount.name || editingAccount.initialBalance === '') {
            showToast("Preencha nome e saldo inicial.", "error");
            return;
        }
        const accData = { ...editingAccount, initialBalance: Number(editingAccount.initialBalance) };
        if (accData.id) { // Update
            await service.updateAccount(accData.id, accData);
            showToast("Conta atualizada!", "success");
        } else { // Create
            accData.id = uid();
            await service.addAccount(accData);
            showToast("Conta criada!", "success");
        }
        setEditingAccount(null);
    };

    const askDeleteAccount = (accId) => {
        const ents = data.entries.filter(e => e.accountId === accId);
        if (ents.length > 0) {
            return showToast(`Não é possível excluir: Há ${ents.length} lançamentos associados a esta conta.`, "error", 4000);
        }
        setModal({
            show: true,
            type: "confirm",
            payload: {
                title: "Excluir Conta",
                message: `Tem certeza que deseja excluir a conta "${accountName(data, accId)}"?`,
                onConfirm: async () => {
                    await service.deleteAccount(accId);
                    setModal({ type: null, payload: null, show: false });
                    showToast("Conta excluída!", "success");
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
        const pdf = new jsPDF();

        // Header
        pdf.setFontSize(18);
        pdf.text("Relatório Financeiro", 14, 22);
        pdf.setFontSize(11);
        pdf.text(config.name || "Gateway Financeiro", 14, 28);
        
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
        pdf.text(`Saldo Total: ${fmtBRL(kpis["Saldo Total Atual"])}`, 100, kpiY + 7);

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
          const acc = accountById(data, e.accountId);
          const signedValue = groupSign(cat?.group) * (e.value || 0);
          return [
            new Date(e.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
            acc?.name || '',
            cat?.name || '',
            sub?.name || '',
            e.description || '',
            fmtBRL(signedValue)
          ];
        });
        
        const autoTable = (await import('jspdf-autotable')).default;

        autoTable(pdf, {
            startY: kpiY + 25 + imgHeight + 10,
            head: [['Data', 'Conta', 'Categoria', 'Subcategoria', 'Descrição', 'Valor']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [41, 128, 185] }, // Blue header
            didParseCell: function(data) {
                // Color rows based on value
                if (data.column.dataKey === 5) { // 'Valor' column
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

  const THEMES = {
    default: {
      hero: "bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-900 text-white",
      root: "bg-gradient-to-b from-slate-50 to-white text-slate-900",
    },
    sunset: {
      hero: "bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 text-white",
      root: "bg-gradient-to-b from-yellow-50 to-orange-50 text-slate-900",
    },
    ocean: {
      hero: "bg-gradient-to-r from-cyan-500 via-blue-600 to-teal-500 text-white",
      root: "bg-gradient-to-b from-cyan-50 to-blue-50 text-slate-900",
    },
    emerald: {
      hero: "bg-gradient-to-r from-emerald-500 via-green-600 to-lime-500 text-white",
      root: "bg-gradient-to-b from-emerald-50 to-green-50 text-slate-900",
    },
    purple: {
      hero: "bg-gradient-to-r from-purple-500 via-indigo-600 to-violet-500 text-white",
      root: "bg-gradient-to-b from-purple-50 to-indigo-50 text-slate-900",
    },
  };

  const currentTheme = THEMES[config.theme] || THEMES.default;

  if (loading || !user) {
    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50">
            <Spinner className="w-10 h-10" />
        </div>
    );
  }

  return (
    <div className={`min-h-screen ${currentTheme.root}`}>
      <Toast toast={toast} onHide={() => setToast(null)} />
      
      {/* Hero */}
      <div className={currentTheme.hero}>
        <div className="max-w-7xl mx-auto px-6 py-8">
          <p className="text-xs italic text-white/70 mb-2">Gestor Financeiro App V3.0</p>
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">{config.name || "Gateway Financeiro"}</h1>
                <p className="text-sm/6 text-white/70">Dashboard de finanças inteligente: visualize, filtre e exporte com praticidade.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <DatePickerWithPresets 
                date={config.dateRange}
                onDateChange={(range) => setConfig(c => ({...c, dateRange: range}))}
              />
              <div className="hidden md:block w-px h-6 bg-white/20" />
              <Button variant="outline" className="bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white" onClick={handleOpenEditProfile}>
                  <UserIcon /> Perfil
              </Button>
              <Button variant="outline" className="bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white" onClick={() => setConfig((c) => ({ ...c, privacy: !c.privacy }))}>
                {config.privacy ? <EyeOff /> : <Eye />}
              </Button>
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
            <div className="text-center mb-6">
                <h2 className="text-sm text-slate-500">Saldo atual em contas</h2>
                <p className={`text-4xl font-bold tracking-tight text-slate-900 ${config.privacy ? 'blur-sm' : ''}`}>{fmtBRL(animatedTotalBalance)}</p>
            </div>
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

          <div className="relative">
             <div className="absolute top-0 right-0 z-10 flex gap-1 p-1 bg-slate-100 rounded-md">
                <Button variant={chartType === 'line' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setChartType('line')}><LineChartIcon className="h-4 w-4" /></Button>
                <Button variant={chartType === 'bar' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setChartType('bar')}><BarChart3 className="h-4 w-4" /></Button>
                <Button variant={chartType === 'pie' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setChartType('pie')}><PieChartIcon className="h-4 w-4" /></Button>
            </div>
            <div ref={chartRef} className={`w-full h-72 ${config.privacy ? 'blur-sm' : ''}`}>
                <ResponsiveContainer width="100%" height="100%">
                {chartType === 'line' && (
                    <RechartsLineChart data={series} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis tickFormatter={(v) => fmtBRL(v)} />
                        <Tooltip formatter={(v) => fmtBRL(v)} />
                        <Legend />
                        {Array.from(new Set(activeMetrics)).map(metric => (
                        <Line key={metric} type="monotone" dataKey={metric} stroke={metricColors[metric]} strokeWidth={2} dot={false} />
                        ))}
                    </RechartsLineChart>
                )}
                {chartType === 'bar' && (
                    <BarChart data={summaryData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis tickFormatter={(v) => fmtBRL(v)}/>
                        <Tooltip formatter={(v) => fmtBRL(v)} />
                        <Bar dataKey="value">
                            {summaryData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={metricColors[entry.name]} />
                            ))}
                        </Bar>
                    </BarChart>
                )}
                {chartType === 'pie' && (
                    <PieChart>
                         <Tooltip formatter={(value, name) => [fmtBRL(value), name]} />
                         <Legend />
                         <Pie
                            data={summaryData.filter(d => d.value > 0)} // Pie chart cannot represent negative values well
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            fill="#8884d8"
                            label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                         >
                           {summaryData.filter(d => d.value > 0).map((entry) => (
                                <Cell key={entry.name} fill={metricColors[entry.name]} />
                            ))}
                         </Pie>
                    </PieChart>
                )}
                </ResponsiveContainer>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <section className="bg-white text-slate-900 rounded-2xl shadow-sm border border-gray-100 p-4 lg:col-span-2">
            <h2 className="font-semibold tracking-tight mb-4">Lançamentos</h2>
              <div className="flex justify-end gap-2 mb-4">
                  <Button onClick={() => handleOpenEntryModal('entrada')} className="bg-emerald-500 hover:bg-emerald-600 text-white">
                      <ArrowUp className="mr-2 h-4 w-4" /> Nova Receita
                  </Button>
                  <Button onClick={() => handleOpenEntryModal('saida')} className="bg-red-500 hover:bg-red-600 text-white">
                      <ArrowDown className="mr-2 h-4 w-4" /> Nova Despesa
                  </Button>
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
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3"><SortHeader label="Data" col="date" sort={sort} onToggle={toggleSort} /></th>
                    <th className="py-2 pr-3"><SortHeader label="Conta" col="account" sort={sort} onToggle={toggleSort} /></th>
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
                    const acc = accountById(data, e.accountId);
                    const signed = groupSign(cat?.group) * (e.value || 0);
                    return (
                      <tr key={e.id} className="border-t">
                        <td className="py-2 pr-3">
                           <Button 
                              variant="ghost" 
                              size="icon" 
                              title={e.status === 'paid' ? 'Marcado como pago' : 'Marcar como pago'}
                              onClick={() => handleToggleEntryStatus(e)}
                            >
                              {e.status === 'paid' ? <CheckCircle2 className="text-emerald-500" /> : <Circle className="text-slate-400" />}
                            </Button>
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">{new Date(e.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
                        <td className="py-2 pr-3">{acc?.name || ""}</td>
                        <td className="py-2 pr-3">{cat?.name || ""}</td>
                        <td className="py-2 pr-3">{sub?.name || ""}</td>
                        <td className="py-2 pr-3">{e.description}</td>
                        <td className={`py-2 pr-3 text-right ${signed < 0 ? "text-red-600" : "text-emerald-700"} ${config.privacy ? 'blur-sm' : ''}`}>{fmtBRL(signed)}</td>
                        <td className="py-2 flex items-center gap-2">
                          <Button variant="outline" size="icon" title="Editar" onClick={() => handleOpenEntryModal(cat.group, e)}>
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

          <aside className="space-y-8">
            <section className="bg-white text-slate-900 rounded-2xl shadow-sm border border-gray-100">
               <Accordion type="single" collapsible className="w-full" defaultValue="item-1">
                <AccordionItem value="item-1">
                    <AccordionTrigger className="px-4 py-3 font-semibold hover:no-underline">
                        <div className="flex items-center gap-2">
                            <Wallet className="h-4 w-4" /> Contas
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold">Suas Contas</h3>
                            <Button variant="ghost" size="sm" onClick={() => setEditingAccount({ name: '', initialBalance: 0 })}><PlusCircle className="mr-2 h-4 w-4" /> Nova</Button>
                        </div>
                        <ul className="space-y-2 text-sm">
                            {data.accounts.map((acc) => {
                               const accountBalance = (Number(acc.initialBalance) || 0) + data.entries
                                 .filter(e => e.accountId === acc.id && e.status === 'paid')
                                 .reduce((total, entry) => {
                                   const cat = categoryById(data, entry.categoryId);
                                   return total + (Number(entry.value) * groupSign(cat?.group));
                                 }, 0);

                                return (
                                  <li key={acc.id} className="flex items-center justify-between gap-2 p-1 rounded-md hover:bg-slate-50">
                                      <div>
                                          <span className="font-medium">{acc.name}</span>
                                          <span className={`block text-xs ${config.privacy ? 'blur-sm' : ''}`}>{fmtBRL(accountBalance)}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                          <Button variant="ghost" size="icon" className="h-6 w-6" title="Editar Conta" onClick={() => setEditingAccount({ ...acc })}><Pencil className="h-3 w-3" /></Button>
                                          <Button variant="ghost" size="icon" className="h-6 w-6" title="Excluir Conta" onClick={() => askDeleteAccount(acc.id)}><Trash className="h-3 w-3" /></Button>
                                      </div>
                                  </li>
                                )
                            })}
                        </ul>
                        {data.accounts.length === 0 && <p className="text-xs text-slate-500 text-center py-4">Nenhuma conta cadastrada.</p>}
                    </AccordionContent>
                </AccordionItem>
                </Accordion>
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
          </aside>
        </div>
      </main>

      {/* Modais */}
      {entryModal.show && (
         <EntryModal 
            show={entryModal.show}
            type={entryModal.type}
            entry={entryModal.entry}
            onClose={handleCloseEntryModal}
            onSave={handleSaveEntry}
            accounts={data.accounts}
            categories={data.categorias.filter(c => c.group === entryModal.type)}
            subcategories={data.subcategorias}
         />
      )}

      <Modal title={modal.payload?.title || "Confirmar"} show={modal.show && modal.type === 'confirm'} onClose={() => setModal({ ...modal, show: false })}>
        <p className="text-slate-700 mb-4">{modal.payload?.message || "Tem certeza?"}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setModal({ ...modal, show: false })}>Cancelar</Button>
          <Button variant="destructive" onClick={() => modal.payload?.onConfirm?.()}>Confirmar</Button>
        </div>
      </Modal>

      {editingCategory && (
        <Modal title={editingCategory.id ? "Editar Categoria" : "Nova Categoria"} show={!!editingCategory} onClose={() => setEditingCategory(null)}>
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
      
       {editingAccount && (
            <Modal title={editingAccount.id ? "Editar Conta" : "Nova Conta"} show={!!editingAccount} onClose={() => setEditingAccount(null)}>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-slate-500">Nome da Conta</label>
                        <input className="w-full border rounded-lg px-3 py-2" value={editingAccount.name} onChange={(e) => setEditingAccount(c => ({ ...c, name: e.target.value }))} />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500">Saldo Inicial</label>
                        <input type="number" step="0.01" className="w-full border rounded-lg px-3 py-2" value={editingAccount.initialBalance} onChange={(e) => setEditingAccount(c => ({ ...c, initialBalance: e.target.value }))} />
                    </div>
                    <div className="flex justify-end gap-2 mt-2">
                        <Button variant="outline" onClick={() => setEditingAccount(null)}>Cancelar</Button>
                        <Button onClick={saveAccount}>Salvar</Button>
                    </div>
                </div>
            </Modal>
        )}

      {editingSubcategory && (
        <Modal title={editingSubcategory.id ? "Editar Subcategoria" : "Nova Subcategoria"} show={!!editingSubcategory} onClose={() => setEditingSubcategory(null)}>
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

      {editingProfile && (
        <Modal title="Editar Perfil" show={editingProfile} onClose={() => setEditingProfile(false)}>
            <div className="space-y-4">
                <div>
                    <label className="text-xs text-slate-500">Nome do Perfil</label>
                    <input 
                        className="w-full border rounded-lg px-3 py-2" 
                        value={profileName} 
                        onChange={(e) => setProfileName(e.target.value)} 
                        placeholder="Ex: Minha Empresa, Finanças Pessoais"
                    />
                </div>
                 <div>
                    <label className="text-xs text-slate-500">Tema</label>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      {Object.entries(THEMES).map(([key, theme]) => (
                        <div key={key} onClick={() => setProfileTheme(key)} className={cn("h-12 rounded-lg cursor-pointer flex items-center justify-center border-2", profileTheme === key ? 'border-blue-500' : 'border-transparent')}>
                          <div className={cn("w-10 h-8 rounded-md", theme.hero)}></div>
                        </div>
                      ))}
                    </div>
                </div>
                <div className="flex justify-end gap-2 mt-2">
                    <Button variant="outline" onClick={() => setEditingProfile(false)}>Cancelar</Button>
                    <Button onClick={saveProfile}>Salvar</Button>
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


function EntryModal({ show, type, entry, onClose, onSave, accounts, categories, subcategories }) {
  const [form, setForm] = useState({
      value: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      accountId: '',
      categoryId: '',
      subcategoryId: '',
      description: '',
      status: 'paid',
  });
  const [repeat, setRepeat] = useState(false);
  const [installments, setInstallments] = useState(1);

  useEffect(() => {
    if (entry) {
        setForm({
            ...entry,
            value: entry.value.toString(),
        });
    } else {
        const defaultCategory = categories[0]?.id || '';
        const defaultAccount = accounts[0]?.id || '';
        setForm({
            value: '',
            date: format(new Date(), 'yyyy-MM-dd'),
            accountId: defaultAccount,
            categoryId: defaultCategory,
            subcategoryId: '',
            description: '',
            status: type === 'entrada' ? 'paid' : 'pending',
        });
    }
  }, [entry, show, categories, accounts, type]);


  const handleCategoryChange = (catId) => {
    setForm(f => ({ ...f, categoryId: catId, subcategoryId: '' }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.value || !form.accountId || !form.categoryId) {
        // Simple validation
        alert("Valor, Conta e Categoria são obrigatórios.");
        return;
    }
    const dataToSave = {
        ...form,
        value: parseFloat(form.value),
        group: type,
        id: entry?.id // Keep id if editing
    };
    onSave(dataToSave, entry ? 1 : installments);
  };
  
  const subOptions = useMemo(() => {
    if (!form.categoryId) return [];
    return subcategories.filter(s => s.categoryId === form.categoryId);
  }, [form.categoryId, subcategories]);

  const title = entry ? `Editar ${type === 'entrada' ? 'Receita' : 'Despesa'}` : `Nova ${type === 'entrada' ? 'Receita' : 'Despesa'}`;

  return (
    <Modal show={show} onClose={onClose} title={title}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="text-center">
                <span className={`text-sm ${type === 'entrada' ? 'text-emerald-500' : 'text-red-500'}`}>
                    Valor da {type === 'entrada' ? 'Receita' : 'Despesa'}
                </span>
                <input
                    type="number"
                    step="0.01"
                    placeholder="R$ 0,00"
                    className={`w-full text-center bg-transparent border-none text-4xl font-bold focus:ring-0 ${type === 'entrada' ? 'text-emerald-500' : 'text-red-500'}`}
                    value={form.value}
                    onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                />
            </div>
            
            <div className="flex items-center justify-between p-2 bg-slate-100 rounded-lg">
                <label className="font-medium">{type === 'entrada' ? 'Recebido' : 'Pago'}</label>
                 <Switch checked={form.status === 'paid'} onCheckedChange={(checked) => setForm(f => ({...f, status: checked ? 'paid' : 'pending'}))} />
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium">Data</label>
                <div className="grid grid-cols-3 gap-2">
                    <Button type="button" variant={form.date === format(new Date(), 'yyyy-MM-dd') ? 'secondary' : 'outline'} onClick={() => setForm(f => ({...f, date: format(new Date(), 'yyyy-MM-dd')}))}>Hoje</Button>
                    <Button type="button" variant={form.date === format(subDays(new Date(), 1), 'yyyy-MM-dd') ? 'secondary' : 'outline'} onClick={() => setForm(f => ({...f, date: format(subDays(new Date(), 1), 'yyyy-MM-dd')}))}>Ontem</Button>
                    <input type="date" className="border rounded-lg px-3 py-2" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} />
                </div>
            </div>
            
            <div className="space-y-2">
                <label className="text-sm font-medium">Descrição</label>
                <input className="w-full border rounded-lg px-3 py-2" placeholder="Ex: Salário, Aluguel" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))}/>
            </div>
            
            <div className="space-y-2">
                 <label className="text-sm font-medium">Categoria</label>
                 <select className="w-full border rounded-lg px-3 py-2" value={form.categoryId} onChange={e => handleCategoryChange(e.target.value)}>
                    <option value="">Selecione...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                 </select>
                 {subOptions.length > 0 && (
                     <select className="w-full border rounded-lg px-3 py-2 mt-2" value={form.subcategoryId} onChange={e => setForm(f => ({...f, subcategoryId: e.target.value}))}>
                         <option value="">Selecione subcategoria...</option>
                         {subOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                     </select>
                 )}
            </div>

             <div className="space-y-2">
                <label className="text-sm font-medium">Conta</label>
                 <select className="w-full border rounded-lg px-3 py-2" value={form.accountId} onChange={e => setForm(f => ({...f, accountId: e.target.value}))}>
                     {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                 </select>
            </div>
            
            {!entry && (
                 <div className="flex items-center justify-between p-2 bg-slate-100 rounded-lg">
                    <label className="font-medium">Repetir / Parcelar</label>
                     <Switch checked={repeat} onCheckedChange={setRepeat} />
                </div>
            )}

            {repeat && !entry && (
                 <div className="space-y-2">
                     <label className="text-sm font-medium">Número de Parcelas</label>
                     <input type="number" min="2" max="120" className="w-full border rounded-lg px-3 py-2" value={installments} onChange={e => setInstallments(parseInt(e.target.value, 10))} />
                 </div>
            )}
            
            <div className="flex justify-end gap-2 mt-4">
                <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
                <Button type="submit">Salvar</Button>
            </div>
        </form>
    </Modal>
  )
}

