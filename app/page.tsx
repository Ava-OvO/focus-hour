'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient, type User } from '@supabase/supabase-js';

type Task = { id: string; user_id: string; title: string; planned_date: string; estimated_minutes: number; position: number; created_at: string };
type Step = { id: string; task_id: string; user_id: string; title: string; estimated_minutes: number; position: number; completed_at: string | null; created_at: string };
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const db = url && key ? createClient(url, key) : null;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState(30);
  const [stepDrafts, setStepDrafts] = useState<Record<string,string>>({});
  const [stepMinutes, setStepMinutes] = useState<Record<string,number>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'hour'|'plan'>('hour');
  const [date, setDate] = useState(today);

  const load = useCallback(async (uid: string, day: string) => {
    if (!db) return;
    const [a,b] = await Promise.all([
      db.from('tasks').select('*').eq('user_id',uid).eq('planned_date',day).order('position').order('created_at'),
      db.from('steps').select('*').eq('user_id',uid).order('position').order('created_at'),
    ]);
    if (a.error || b.error) { setMessage(a.error?.message || b.error?.message || '读取失败'); return; }
    setTasks((a.data || []) as Task[]);
    setSteps((b.data || []) as Step[]);
  }, []);

  useEffect(() => {
    if (!db) { setReady(true); return; }
    db.auth.getUser().then(({data}) => { setUser(data.user); setReady(true); });
    const {data: listener} = db.auth.onAuthStateChange((_event,session) => { setUser(session?.user ?? null); });
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (user) void load(user.id,date); else { setTasks([]); setSteps([]); } }, [user,date,load]);
  useEffect(() => {
    if (!user || !db) return;
    const channel = db.channel(`focus-hour-${user.id}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'tasks',filter:`user_id=eq.${user.id}`},()=>void load(user.id,date))
      .on('postgres_changes',{event:'*',schema:'public',table:'steps',filter:`user_id=eq.${user.id}`},()=>void load(user.id,date))
      .subscribe();
    const onFocus = () => void load(user.id,date);
    window.addEventListener('focus',onFocus);
    return () => { db?.removeChannel(channel); window.removeEventListener('focus',onFocus); };
  }, [user,date,load]);

  const taskIds = useMemo(() => new Set(tasks.map(t=>t.id)),[tasks]);
  const daySteps = useMemo(() => steps.filter(s=>taskIds.has(s.task_id)),[steps,taskIds]);
  const ordered = useMemo(() => tasks.flatMap(t=>daySteps.filter(s=>s.task_id===t.id)),[tasks,daySteps]);
  const remaining = ordered.filter(s=>!s.completed_at);
  const hour: Step[] = [];
  let used = 0;
  for (const s of remaining) { if (hour.length && used+s.estimated_minutes>60) break; hour.push(s); used+=s.estimated_minutes; if (used>=60) break; }
  const done = daySteps.filter(s=>s.completed_at).length;
  const points = done*10;
  const progress = daySteps.length ? Math.round(done/daySteps.length*100) : 0;
  const taskName = (id:string) => tasks.find(t=>t.id===id)?.title || '';
  const act = async (fn:()=>Promise<{error: {message:string}|null}>) => { setBusy(true); setMessage(''); const result=await fn(); if (result.error) setMessage(result.error.message); else if(user) await load(user.id,date); setBusy(false); };

  async function addTask(e: React.FormEvent) {
    e.preventDefault(); if (!db || !user || !title.trim()) return;
    await act(async()=> {
      const r=await db!.from('tasks').insert({user_id:user.id,title:title.trim(),planned_date:date,estimated_minutes:minutes,position:tasks.length}).select('id').single();
      if (!r.error) { setTitle(''); setMinutes(30); setTab('plan'); }
      return r;
    });
  }
  async function addStep(taskId:string) {
    const name=stepDrafts[taskId]?.trim(); if (!db || !user || !name) return;
    const mins=stepMinutes[taskId]||10;
    await act(async()=> { const r=await db!.from('steps').insert({user_id:user.id,task_id:taskId,title:name,estimated_minutes:mins,position:daySteps.filter(s=>s.task_id===taskId).length}); if(!r.error) setStepDrafts(v=>({...v,[taskId]:''})); return r; });
  }
  async function toggleStep(s:Step) { if (!db) return; await act(async()=>await db!.from('steps').update({completed_at:s.completed_at?null:new Date().toISOString()}).eq('id',s.id)); }
  async function deleteTask(id:string) { if (!db || !window.confirm('删除这个任务及其所有步骤？')) return; await act(async()=>await db!.from('tasks').delete().eq('id',id)); }
  async function deleteStep(id:string) { if (!db) return; await act(async()=>await db!.from('steps').delete().eq('id',id)); }
  async function signIn(e:React.FormEvent) { e.preventDefault(); if(!db) return; setBusy(true); const {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.origin}}); setBusy(false); if(error) setMessage(error.message); else setSent(true); }

  if (!db) return <main className="setup"><div className="setup-card"><div className="brand-mark">◷</div><h1>Focus Hour</h1><p>请先配置 Supabase 环境变量，再启动应用。</p><code>NEXT_PUBLIC_SUPABASE_URL<br/>NEXT_PUBLIC_SUPABASE_ANON_KEY</code><p>配置方法见 README.md。</p></div></main>;
  if (!ready) return <main className="setup"><div className="setup-card">正在打开 Focus Hour…</div></main>;
  if (!user) return <main className="login"><div className="login-art"><div className="brand"><span className="brand-mark">◷</span> Focus Hour</div><div className="login-copy"><span className="eyebrow">把今天过轻一点</span><h1>专注眼前的<br/><em>这一小时。</em></h1><p>把大计划拆成小动作。每完成一步，都值得被看见。</p><div className="login-stats"><span>01 <small>只看眼前</small></span><span>02 <small>一步一步来</small></span><span>03 <small>积累成就</small></span></div></div><div className="orb orb-one"/><div className="orb orb-two"/></div><div className="login-panel"><div className="login-box"><span className="eyebrow">欢迎回来</span><h2>开始你的 Focus Hour</h2><p>用邮箱登录，MacBook 和 iPhone 会使用同一份计划。</p><form onSubmit={signIn}><label htmlFor="email">邮箱地址</label><input id="email" type="email" required placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/><button className="primary" disabled={busy}>{busy?'发送中…':'发送登录链接 →'}</button></form>{sent&&<div className="notice">登录链接已发送。请在邮箱中打开链接。</div>}{message&&<div className="error">{message}</div>}<div className="login-foot">无需密码 · 数据只对你的账号可见</div></div></div></main>;

  return <div className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">◷</span> Focus Hour</div><div className="side-label">工作台</div><button className={tab==='hour'?'nav active':'nav'} onClick={()=>setTab('hour')}><span>◴</span> 下一小时</button><button className={tab==='plan'?'nav active':'nav'} onClick={()=>setTab('plan')}><span>▤</span> 今日计划</button><div className="side-spacer"/><div className="side-tip"><span>✦ 小小提醒</span><p>不需要完成所有事。先完成眼前的这一步。</p></div><button className="account" onClick={()=>db.auth.signOut()}><span className="avatar">{user.email?.[0]?.toUpperCase()}</span><span className="account-copy"><strong>我的账号</strong><small>{user.email}</small></span><span>↗</span></button></aside>
    <main className="main"><header className="topbar"><div className="mobile-brand"><span className="brand-mark">◷</span> Focus Hour</div><div className="top-date">{new Date(`${date}T12:00:00`).toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'})}</div><div className="top-pill"><span className="dot"/> 已同步</div></header><div className="content"><section className="hero"><div><div className="eyebrow">YOUR FOCUS SPACE <span className="star">✳</span></div><h1>{tab==='hour'?'先专注这一小时。':'把今天拆成小步。'}</h1><p>{tab==='hour'?'其他事情先放一边，完成眼前的小步骤就好。':'想到要做的事就记下来，再把它拆成容易开始的动作。'}</p></div><div className="hero-sun">✳</div></section>
      <div className="dashboard-grid"><div className="primary-col"><div className="section-head"><div><span className="eyebrow">{tab==='hour'?'UP NEXT':'TODAY’S PLAN'}</span><h2>{tab==='hour'?'未来一小时':'今日任务'}</h2></div><input aria-label="选择日期" className="date-input" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
      {tab==='hour' ? <><div className="hour-summary"><div className="hour-icon">◷</div><div><strong>{hour.length ? `${hour.length} 个小步骤` : '从一个小步骤开始'}</strong><span>{hour.length?`预计 ${used} 分钟 · 按计划顺序显示`:'去今日计划添加任务与步骤'}</span></div><div className="hour-total">{used}<small> / 60 分钟</small></div></div><div className="step-list">{hour.length ? hour.map((s,i)=><button className="focus-step" disabled={busy} key={s.id} onClick={()=>toggleStep(s)}><span className="step-check"/><span className="step-content"><small>{String(i+1).padStart(2,'0')} · {taskName(s.task_id)}</small><strong>{s.title}</strong></span><span className="minute-pill">{s.estimated_minutes} 分钟</span></button>) : <div className="empty"><span>✦</span><h3>眼前还没有待做的步骤</h3><p>在今日计划里添加一个任务，并拆成几步。</p><button onClick={()=>setTab('plan')}>添加今日计划 →</button></div>}</div>{remaining.length>hour.length&&<p className="quiet-note">还有 {remaining.length-hour.length} 个步骤暂时收起，完成眼前的再看。</p>}</> : <><form className="add-task" onSubmit={addTask}><div className="form-top"><span className="plus">＋</span><div><strong>添加今天要做的事</strong><small>先记下来，再拆成能马上开始的小步骤</small></div></div><div className="form-row"><input aria-label="任务名称" required maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} placeholder="例如：准备周五的报告"/><div className="minutes-input"><input aria-label="预计分钟数" type="number" min={1} max={1440} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/><span>分钟</span></div><button className="primary" disabled={busy}>添加任务</button></div></form><div className="task-list">{tasks.length?tasks.map(t=><div className="task-card" key={t.id}><div className="task-head"><div><span className="task-dot"/><strong>{t.title}</strong><small>预计 {t.estimated_minutes} 分钟</small></div><button aria-label={`删除任务 ${t.title}`} className="icon-button" onClick={()=>deleteTask(t.id)}>×</button></div><div className="task-steps">{daySteps.filter(s=>s.task_id===t.id).map(s=><div className={s.completed_at?'task-step completed':'task-step'} key={s.id}><button aria-label={s.completed_at?'标记未完成':'完成步骤'} className="small-check" onClick={()=>toggleStep(s)}>{s.completed_at?'✓':''}</button><span>{s.title}</span><small>{s.estimated_minutes} 分钟</small><button className="icon-button" aria-label="删除步骤" onClick={()=>deleteStep(s.id)}>×</button></div>)}<form className="add-step" onSubmit={e=>{e.preventDefault();void addStep(t.id);}}><span>＋</span><input aria-label={`为${t.title}添加小步骤`} maxLength={120} required placeholder="添加一个小步骤，如：打开文档" value={stepDrafts[t.id]||''} onChange={e=>setStepDrafts(v=>({...v,[t.id]:e.target.value}))}/><input aria-label="步骤分钟数" className="step-minutes" type="number" min={1} max={60} value={stepMinutes[t.id]||10} onChange={e=>setStepMinutes(v=>({...v,[t.id]:Number(e.target.value)}))}/><span>分</span><button disabled={busy}>添加</button></form></div></div>):<div className="empty plan-empty"><span>☀</span><h3>今天是一张空白画布</h3><p>写下一件想完成的事，就从这里开始。</p></div>}</div></>}
      </div><aside className="right-col"><div className="reward-card"><div className="reward-top"><span>✦ 今日收获</span><span>每步 +10</span></div><div className="points">{points}<small>积分</small></div><p>已经完成 <strong>{done}</strong> 个小步骤。每一步都算数。</p><div className="sparkle">✳</div></div><div className="progress-card"><div className="card-head"><strong>今天的进度</strong><span>{progress}%</span></div><div className="progress-track"><div style={{width:`${progress}%`}}/></div><p>{done} / {daySteps.length} 个步骤完成</p></div><div className="thought-card"><span>给自己一点空间</span><p>“开始”不需要很大的勇气，<br/>只需要一个足够小的下一步。</p><div>— Focus Hour</div></div></aside></div></div><nav className="mobile-nav"><button className={tab==='hour'?'selected':''} onClick={()=>setTab('hour')}>◴<small>下一小时</small></button><button className={tab==='plan'?'selected':''} onClick={()=>setTab('plan')}>▤<small>今日计划</small></button></nav>{message&&<div className="toast" role="alert" onClick={()=>setMessage('')}>{message} ×</div>}</main></div>;
}
