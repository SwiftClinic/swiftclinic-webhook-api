import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

const BASE_DEFAULT = (import.meta as any).env?.VITE_API_BASE || 'https://swiftclinic-webhook-api-production.up.railway.app'

const colors = {
  primary: '#3FC5D4',
  secondary: '#E2E8F0',
  text: '#0f172a'
}

const appStyle: React.CSSProperties = {
  fontFamily: 'Poppins, system-ui, sans-serif',
  color: colors.text,
  background: colors.secondary,
  minHeight: '100vh'
}

function Toast({ message }: { message: string }) {
  if (!message) return null
  return (
    <div style={{ position:'fixed', right:16, bottom:16, background:'#111827', color:'#fff', padding:'10px 12px', borderRadius:10, boxShadow:'0 8px 22px rgba(0,0,0,0.2)' }}>{message}</div>
  )
}

function Login({ baseUrl, onAuth }: { baseUrl: string; onAuth: (token: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')

  async function login() {
    if (!email || !password) { setStatus('Enter email and password'); return }
    setStatus('Logging in...')
    try {
      const res = await fetch(`${baseUrl}/admin/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      if (!data.success) { setStatus(`Login failed: ${data.error || res.status}`); return }
      sessionStorage.setItem('adminToken', data.data.token)
      onAuth(data.data.token)
    } catch (e:any) {
      setStatus(`Login error: ${e.message}`)
    }
  }

  return (
    <div style={{ display:'grid', placeItems:'center', minHeight:'100vh', padding:'24px', background: colors.secondary }}>
      <div style={{ width: 420, background:'#fff', borderRadius:16, boxShadow:'0 12px 30px rgba(16,24,40,0.08)', padding:32 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
          <img src="https://i.imgur.com/5tByDtV.png" alt="SwiftClinic" style={{ height: 36 }} />
          <h2 style={{ margin:0 }}>SwiftClinic Admin</h2>
        </div>
        <p style={{ marginTop:0, color:'#475569' }}>Sign in to continue</p>
        <div style={{ display:'grid', gap:12 }}>
          <label>Email<input style={{ width:'100%', padding:12, borderRadius:8, border:'1px solid #cbd5e1' }} value={email} onChange={e=>setEmail(e.target.value)} /></label>
          <label>Password<input type="password" style={{ width:'100%', padding:12, borderRadius:8, border:'1px solid #cbd5e1' }} value={password} onChange={e=>setPassword(e.target.value)} /></label>
          <button onClick={login} style={{ padding:'12px 16px', background: colors.primary, color:'#0b132b', border:'none', borderRadius:10, fontWeight:600 }}>Sign In</button>
          <div style={{ fontSize:12, color:'#6b7280', minHeight:18 }}>{status}</div>
      </div>
    </div>
  </div>
  )
}

function Wizard() {
  const [baseUrl, setBaseUrl] = useState(localStorage.getItem('baseUrl') || BASE_DEFAULT)
  const [adminToken, setAdminToken] = useState(sessionStorage.getItem('adminToken') || '')
  const [apiKey, setApiKey] = useState(localStorage.getItem('apiKey') || '')
  const [showKey, setShowKey] = useState(false)
  const [shard, setShard] = useState(localStorage.getItem('shard') || '')
  const [businesses, setBusinesses] = useState<{id:string;name:string;time_zone?:string}[]>([])
  const [selectedBusiness, setSelectedBusiness] = useState(localStorage.getItem('businessId') || '')
  const [timezone, setTimezone] = useState(localStorage.getItem('timezone') || 'Europe/London')
  const [uuid, setUuid] = useState(localStorage.getItem('uuid') || '')
  const [status, setStatus] = useState('')
  const [toast, setToast] = useState('')

  useEffect(()=>{ localStorage.setItem('baseUrl', baseUrl) },[baseUrl])
  useEffect(()=>{ sessionStorage.setItem('adminToken', adminToken) },[adminToken])
  useEffect(()=>{ localStorage.setItem('apiKey', apiKey) },[apiKey])
  useEffect(()=>{ localStorage.setItem('shard', shard) },[shard])
  useEffect(()=>{ localStorage.setItem('businessId', selectedBusiness) },[selectedBusiness])
  useEffect(()=>{ localStorage.setItem('timezone', timezone) },[timezone])
  useEffect(()=>{ localStorage.setItem('uuid', uuid) },[uuid])
  useEffect(()=>{ if (toast) { const t=setTimeout(()=>setToast(''),3000); return ()=>clearTimeout(t)} },[toast])

  async function detect() {
    if (!apiKey) { setToast('Enter Cliniko API key'); return }
    setStatus('Detecting businesses...')
    const res = await fetch(`${baseUrl}/admin/cliniko/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ clinikApiKey: apiKey, shard: shard || undefined })
    })
    const data = await res.json()
    if (!data.success) { setStatus(`Detect failed: ${data.error || res.status}`); return }
    setShard(data.data.shard)
    setBusinesses(data.data.businesses || [])
    setStatus(`Detected shard ${data.data.shard}. Select a business.`)
    setToast('Detection successful')
  }

  async function register() {
    if (!uuid) { setToast('Enter or Generate UUID'); return }
    if (!selectedBusiness) { setToast('Select a business'); return }
    setStatus('Registering clinic...')
    const res = await fetch(`${baseUrl}/register-clinic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({
        uniqueWebhookId: uuid,
        clinicId: `clinic-${uuid}`,
        clinicName: 'SwiftClinic',
        apiConfiguration: {
          clinikApiKey: apiKey,
          shard,
          businessId: selectedBusiness,
          timezone
        }
      })
    })
    const data = await res.json()
    if (!data.success) { setStatus(`Register failed: ${data.error || res.status}`); return }
    setStatus(`Registered. Webhook: ${baseUrl}/webhook/${uuid}`)
    setToast('Clinic registered')
  }

  async function testWebhook() {
    if (!uuid) { setToast('Enter webhook UUID first'); return }
    setStatus('Testing webhook...')
    const res = await fetch(`${baseUrl}/webhook/${uuid}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello, test availability', sessionId: 'admin-smoke', userConsent: true })
    })
    const data = await res.json()
    setStatus(`Webhook response: ${JSON.stringify(data).slice(0, 400)}...`)
    setToast('Test message sent')
  }

  const generateUuid = () => {
    const u = (globalThis.crypto && 'randomUUID' in globalThis.crypto)
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2,10)}-${Math.random().toString(16).slice(2,6)}`
    setUuid(u)
    setToast('UUID generated')
  }

  const copyWebhook = async () => {
    if (!uuid) return
    try { await navigator.clipboard.writeText(`${baseUrl}/webhook/${uuid}`); setToast('Webhook URL copied') } catch {}
  }

  return (
    <div style={{ maxWidth: 980, margin: '40px auto', padding:'0 16px' }}>
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <img src="https://i.imgur.com/5tByDtV.png" alt="SwiftClinic" style={{ height: 32 }} />
          <strong>Admin Wizard</strong>
        </div>
        <div>
          <small>Token {adminToken ? '✓' : '✕'}</small>
        </div>
      </header>

      <section style={{ background:'#fff', borderRadius:12, padding:16, boxShadow:'0 4px 14px rgba(2,8,20,0.05)', marginBottom:16 }}>
        <h3>1) Server</h3>
        <label>Base URL:&nbsp;<input value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} size={60} /></label>
      </section>

      <section style={{ background:'#fff', borderRadius:12, padding:16, boxShadow:'0 4px 14px rgba(2,8,20,0.05)', marginBottom:16 }}>
        <h3>2) Cliniko API</h3>
        <label>API key:&nbsp;
          <input type={showKey ? 'text':'password'} value={apiKey} onChange={e=>setApiKey(e.target.value)} size={60} />
        </label>
        <button onClick={()=>setShowKey(s=>!s)} style={{ marginLeft:8, padding:'6px 10px' }}>{showKey ? 'Hide' : 'Show'}</button><br/>
        <label>Shard (optional):&nbsp;<input value={shard} onChange={e=>setShard(e.target.value)} placeholder="uk2/us1/au1/ca1" /></label><br/>
        <button onClick={detect} style={{ padding:'10px 14px', background: colors.primary, border:'none', borderRadius:8, fontWeight:600 }}>Detect businesses</button>
        {businesses.length>0 && (
          <div style={{ marginTop:12 }}>
            <p>{businesses.length} businesses found.</p>
            <select value={selectedBusiness} onChange={e=>setSelectedBusiness(e.target.value)}>
              <option value="">Select business</option>
              {businesses.map(b=> <option key={b.id} value={b.id}>{b.name} ({b.id})</option>)}
            </select>
          </div>
        )}
      </section>

      <section style={{ background:'#fff', borderRadius:12, padding:16, boxShadow:'0 4px 14px rgba(2,8,20,0.05)', marginBottom:16 }}>
        <h3>3) Register</h3>
        <label>Webhook UUID:&nbsp;<input value={uuid} onChange={e=>setUuid(e.target.value)} size={60} /></label>
        <button onClick={generateUuid} style={{marginLeft:8, padding:'8px 12px'}}>Generate UUID</button><br/>
        <label>Timezone:&nbsp;<input value={timezone} onChange={e=>setTimezone(e.target.value)} placeholder="Europe/London" /></label><br/>
        <button onClick={register} style={{ padding:'10px 14px', background: colors.primary, border:'none', borderRadius:8, fontWeight:600 }}>Register clinic</button>
        <button onClick={copyWebhook} style={{marginLeft:8, padding:'10px 14px'}}>Copy Webhook URL</button>
      </section>

      <section style={{ background:'#fff', borderRadius:12, padding:16, boxShadow:'0 4px 14px rgba(2,8,20,0.05)' }}>
        <h3>4) Test</h3>
        <button onClick={testWebhook} style={{ padding:'10px 14px', background: colors.primary, border:'none', borderRadius:8, fontWeight:600 }}>Send test message</button>
      </section>

      <pre style={{whiteSpace:'pre-wrap', background:'#f5f5f5', padding:12, marginTop:16}}>{status}</pre>
      <Toast message={toast} />
    </div>
  )
}

function App() {
  const [token, setToken] = useState<string | null>(sessionStorage.getItem('adminToken'))
  const [baseUrl] = useState(localStorage.getItem('baseUrl') || BASE_DEFAULT)
  return (
    <div style={appStyle}>
      {token ? <Wizard /> : <Login baseUrl={baseUrl} onAuth={setToken} />}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
