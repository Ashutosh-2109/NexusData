'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Activity, BarChart3, ChevronLeft, Database, GitBranch, Home, Map, Moon, Search, Sun, Waypoints } from 'lucide-react';

const NAV = [
  { label: 'Overview', href: '/', icon: Home },
  { label: 'Live India Map', href: '/#live-map', icon: Map },
  { label: 'Maharashtra', href: '/maharashtra', icon: Activity },
  { label: 'Relationships', href: '/#relationships', icon: GitBranch },
  { label: 'Insight Graph', href: '/#insight-graph', icon: Waypoints },
  { label: 'Data Catalog', href: '/#data-catalog', icon: Database },
  { label: 'Data Quality & Lineage', href: '/#data-quality', icon: BarChart3 },
  { label: 'Present', href: '/maharashtra#present', icon: BarChart3 },
];
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [dark, setDark] = useState(true);
  const results = useMemo(() => NAV.filter(item => item.label.toLowerCase().includes(search.toLowerCase())), [search]);
  return <div className={`app-shell${collapsed ? ' is-collapsed' : ''}${dark ? ' theme-dark' : ''}`}>
    <aside className="app-sidebar"><Link href="/" className="app-brand"><span className="app-brand-mark">N</span>{!collapsed&&<span>NexusData<small>INSIGHT PLATFORM</small></span>}</Link><nav aria-label="Main navigation">{NAV.map(item=>{const Icon=item.icon;return <Link key={item.label} href={item.href} className={pathname===item.href?'is-active':''} title={collapsed?item.label:undefined}><Icon size={18}/>{!collapsed&&<span>{item.label}</span>}</Link>;})}</nav><button className="sidebar-collapse" type="button" onClick={()=>setCollapsed(!collapsed)} aria-label={collapsed?'Expand navigation':'Collapse navigation'}><ChevronLeft size={17}/>{!collapsed&&'Collapse'}</button></aside>
    <div className="app-main-column"><header className="app-topbar"><div className="app-crumb"><span>Workspace</span><b>/</b><strong>{NAV.find(item=>item.href===pathname)?.label??(pathname==='/maharashtra'?'Maharashtra':'Overview')}</strong></div><label className="global-search"><Search size={15}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search pages and data…" aria-label="Global search"/>{search&&<div className="global-search-results">{results.map(item=><Link key={item.label} href={item.href} onClick={()=>setSearch('')}>{item.label}</Link>)}</div>}</label><button className="theme-switch" type="button" onClick={()=>setDark(!dark)} aria-label={`Switch to ${dark?'light':'dark'} theme`}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button></header><div className="app-page-content">{children}</div></div>
  </div>;
}

