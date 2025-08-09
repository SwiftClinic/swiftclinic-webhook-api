import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

const BASE_DEFAULT = 'https://swiftclinic-webhook-api-production.up.railway.app'

// Storage helpers
const ls = {
  get: (k: string, d: string) => (typeof localStorage !== 'undefined' ? localStorage.getItem(k) ?? d : d),
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch {}
}}
const ss = {
  get: (k: string, d: string) => (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(k) ?? d : d),
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v) } catch {}
}}

function App() {
  const [baseUrl, setBaseUrl] = useState(ls.get('baseUrl', BASE_DEFAULT))
  const [adminToken, setAdminToken] = useState(ss.get('adminToken', ''))
  const [email, setEmail] = useState(ls.get('adminEmail',''))
  const [password, setPassword] = useState('')
  const [apiKey, setApiKey] = useState(ls.get('apiKey', ''))
  const [shard, setShard] = useState(ls.get('shard', ''))
  const [businesses, setBusinesses] = useState<{id:string;name:string;time_zone?:string}[]>([])
  const [selectedBusiness, setSelectedBusiness] = useState(ls.get('businessId', ''))
  const [timezone, setTimezone] = useState(ls.get('timezone', 'Europe/London'))
  const [uuid, setUuid] = useState(ls.get('uuid', ''))
  const [status, setStatus] = useState('')

  // Persist non-secret fields in localStorage; token in sessionStorage
  useEffect(()=>{ ls.set('baseUrl', baseUrl) },[baseUrl])
  useEffect(()=>{ ss.set('adminToken', adminToken) },[adminToken])
  useEffect(()=>{ ls.set('adminEmail', email) },[email])
  useEffect(()=>{ ls.set('apiKey', apiKey) },[apiKey])
  useEffect(()=>{ ls.set('shard', shard) },[shard])
  useEffect(()=>{ ls.set('businessId', selectedBusiness) },[selectedBusiness])
  useEffect(()=>{ ls.set('timezone', timezone) },[timezone])
  useEffect(()=>{ ls.set('uuid', uuid) },[uuid])

  async function login() {
    setStatus('Logging in...')
    const res = await fetch(`${baseUrl}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    const data = await res.json()
    if (!data.success) { setStatus(`Login failed: ${data.error || res.status}`); return }
    setAdminToken(data.data.token)
    setPassword('')
    setStatus('Logged in. Token stored in session for this browser tab.')
  }

  async function detect() {
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
  }

  async function register() {
    if (!uuid) { setStatus('Enter webhook UUID'); return }
    if (!selectedBusiness) { setStatus('Select a business'); return }
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
  }

  async function testWebhook() {
    if (!uuid) { setStatus('Enter webhook UUID first'); return }
    setStatus('Testing webhook...')
    const res = await fetch(`${baseUrl}/webhook/${uuid}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello, test availability', sessionId: 'admin-smoke', userConsent: true })
    })
    const data = await res.json()
    setStatus(`Webhook response: ${JSON.stringify(data).slice(0, 400)}...`)
  }

  const generateUuid = () => {
    const u = (globalThis.crypto && 'randomUUID' in globalThis.crypto)
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2,10)}-${Math.random().toString(16).slice(2,6)}`
    setUuid(u)
  }

  const copyWebhook = async () => {
    if (!uuid) return
    try { await navigator.clipboard.writeText(`${baseUrl}/webhook/${uuid}`); setStatus('Webhook URL copied'); } catch {}
  }

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1>SwiftClinic Admin Wizard</h1>

      <section>
        <h3>1) Server & Login</h3>
        <label>Base URL:&nbsp;<input value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} size={60} /></label><br/>
        <div style={{marginTop:8, padding:8, border:'1px solid #ddd'}}>
          <div>Email:&nbsp;<input value={email} onChange={e=>setEmail(e.target.value)} /></div>
          <div>Password:&nbsp;<input type="password" value={password} onChange={e=>setPassword(e.target.value)} /></div>
          <button onClick={login}>Login</button>
          <div style={{fontSize:12, color:'#666'}}>Token stored in session (clears on browser restart). Or paste a bearer token below.</div>
          <div>Admin Token:&nbsp;<input value={adminToken} onChange={e=>setAdminToken(e.target.value)} size={60} /></div>
        </div>
      </section>

      <section>
        <h3>2) Cliniko API</h3>
        <label>API key:&nbsp;<input value={apiKey} onChange={e=>setApiKey(e.target.value)} size={60} /></label><br/>
        <label>Shard (optional):&nbsp;<input value={shard} onChange={e=>setShard(e.target.value)} placeholder="uk2/us1/au1/ca1" /></label><br/>
        <button onClick={detect}>Detect businesses</button>
        <div>
          {businesses.length>0 && (
            <>
              <p>{businesses.length} businesses found.</p>
              <select value={selectedBusiness} onChange={e=>setSelectedBusiness(e.target.value)}>
                <option value="">Select business</option>
                {businesses.map(b=> <option key={b.id} value={b.id}>{b.name} ({b.id})</option>)}
              </select>
            </>
          )}
        </div>
      </section>

      <section>
        <h3>3) Register</h3>
        <label>Webhook UUID:&nbsp;<input value={uuid} onChange={e=>setUuid(e.target.value)} size={60} /></label>
        <button onClick={generateUuid} style={{marginLeft:8}}>Generate UUID</button><br/>
        <label>Timezone:&nbsp;<input value={timezone} onChange={e=>setTimezone(e.target.value)} placeholder="Europe/London" /></label><br/>
        <button onClick={register}>Register clinic</button>
        <button onClick={copyWebhook} style={{marginLeft:8}}>Copy Webhook URL</button>
      </section>

      <section>
        <h3>4) Test</h3>
        <button onClick={testWebhook}>Send test message</button>
      </section>

      <pre style={{whiteSpace:'pre-wrap', background:'#f5f5f5', padding:12}}>{status}</pre>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
