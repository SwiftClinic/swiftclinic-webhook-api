import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const BASE_DEFAULT = (import.meta as any).env?.VITE_API_BASE || 'https://swiftclinic-webhook-api-production.up.railway.app'

function Badge({ text }:{ text:string }){ return <span className="badge">{text}</span> }

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
      <div className="card" style={{ width:420 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
          <img src="https://i.imgur.com/5tByDtV.png" alt="SwiftClinic" style={{ height: 36 }} />
          <h2 style={{ margin:0 }}>SwiftClinic Admin</h2>
        </div>
        <p className="muted" style={{ marginTop:0 }}>Sign in to continue</p>
        <div style={{ display:'grid', gap:12 }}>
          <label>Email<input value={email} onChange={e=>setEmail(e.target.value)} className="input input-full" /></label>
          <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="input input-full" /></label>
          <button onClick={login} className="btn btn-primary">Sign In</button>
          <div className="small muted" style={{ minHeight:18 }}>{status}</div>
        </div>
      </div>
    </div>
  )
}

function Sidebar({ tab, setTab, onLogout }:{ tab:string; setTab:(t:string)=>void; onLogout:()=>void }){
  const Item = ({ id, label }:{id:string;label:string}) => (
    <button onClick={()=>setTab(id)} className={`nav-btn ${tab===id?'active':''}`}>{label}</button>
  )
  return (
    <aside className="sidebar">
      <div className="brand"><img src="https://i.imgur.com/5tByDtV.png" className="logo" /><strong>Admin</strong></div>
      <Item id="dashboard" label="Dashboard" />
      <Item id="onboard" label="Onboard Clinic" />
      <Item id="clinics" label="Clinics" />
      <Item id="activity" label="Activity" />
      <div style={{ marginTop:16 }}>
        <button onClick={onLogout} className="btn btn-muted input-full">Logout</button>
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
    <section className="card">
      <div className="header">
        <h3>Clinics <Badge text={`${rows.length}`} /></h3>
        <input placeholder="Search clinics" value={query} onChange={e=>setQuery(e.target.value)} className="input" />
      </div>
      <table className="table">
        <thead><tr><th>Name</th><th>Webhook</th><th>TZ</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {filtered.map(r=> (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>
                <code>{r.webhookUrl}</code>
                <button onClick={()=>copy(`${baseUrl}/webhook/${r.webhookUrl}`)} className="btn btn-muted" style={{ marginLeft:8 }}>Copy URL</button>
              </td>
              <td>{r.timezone||'-'}</td>
              <td>{r.isActive? 'Active':'Inactive'}</td>
              <td><button onClick={()=>toggle(r.id)} className="btn btn-muted">{r.isActive? 'Deactivate':'Activate'}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="small muted" style={{ marginTop:8 }}>{status}</div>
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
    <section className="card">
      <div className="header" style={{ gap:12 }}>
        <h3>Activity <Badge text={`${rows.length}`} /></h3>
        <input placeholder="Search" value={query} onChange={e=>setQuery(e.target.value)} className="input" />
        <input type="date" value={since} onChange={e=>setSince(e.target.value)} className="input" />
      </div>
      <ul style={{ listStyle:'none', padding:0, margin:0 }}>
        {filtered.map((r:any)=> (
          <li key={r.id} style={{ borderTop:'1px solid #e5e7eb', padding:'8px 0' }}>
            <code>{new Date(r.created_at).toLocaleString()}</code> — <strong>{r.event}</strong> — <small>{r.details}</small>
          </li>
        ))}
      </ul>
      <div className="small muted" style={{ marginTop:8 }}>{status}</div>
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
  const [businessSummary, setBusinessSummary] = useState<{name?:string; city?:string; tz?:string}>({})

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
    setSelectedBusiness(null)
    setBusinessSummary({})
    setStatus(`Detected shard ${data.data.shard}. Select business.`)
  }

  useEffect(()=>{ (async()=>{
    if (!selectedBusiness) return;
    setStatus('Fetching business details...')
    try{
      const res = await fetch(`${baseUrl}/admin/cliniko/business`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ clinikApiKey: apiKey, shard, businessId: selectedBusiness.id }) })
      const data = await res.json();
      if (data.success){
        setTimezone(data.data.time_zone_identifier || timezone)
        setBusinessSummary({ name: data.data.business_name, city: data.data.city, tz: data.data.time_zone_identifier })
        setStatus('Business details loaded.')
      } else {
        setStatus(`Details failed: ${data.error||res.status}`)
      }
    }catch(e:any){ setStatus(`Details error: ${e.message}`) }
  })() },[selectedBusiness])

  async function register(){
    if (!uuid || !selectedBusiness) { setStatus('Generate UUID and select business'); return }
    setStatus('Registering clinic...')
    const res = await fetch(`${baseUrl}/register-clinic`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ uniqueWebhookId: uuid, clinicId:`clinic-${uuid}`, clinicName: businessSummary.name || 'SwiftClinic', apiConfiguration:{ clinikApiKey: apiKey, shard, businessId: selectedBusiness.id, timezone } }) })
    const data = await res.json(); if(!data.success){ setStatus(`Register failed: ${data.error||res.status}`); return }
    setStatus(`Registered. Webhook: ${baseUrl}/webhook/${uuid}`)
  }

  const generateUuid=()=> setUuid((globalThis.crypto && 'randomUUID' in globalThis.crypto)? globalThis.crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2,10)}-${Math.random().toString(16).slice(2,6)}`)

  return (
    <section className="card">
      <h3>Onboard Clinic</h3>
      <div style={{ display:'grid', gap:12 }}>
        <div>
          <label>API key:&nbsp;
            <input type={showKey ? 'text':'password'} value={apiKey} onChange={e=>setApiKey(e.target.value)} className="input" />
          </label>
          <button onClick={()=>setShowKey(s=>!s)} className="btn btn-muted" style={{ marginLeft:8 }}>{showKey ? 'Hide' : 'Show'}</button>
        </div>
        <label>Shard (optional):&nbsp;<input value={shard} onChange={e=>setShard(e.target.value)} className="input" placeholder="uk2/us1/au1/ca1" /></label>
        <button onClick={detect} className="btn btn-primary">Detect businesses</button>
        {businesses.length>0 && (
          <div>
            <p>{businesses.length} businesses found.</p>
            <select value={selectedBusiness?.id||''} onChange={e=> setSelectedBusiness(businesses.find(b=> String(b.id)===e.target.value))} className="input">
              <option value="">Select business</option>
              {businesses.map((b:any)=> <option key={b.id} value={b.id}>{b.business_name || b.display_name || b.id} ({b.time_zone_identifier || b.time_zone})</option>)}
            </select>
          </div>
        )}
        {selectedBusiness && (
          <div className="small muted">Selected: <strong>{businessSummary.name || selectedBusiness.business_name}</strong> {businessSummary.city? `— ${businessSummary.city}`:''}</div>
        )}
        <div>
          <label>Timezone (auto):&nbsp;<input value={timezone} onChange={e=>setTimezone(e.target.value)} className="input" /></label>
        </div>
        <div>
          <label>Webhook UUID:&nbsp;<input value={uuid} onChange={e=>setUuid(e.target.value)} className="input" /></label>
          <button onClick={generateUuid} className="btn btn-muted" style={{marginLeft:8}}>Generate UUID</button>
        </div>
        <button onClick={register} className="btn btn-primary">Register clinic</button>
      </div>
    </section>
  )
}

function Dashboard({ baseUrl }:{ baseUrl:string }){
  return (
    <section className="card">
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
    <div>
      <div className="container">
        <Sidebar tab={tab} setTab={setTab} onLogout={()=>{ sessionStorage.removeItem('adminToken'); setToken(null) }} />
        <main>
          <section className="card" style={{ marginBottom:16 }}>
            <h3>Admin <Badge text="live" /></h3>
            <label>API Base URL:&nbsp;<input value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} className="input" /></label>
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
