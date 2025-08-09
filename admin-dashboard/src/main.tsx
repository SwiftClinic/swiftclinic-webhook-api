import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'

const BASE_DEFAULT = (import.meta as any).env?.VITE_API_BASE || 'https://swiftclinic-webhook-api-production.up.railway.app'

const colors = { primary: '#3FC5D4', secondary: '#E2E8F0', text: '#0f172a' }
const appStyle: React.CSSProperties = { fontFamily: 'Poppins, system-ui, sans-serif', color: colors.text, background: colors.secondary, minHeight: '100vh' }

function Badge({ text }:{ text:string }){ return <span style={{ background:colors.primary, color:'#0b132b', padding:'2px 8px', borderRadius:999, fontSize:12, fontWeight:700 }}>{text}</span> }

function Login({ baseUrl, onAuth }: { baseUrl: string; onAuth: (token: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  async function login(){
    if(!email||!password){ setStatus('Enter email and password'); return }
    setStatus('Logging in...')
    try{
      const res = await fetch(`${baseUrl}/admin/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password })})
      const data = await res.json(); if(!data.success){ setStatus(`Login failed: ${data.error||res.status}`); return }
      sessionStorage.setItem('adminToken', data.data.token); onAuth(data.data.token)
    }catch(e:any){ setStatus(`Login error: ${e.message}`) }
  }
  return (
    <div style={{ display:'grid', placeItems:'center', minHeight:'100vh', padding:24 }}>
      <div style={{ width: 420, background:'#fff', borderRadius:16, boxShadow:'0 12px 30px rgba(16,24,40,0.08)', padding:32 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
          <img src="https://i.imgur.com/5tByDtV.png" alt="SwiftClinic" style={{ height: 36 }} />
          <h2 style={{ margin:0 }}>SwiftClinic Admin</h2>
        </div>
        <p style={{ marginTop:0, color:'#475569' }}>Sign in to continue</p>
        <div style={{ display:'grid', gap:12 }}>
          <label>Email<input value={email} onChange={e=>setEmail(e.target.value)} style={{ width:'100%', padding:12, borderRadius:8, border:'1px solid #cbd5e1' }} /></label>
          <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={{ width:'100%', padding:12, borderRadius:8, border:'1px solid #cbd5e1' }} /></label>
          <button onClick={login} style={{ padding:'12px 16px', background: colors.primary, color:'#0b132b', border:'none', borderRadius:10, fontWeight:600 }}>Sign In</button>
          <div style={{ fontSize:12, color:'#6b7280', minHeight:18 }}>{status}</div>
        </div>
      </div>
    </div>
  )
}

function Sidebar({ tab, setTab, onLogout }:{ tab:string; setTab:(t:string)=>void; onLogout:()=>void }){
  const Item = ({ id, label }:{id:string;label:string}) => (
    <button onClick={()=>setTab(id)} style={{ width:'100%', textAlign:'left', padding:'10px 12px', margin:'4px 0', border:'none', borderRadius:8, background: tab===id? '#fff' : 'transparent', fontWeight:600 }}>{label}</button>
  )
  return (
    <aside style={{ width:260, padding:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
        <img src="https://i.imgur.com/5tByDtV.png" alt="SwiftClinic" style={{ height: 28 }} />
        <strong>Admin</strong>
      </div>
      <Item id="dashboard" label="Dashboard" />
      <Item id="onboard" label="Onboard Clinic" />
      <Item id="clinics" label="Clinics" />
      <Item id="activity" label="Activity" />
      <div style={{ marginTop:16 }}>
        <button onClick={onLogout} style={{ padding:'8px 12px', width:'100%', borderRadius:8 }}>Logout</button>
      </div>
    </aside>
  )
}

function Clinics({ baseUrl, token }:{ baseUrl:string; token:string }){
  const [rows, setRows] = useState<any[]>([])
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')
  const filtered = useMemo(()=> rows.filter(r=> (r.name||'').toLowerCase().includes(query.toLowerCase()) || (r.webhookUrl||'').includes(query)), [rows, query])
  async function load(){
    setStatus('Loading clinics...')
    const res = await fetch(`${baseUrl}/admin/clinics`, { headers: { Authorization:`Bearer ${token}` } })
    const data = await res.json()
    if (!data.success) { setStatus(`Load failed: ${data.error||res.status}`); return }
    setRows(data.data||[]); setStatus('')
  }
  useEffect(()=>{ load() },[])
  async function toggle(id:string){
    const res = await fetch(`${baseUrl}/admin/clinics/${id}/toggle`, { method:'POST', headers:{ Authorization:`Bearer ${token}` } })
    const data = await res.json(); if (!data.success){ setStatus(`Toggle failed: ${data.error||res.status}`); return }
    load()
  }
  const copy = async (txt:string)=>{ try{ await navigator.clipboard.writeText(txt); setStatus('Copied') }catch{} }
  return (
    <section style={{ background:'#fff', borderRadius:12, padding:16, boxShadow:'0 4px 14px rgba(2,8,20,0.05)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h3>Clinics <Badge text={`${rows.length}`} /></h3>
        <input placeholder="Search clinics" value={query} onChange={e=>setQuery(e.target.value)} style={{ padding:8, border:'1px solid #cbd5e1', borderRadius:8 }} />
      </div>
      <table style={{ width:'100%', borderCollapse:'collapse', marginTop:12 }}>
        <thead><tr style={{ textAlign:'left' }}><th>Name</th><th>Webhook</th><th>TZ</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {filtered.map(r=> (
            <tr key={r.id} style={{ borderTop:'1px solid #e5e7eb' }}>
              <td>{r.name}</td>
              <td>
                <code>{r.webhookUrl}</code>
                <button onClick={()=>copy(`${baseUrl}/webhook/${r.webhookUrl}`)} style={{ marginLeft:8, padding:'4px 8px' }}>Copy URL</button>
              </td>
              <td>{r.timezone||'-'}</td>
              <td>{r.isActive? 'Active':'Inactive'}</td>
              <td><button onClick={()=>toggle(r.id)} style={{ padding:'6px 10px' }}>{r.isActive? 'Deactivate':'Activate'}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop:8, fontSize:12, color:'#6b7280' }}>{status}</div>
    </section>
  )
}

function Activity({ baseUrl, token }:{ baseUrl:string; token:string }){
  const [rows, setRows] = useState<any[]>([])
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')
  const [since, setSince] = useState('')
  const filtered = useMemo(()=> rows.filter((r:any)=> {
    const text = `${r.event} ${r.details}`.toLowerCase();
    const matches = text.includes(query.toLowerCase());
    if (!since) return matches; return matches && new Date(r.created_at) >= new Date(since)
  }), [rows, query, since])
  async function load(){
    setStatus('Loading activity...')
    const res = await fetch(`${baseUrl}/admin/activity`, { headers: { Authorization:`Bearer ${token}` }})
    const data = await res.json(); if (!data.success){ setStatus(`Load failed: ${data.error||res.status}`); return }
    setRows(data.data||[]); setStatus('')
  }
  useEffect(()=>{ load() },[])
  return (
    <section style={{ background:'#fff', borderRadius:12, padding:16, boxShadow:'0 4px 14px rgba(2,8,20,0.05)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <h3>Activity <Badge text={`${rows.length}`} /></h3>
        <input placeholder="Search" value={query} onChange={e=>setQuery(e.target.value)} style={{ padding:8, border:'1px solid #cbd5e1', borderRadius:8 }} />
        <input type="date" value={since} onChange={e=>setSince(e.target.value)} style={{ padding:8, border:'1px solid #cbd5e1', borderRadius:8 }} />
      </div>
      <ul style={{ listStyle:'none', padding:0, margin:0 }}>
        {filtered.map((r:any)=> (
          <li key={r.id} style={{ borderTop:'1px solid #e5e7eb', padding:'8px 0' }}>
            <code>{new Date(r.created_at).toLocaleString()}</code> — <strong>{r.event}</strong> — <small>{r.details}</small>
          </li>
        ))}
      </ul>
      <div style={{ marginTop:8, fontSize:12, color:'#6b7280' }}>{status}</div>
    </section>
  )
}

function Onboard({ baseUrl, token }:{ baseUrl:string; token:string }){
  const [apiKey, setApiKey] = useState(localStorage.getItem('apiKey') || '')
  const [showKey, setShowKey] = useState(false)
  const [shard, setShard] = useState(localStorage.getItem('shard') || '')
  const [businesses, setBusinesses] = useState<any[]>([])
  const [selectedBusiness, setSelectedBusiness] = useState<any>(null)
  const [timezone, setTimezone] = useState(localStorage.getItem('timezone') || 'Europe/London')
  const [uuid, setUuid] = useState(localStorage.getItem('uuid') || '')
  const [status, setStatus] = useState('')

  useEffect(()=>{ localStorage.setItem('apiKey', apiKey) },[apiKey])
  useEffect(()=>{ localStorage.setItem('shard', shard) },[shard])
  useEffect(()=>{ localStorage.setItem('timezone', timezone) },[timezone])
  useEffect(()=>{ localStorage.setItem('uuid', uuid) },[uuid])

  async function detect(){
    setStatus('Detecting...')
    const res = await fetch(`${baseUrl}/admin/cliniko/detect`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ clinikApiKey: apiKey, shard: shard || undefined }) })
    const data = await res.json(); if(!data.success){ setStatus(`Detect failed: ${data.error||res.status}`); return }
    setShard(data.data.shard)
    setBusinesses(data.data.businesses || [])
    setStatus(`Detected shard ${data.data.shard}. Select business.`)
  }

  useEffect(()=>{ if (selectedBusiness) { setTimezone(selectedBusiness.iana || selectedBusiness.time_zone || 'UTC') }}, [selectedBusiness])

  async function register(){
    if (!uuid || !selectedBusiness) { setStatus('Generate UUID and select business'); return }
    setStatus('Registering clinic...')
    const res = await fetch(`${baseUrl}/register-clinic`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ uniqueWebhookId: uuid, clinicId:`clinic-${uuid}`, clinicName: 'SwiftClinic', apiConfiguration:{ clinikApiKey: apiKey, shard, businessId: selectedBusiness.id, timezone } }) })
    const data = await res.json(); if(!data.success){ setStatus(`Register failed: ${data.error||res.status}`); return }
    setStatus(`Registered. Webhook: ${baseUrl}/webhook/${uuid}`)
  }

  const generateUuid=()=> setUuid((globalThis.crypto && 'randomUUID' in globalThis.crypto)? globalThis.crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2,10)}-${Math.random().toString(16).slice(2,6)}`)

  return (
    <section style={{ background:'#fff', borderRadius:12, padding:16, boxShadow:'0 4px 14px rgba(2,8,20,0.05)' }}>
      <h3>Onboard Clinic</h3>
      <div style={{ display:'grid', gap:12 }}>
        <div>
          <label>API key:&nbsp;
            <input type={showKey ? 'text':'password'} value={apiKey} onChange={e=>setApiKey(e.target.value)} size={60} />
          </label>
          <button onClick={()=>setShowKey(s=>!s)} style={{ marginLeft:8, padding:'6px 10px' }}>{showKey ? 'Hide' : 'Show'}</button>
        </div>
        <label>Shard (optional):&nbsp;<input value={shard} onChange={e=>setShard(e.target.value)} placeholder="uk2/us1/au1/ca1" /></label>
        <button onClick={detect} style={{ padding:'10px 14px', background: colors.primary, border:'none', borderRadius:8, fontWeight:600 }}>Detect businesses</button>
        {businesses.length>0 && (
          <div>
            <p>{businesses.length} businesses found.</p>
            <select value={selectedBusiness?.id||''} onChange={e=> setSelectedBusiness(businesses.find(b=> String(b.id)===e.target.value))}>
              <option value="">Select business</option>
              {businesses.map((b:any)=> <option key={b.id} value={b.id}>{b.name} ({b.time_zone})</option>)}
            </select>
          </div>
        )}
        <div>
          <label>Timezone (auto):&nbsp;<input value={timezone} onChange={e=>setTimezone(e.target.value)} /></label>
        </div>
        <div>
          <label>Webhook UUID:&nbsp;<input value={uuid} onChange={e=>setUuid(e.target.value)} size={60} /></label>
          <button onClick={generateUuid} style={{marginLeft:8, padding:'8px 12px'}}>Generate UUID</button>
        </div>
        <button onClick={register} style={{ padding:'10px 14px', background: colors.primary, border:'none', borderRadius:8, fontWeight:600 }}>Register clinic</button>
      </div>
    </section>
  )
}

function Dashboard({ baseUrl }:{ baseUrl:string }){
  return (
    <section style={{ background:'#fff', borderRadius:12, padding:16, boxShadow:'0 4px 14px rgba(2,8,20,0.05)' }}>
      <h3>Welcome</h3>
      <p>Use Onboard Clinic to import from Cliniko and generate a webhook. Manage existing clinics under Clinics. Track actions under Activity.</p>
      <p>API Base: <code>{baseUrl}</code></p>
    </section>
  )
}

function App(){
  const [tab, setTab] = useState<'dashboard'|'onboard'|'clinics'|'activity'>('dashboard')
  const [token, setToken] = useState<string | null>(sessionStorage.getItem('adminToken'))
  const [baseUrl, setBaseUrl] = useState(localStorage.getItem('baseUrl') || BASE_DEFAULT)
  useEffect(()=>{ localStorage.setItem('baseUrl', baseUrl) },[baseUrl])

  if (!token) return <Login baseUrl={baseUrl} onAuth={setToken} />

  return (
    <div style={appStyle}>
      <div style={{ display:'grid', gridTemplateColumns:'260px 1fr', gap:12, maxWidth: 1200, margin: '24px auto' }}>
        <Sidebar tab={tab} setTab={setTab} onLogout={()=>{ sessionStorage.removeItem('adminToken'); setToken(null) }} />
        <main style={{ paddingRight:16 }}>
          <section style={{ background:'#fff', borderRadius:12, padding:16, boxShadow:'0 4px 14px rgba(2,8,20,0.05)', marginBottom:16 }}>
            <h3 style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>Admin <Badge text="live" /></h3>
            <label>API Base URL:&nbsp;<input value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} size={60} /></label>
          </section>
          {tab==='dashboard' && <Dashboard baseUrl={baseUrl} />}
          {tab==='onboard' && <Onboard baseUrl={baseUrl} token={token!} />}
          {tab==='clinics' && <Clinics baseUrl={baseUrl} token={token!} />}
          {tab==='activity' && <Activity baseUrl={baseUrl} token={token!} />}
        </main>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
