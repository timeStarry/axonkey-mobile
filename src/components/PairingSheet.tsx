import { useState } from 'react'
import { CheckCircle2, Laptop, QrCode, Radio, RefreshCw, Trash2, Wifi, X } from 'lucide-react'
import { clsx } from 'clsx'
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
  const discoveredHosts = useMobileStore((s) => s.discoveredHosts)
  const discoveringLan = useMobileStore((s) => s.discoveringLan)
  const hostId = useMobileStore((s) => s.hostId)
  const phase = useMobileStore((s) => s.phase)
  const isDemoMode = useMobileStore((s) => s.isDemoMode)
  const connectSavedHost = useMobileStore((s) => s.connectSavedHost)
  const discoverAndReconnect = useMobileStore((s) => s.discoverAndReconnect)
  const connectDemo = useMobileStore((s) => s.connectDemo)
  const pairFromOffer = useMobileStore((s) => s.pairFromOffer)
  const forgetHost = useMobileStore((s) => s.forgetHost)

  const [qrInput, setQrInput] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)

  if (!open) return null

  const discoveredIds = new Set(discoveredHosts.map((d) => d.hostId))
  const unpairedDiscovered = discoveredHosts.filter(
    (d) => !savedHosts.some((s) => s.hostId === d.hostId),
  )

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-t-3xl bg-[#121620] border-t border-white/[0.1] p-5 safe-bottom space-y-4 max-h-[86vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4 text-blue-400" />
            <h2 className="text-base font-semibold text-zinc-100">连接电脑端 Axonkey</h2>
          </div>
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
          className="w-full h-12 rounded-2xl bg-blue-500 hover:bg-blue-400 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-sm shadow-blue-500/30"
        >
          <QrCode className="w-4 h-4" />
          <span>{isNativeShell() ? '扫描电脑端配对二维码' : '扫码配对（原生 App）'}</span>
        </button>

        {/* Saved Paired Hosts + LAN Auto-Discovery Refresh */}
        {savedHosts.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">
                已配对电脑（支持 IP/端口变更自动发现）
              </span>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap')
                  discoverAndReconnect(650)
                }}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-300"
              >
                <RefreshCw className={clsx('w-3 h-3', discoveringLan && 'animate-spin')} />
                <span>{discoveringLan ? '扫描中…' : '局域网探测'}</span>
              </button>
            </div>

            <div className="space-y-1.5 max-h-44 overflow-y-auto">
              {savedHosts.map((h) => {
                const current = !isDemoMode && hostId === h.hostId && phase === 'active'
                const onlineOnLan = discoveredIds.has(h.hostId)
                return (
                  <div
                    key={h.hostId}
                    className={clsx(
                      'flex items-center justify-between gap-2 px-3 py-2.5 rounded-2xl border transition-colors',
                      current
                        ? 'bg-emerald-500/10 border-emerald-400/35'
                        : 'bg-[#0d1018] border-white/[0.08]',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('tap')
                        connectSavedHost(h)
                      }}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                    >
                      <Laptop
                        className={clsx(
                          'w-4 h-4 shrink-0',
                          current ? 'text-emerald-300' : 'text-blue-300',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-zinc-100 truncate">
                            {h.hostName}
                          </span>
                          {current ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-[10px] font-medium text-emerald-300 shrink-0">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              已连接
                            </span>
                          ) : onlineOnLan ? (
                            <span className="px-1.5 py-0.5 rounded-full bg-blue-500/20 text-[10px] font-medium text-blue-300 shrink-0">
                              局域网在线
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono truncate">
                          {h.addrs[0]}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => forgetHost(h.hostId)}
                      className="p-2 rounded-xl text-zinc-500 hover:text-rose-400"
                      aria-label="移除已配对电脑"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Discovered Unpaired LAN Hosts Hint */}
        {unpairedDiscovered.length > 0 && (
          <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-400/25 space-y-1">
            <div className="text-xs font-semibold text-blue-200">
              发现局域网电脑：{unpairedDiscovered.map((d) => d.hostName).join('、')}
            </div>
            <div className="text-[11px] text-zinc-300">
              首次连接请在电脑端 Axonkey 打开配对二维码，点击上方按钮扫码建立加密信任；此后同一局域网将自动重连。
            </div>
          </div>
        )}

        {/* Paste Fallback for Debug / Manual Pairing */}
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <input
              type="text"
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              placeholder="或粘贴电脑端配对口令 JSON…"
              className="flex-1 h-10 px-3 rounded-xl bg-[#0d1018] border border-white/[0.09] text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-blue-400/60"
            />
            <button
              type="button"
              disabled={!qrInput.trim()}
              onClick={() => submitQrText(qrInput)}
              className="h-10 px-3.5 rounded-xl bg-white/[0.1] disabled:opacity-40 text-xs font-medium text-zinc-100"
            >
              配对
            </button>
          </div>
          {parseError && <p className="text-xs text-rose-400">{parseError}</p>}
        </div>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap')
            connectDemo()
            setOpen(false)
          }}
          className="w-full h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-zinc-300 inline-flex items-center justify-center gap-1.5"
        >
          <Radio className="w-3.5 h-3.5 text-emerald-400" />
          <span>{isDemoMode ? '当前处于本地模拟体验模式' : '切换到本地模拟体验模式'}</span>
        </button>
      </div>
    </div>
  )
}
