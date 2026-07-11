// Dialog in-app al posto di prompt/confirm/alert del browser.
// Uso: await confirmDlg('Eliminare?'), await promptDlg('Nome', [{label:'Nome'}]), toast('Fatto')
import { useEffect, useState } from 'react'

export type Field = { label: string; value?: string; placeholder?: string; options?: string[] }
type Dlg =
  | { kind: 'confirm'; title: string; body?: string; resolve: (v: boolean) => void }
  | { kind: 'prompt'; title: string; fields: Field[]; resolve: (v: string[] | null) => void }

let push: ((d: Dlg) => void) | null = null
let pushToast: ((m: string) => void) | null = null

export const confirmDlg = (title: string, body?: string) =>
  new Promise<boolean>((resolve) => push ? push({ kind: 'confirm', title, body, resolve }) : resolve(false))
export const promptDlg = (title: string, fields: Field[]) =>
  new Promise<string[] | null>((resolve) => push ? push({ kind: 'prompt', title, fields, resolve }) : resolve(null))
export const toast = (m: string) => pushToast?.(m)

export function DialogHost() {
  const [dlg, setDlg] = useState<Dlg | null>(null)
  const [vals, setVals] = useState<string[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    push = (d) => { setDlg(d); setVals(d.kind === 'prompt' ? d.fields.map((f) => f.value ?? f.options?.[0] ?? '') : []) }
    pushToast = (m) => { setMsg(m); window.setTimeout(() => setMsg(null), 2400) }
    return () => { push = null; pushToast = null }
  }, [])

  const close = (ok: boolean) => {
    if (!dlg) return
    if (dlg.kind === 'confirm') dlg.resolve(ok)
    else dlg.resolve(ok ? vals : null)
    setDlg(null)
  }

  return (
    <>
      {dlg && (
        <div className="overlay center" onClick={() => close(false)}>
          <div className="dlg" onClick={(e) => e.stopPropagation()}>
            <b className="dt">{dlg.title}</b>
            {dlg.kind === 'confirm' && dlg.body && <p className="sm mut" style={{ margin: '6px 0 0' }}>{dlg.body}</p>}
            {dlg.kind === 'prompt' && dlg.fields.map((f, i) => (
              <div className="efield" key={i} style={{ marginTop: 12 }}>
                <label>{f.label}</label>
                {f.options ? (
                  <select value={vals[i] ?? ''} onChange={(e) => setVals(vals.map((v, j) => (j === i ? e.target.value : v)))}>
                    {f.options.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input value={vals[i] ?? ''} placeholder={f.placeholder} style={{ fontFamily: 'var(--sans)' }}
                    onChange={(e) => setVals(vals.map((v, j) => (j === i ? e.target.value : v)))} />
                )}
              </div>
            ))}
            <div className="row" style={{ marginTop: 16 }}>
              <button className="ghost" onClick={() => close(false)}>Annulla</button>
              <button onClick={() => close(true)}>{dlg.kind === 'confirm' ? 'Conferma' : 'OK'}</button>
            </div>
          </div>
        </div>
      )}
      {msg && <div className="toast">{msg}</div>}
    </>
  )
}
