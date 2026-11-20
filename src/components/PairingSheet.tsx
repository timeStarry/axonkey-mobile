import { useState } from 'react'
import { Laptop, QrCode, Radio, Trash2, X } from 'lucide-react'
import { useMobileStore } from '../state/useMobileStore'
import {
  isNativeShell,
  parsePairingQr,
  requestNativeQrScan,
  triggerHaptic,
} from '../transport/nativeBridge'

export function PairingSheet() {
  const open = useMobileStore((s) => s.pairingOpen)
  const setOpen = useMobileStore((s) => s.setPairingOpen)
  const savedHosts = useMobileStore((s) => s.savedHosts)
  const hostId = useMobileStore((s) => s.hostId)
  const phase = useMobileStore((s) => s.phase)
  const isDemoMode = useMobileStore((s) => s.isDemoMode)
  const connectSavedHost = useMobileStore((s) => s.connectSavedHost)
  const connectDemo = useMobileStore((s) => s.connectDemo)
  const pairFromOffer = useMobileStore((s) => s.pairFromOffer)
  const forgetHost = useMobileStore((s) => s.forgetHost)

  const [qrInput, setQrInput] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)

  if (!open) return null

  const submitQrText = (raw: string) => {
    try {
      const offer = parsePairingQr(raw)
      setParseError(null)
      setQrInput('')
      pairFromOffer(offer)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : '无法解析配对信息')
      triggerHaptic('error')
    }
  }

  const handleScan = () => {
    triggerHaptic('tap')
    const started = requestNativeQrScan((raw) => submitQrText(raw))
    if (!started) {
      setParseError('浏览器调试模式请粘贴桌面端生成的配对 JSON')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-t-3xl bg-[#141821] border-t border-white/10 p-5 safe-bottom space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-100">连接桌面端</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-8 h-8 rounded-full bg-white/[0.06] inline-flex items-center justify-center text-zinc-400"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleScan}
          className="w-full h-12 rounded-2xl bg-blue-500 hover:bg-blue-400 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          <QrCode className="w-4 h-4" />
          <span>{isNativeShell() ? '扫描桌面配对二维码' : '扫码配对（原生 App）'}</span>
        </button>

        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              placeholder="粘贴桌面配对载荷 JSON…"
              className="flex-1 h-10 px-3 rounded-xl bg-[#0d1017] border border-white/10 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-blue-400/60"
            />
            <button
              type="button"
              disabled={!qrInput.trim()}
              onClick={() => submitQrText(qrInput)}
              className="h-10 px-3.5 rounded-xl bg-white/10 disabled:opacity-40 text-xs font-medium text-zinc-100"
            >
              配对
            </button>
          </div>
          {parseError && <p className="text-xs text-rose-400">{parseError}</p>}
        </div>

        {savedHosts.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-zinc-400">已配对桌面</div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {savedHosts.map((h) => {
                const current = !isDemoMode && hostId === h.hostId && phase === 'active'
                return (
                  <div
                    key={h.hostId}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-[#1a1f2b] border border-white/[0.07]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('tap')
                        connectSavedHost(h)
                      }}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                    >
                      <Laptop className="w-4 h-4 text-blue-300 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-zinc-100 truncate">
                          {h.hostName}
                        </div>
                        <div className="text-[11px] text-zinc-400 truncate">
                          {current ? '已连接' : h.addrs[0]}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => forgetHost(h.hostId)}
                      className="p-2 rounded-lg text-zinc-500 hover:text-rose-400"
                      aria-label="移除桌面"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap')
            connectDemo()
            setOpen(false)
          }}
          className="w-full h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] text-xs font-medium text-zinc-300 inline-flex items-center justify-center gap-1.5"
        >
          <Radio className="w-3.5 h-3.5 text-emerald-400" />
          <span>{isDemoMode ? '当前处于本地模拟体验模式' : '切换到本地模拟体验模式'}</span>
        </button>
      </div>
    </div>
  )
}
