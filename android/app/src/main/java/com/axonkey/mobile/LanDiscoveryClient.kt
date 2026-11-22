package com.axonkey.mobile

import android.content.Context
import android.net.wifi.WifiManager
import android.os.SystemClock
import org.json.JSONArray
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.SocketTimeoutException
import java.nio.charset.StandardCharsets
import java.util.concurrent.Executors

/**
 * UDP LAN Auto-Discovery Client on Port 49671.
 *
 * Broadcasts {"type":"axonkey.discover","v":1,"hostId":null} to 255.255.255.255:49671
 * and all active IPv4 subnet broadcast addresses, collects {"type":"axonkey.announce",...}
 * responses within timeoutMs, prioritizes the routable UDP sender IPv4, and delivers
 * a deduplicated JSON array string to JS.
 */
class LanDiscoveryClient(
    context: Context,
    private val onHostsDiscovered: (String) -> Unit
) {
    companion object {
        const val DISCOVERY_PORT = 49671
        private const val MIN_TIMEOUT_MS = 200
        private const val MAX_TIMEOUT_MS = 5_000
        private const val SOCKET_POLL_TIMEOUT_MS = 120
        private const val SECOND_PULSE_DELAY_MS = 160L
    }

    private val appContext = context.applicationContext
    private val executor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "axonkey-lan-discovery").apply { isDaemon = true }
    }

    private data class DiscoveredHostEntry(
        val v: Int,
        val hostId: String,
        var hostName: String,
        var port: Int,
        val addrs: LinkedHashSet<String>
    )

    fun discover(timeoutMs: Int) {
        val clampedTimeout = timeoutMs.coerceIn(MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)
        executor.execute {
            val jsonResult = runDiscoveryBlocking(clampedTimeout)
            onHostsDiscovered(jsonResult)
        }
    }

    fun shutdown() {
        executor.shutdownNow()
    }

    private fun runDiscoveryBlocking(timeoutMs: Int): String {
        val discovered = LinkedHashMap<String, DiscoveredHostEntry>()
        val wifiManager = appContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        val multicastLock = try {
            wifiManager?.createMulticastLock("axonkey-lan-discovery")?.apply {
                setReferenceCounted(false)
                acquire()
            }
        } catch (_: Exception) {
            null
        }

        val probeBytes = JSONObject().apply {
            put("type", "axonkey.discover")
            put("v", 1)
            put("hostId", JSONObject.NULL)
        }.toString().toByteArray(StandardCharsets.UTF_8)

        var socket: DatagramSocket? = null
        try {
            val targets = resolveBroadcastTargets(wifiManager)
            socket = DatagramSocket(null).apply {
                reuseAddress = true
                broadcast = true
                soTimeout = SOCKET_POLL_TIMEOUT_MS
                bind(InetSocketAddress(0))
            }

            val startMs = SystemClock.elapsedRealtime()
            val deadlineMs = startMs + timeoutMs
            var sentSecondPulse = false

            sendProbeToAll(socket, probeBytes, targets)

            val recvBuf = ByteArray(4096)
            while (true) {
                val nowMs = SystemClock.elapsedRealtime()
                val remainingMs = deadlineMs - nowMs
                if (remainingMs <= 0L) break

                if (!sentSecondPulse && timeoutMs >= 350 && nowMs - startMs >= SECOND_PULSE_DELAY_MS) {
                    sentSecondPulse = true
                    sendProbeToAll(socket, probeBytes, targets)
                }

                socket.soTimeout = remainingMs.coerceAtMost(SOCKET_POLL_TIMEOUT_MS.toLong()).toInt()
                val packet = DatagramPacket(recvBuf, recvBuf.size)
                try {
                    socket.receive(packet)
                    parseAnnouncePacket(packet, discovered)
                } catch (_: SocketTimeoutException) {
                    // Continue polling until deadlineMs
                } catch (_: Exception) {
                    break
                }
            }
        } catch (_: Exception) {
            // Return empty array on network error
        } finally {
            try {
                socket?.close()
            } catch (_: Exception) {
            }
            try {
                if (multicastLock?.isHeld == true) {
                    multicastLock.release()
                }
            } catch (_: Exception) {
            }
        }

        val outArray = JSONArray()
        for (entry in discovered.values) {
            if (entry.addrs.isEmpty()) continue
            val addrsJson = JSONArray()
            for (addr in entry.addrs) {
                addrsJson.put(addr)
            }
            outArray.put(
                JSONObject().apply {
                    put("type", "axonkey.announce")
                    put("v", entry.v)
                    put("hostId", entry.hostId)
                    put("hostName", entry.hostName)
                    put("port", entry.port)
                    put("addrs", addrsJson)
                }
            )
        }
        return outArray.toString()
    }

    private fun sendProbeToAll(
        socket: DatagramSocket,
        probeBytes: ByteArray,
        targets: Set<InetAddress>
    ) {
        for (addr in targets) {
            try {
                val pkt = DatagramPacket(probeBytes, probeBytes.size, addr, DISCOVERY_PORT)
                socket.send(pkt)
            } catch (_: Exception) {
            }
        }
    }

    private fun parseAnnouncePacket(
        packet: DatagramPacket,
        discovered: LinkedHashMap<String, DiscoveredHostEntry>
    ) {
        if (packet.length <= 0) return
        val text = String(packet.data, packet.offset, packet.length, StandardCharsets.UTF_8)
        val obj = try {
            JSONObject(text)
        } catch (_: Exception) {
            return
        }
        if (obj.optString("type") != "axonkey.announce") return

        val hostId = obj.optString("hostId", "").trim()
        if (hostId.isEmpty()) return

        val v = obj.optInt("v", 1)
        val hostName = obj.optString("hostName", "Axonkey Desktop").ifBlank { "Axonkey Desktop" }
        val port = obj.optInt("port", 0)

        val entry = discovered.getOrPut(hostId) {
            DiscoveredHostEntry(
                v = v,
                hostId = hostId,
                hostName = hostName,
                port = port,
                addrs = LinkedHashSet()
            )
        }
        entry.hostName = hostName
        if (port > 0) entry.port = port

        // Prioritize the actual routable source IPv4 from which the UDP response arrived
        val senderAddr = packet.address
        if (senderAddr is Inet4Address && !senderAddr.isLoopbackAddress && port in 1..65535) {
            val hostAddr = senderAddr.hostAddress
            if (!hostAddr.isNullOrBlank()) {
                entry.addrs.add("$hostAddr:$port")
            }
        }

        val rawAddrs = obj.optJSONArray("addrs")
        if (rawAddrs != null) {
            for (i in 0 until rawAddrs.length()) {
                val candidate = rawAddrs.optString(i, "").trim()
                if (candidate.isNotEmpty()) {
                    entry.addrs.add(candidate)
                }
            }
        }
    }

    private fun resolveBroadcastTargets(wifiManager: WifiManager?): Set<InetAddress> {
        val targets = LinkedHashSet<InetAddress>()
        try {
            targets.add(InetAddress.getByName("255.255.255.255"))
        } catch (_: Exception) {
        }

        // Enumerate active non-loopback IPv4 interface broadcast addresses (Wi-Fi / hotspot / USB tether)
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces != null && interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                if (!iface.isUp || iface.isLoopback) continue
                for (ia in iface.interfaceAddresses) {
                    val bcast = ia.broadcast
                    if (bcast is Inet4Address) {
                        targets.add(bcast)
                    }
                }
            }
        } catch (_: Exception) {
        }

        // Fallback via WifiManager DHCP subnet info if available
        try {
            @Suppress("DEPRECATION")
            val dhcp = wifiManager?.dhcpInfo
            if (dhcp != null && dhcp.ipAddress != 0 && dhcp.netmask != 0) {
                val broadcastInt = (dhcp.ipAddress and dhcp.netmask) or dhcp.netmask.inv()
                val quads = ByteArray(4) { k -> ((broadcastInt shr (k * 8)) and 0xFF).toByte() }
                targets.add(InetAddress.getByAddress(quads))
            }
        } catch (_: Exception) {
        }

        return targets
    }
}
