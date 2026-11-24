package com.axonkey.mobile

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import android.view.Surface
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan

/**
 * Dual-Mode Native Gyroscope Engine for Axonkey Mobile v4.
 *
 * Coordinate convention (remapped to current Display screen frame S):
 * - Screen frame S: +X screen-right, +Y screen-top (forward pointing axis), +Z out of screen.
 * - Pointing axis in S: f_S = (0, 1, 0).
 * - World frame W (from SensorManager.getRotationMatrixFromVector): +Z up opposite gravity, U = (0, 0, 1).
 *
 * Mode A ("relative"): Gravity-aligned tangent basis air-mouse (zero roll coupling) + hold clutch + 75ms click stabilizer.
 * Mode B ("absolute"): Recentered virtual plane ray-projection aim + 2D shared-cutoff One-Euro Filter + 75ms click stabilizer.
 */
class GyroController(
    context: Context,
    private val arbiter: OutboundArbiter,
    private val onGyroStateChanged: (String) -> Unit,
    private val onRecenterHaptic: () -> Unit
) : SensorEventListener {

    companion object {
        private const val MODE_OFF = "off"
        private const val MODE_RELATIVE = "relative"
        private const val MODE_ABSOLUTE = "absolute"

        // Guard: pointing axis must stay >= 15 degrees away from world vertical U
        private val SIN_15_DEG: Double = sin(Math.toRadians(15.0))

        // Mode A: Gravity-aligned relative air-mouse constants
        private const val REL_DEADZONE_RAD_S = 0.012
        private const val REL_K0 = 650.0
        private const val REL_K1 = 1850.0
        private const val REL_W0 = 0.6
        private const val MAX_SENSOR_DT_S = 0.10
        private const val MIN_REL_SEND_INTERVAL_US = 7_000L // Cap burst rate on 200-400Hz gaming sensors

        // Mode B: Recentered ray-projection perspective constants
        private const val ABS_MIN_FORWARD_Z = 0.25
        private val TAN_THETA_H_BASE: Double = tan(Math.toRadians(25.0))
        private const val ASPECT_H_OVER_W = 9.0 / 16.0
        private const val MIN_ABS_SEND_INTERVAL_US = 7_500L

        // 75ms Click-Stabilizer constants (suppresses involuntary thumb/finger click-jerk)
        private const val CLICK_STABILIZE_WINDOW_NS = 75_000_000L
        private const val CLICK_STABILIZE_REL_MAX_RAD_S = 0.65
        private const val CLICK_STABILIZE_REL_RAMP_END_RAD_S = 1.10
        private const val CLICK_STABILIZE_REL_SCALE = 0.15
        private val COS_2_5_DEG: Double = cos(Math.toRadians(2.5))
        private const val CLICK_STABILIZE_ABS_BLEND = 0.05

        // 2D Shared-Cutoff One-Euro Filter constants (normalized [0, 1] screen coords)
        private const val EURO_F_MIN = 1.5
        private const val EURO_BETA = 8.0
        private const val EURO_D_CUTOFF = 1.0
    }

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val gyroSensor: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    private val rotationSensor: Sensor? =
        sensorManager.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)
            ?: sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)

    private val stateLock = Any()

    private var desiredMode: String = MODE_OFF
    private var sensitivity: Double = 1.0
    private var clutchEngaged: Boolean = false
    private var activityResumed: Boolean = true
    private var sessionAuthorized: Boolean = false
    private var sensorsRegistered: Boolean = false
    private var lastReportedState: String = MODE_OFF
    private var displayRotation: Int = Surface.ROTATION_0

    // Raw 3x3 sensor matrix (device D -> world W) and display-remapped 3x3 matrix (screen S -> world W)
    private val rawRotMatrix = FloatArray(9)
    private val rotMatrix = FloatArray(9)
    private var hasRawRotationMatrix: Boolean = false
    private var hasRotationMatrix: Boolean = false

    // 75ms click-stabilizer state
    private var clickStabilizeUntilNs: Long = 0L
    private var hasClickAnchor: Boolean = false
    private var anchorRx: Double = 0.0
    private var anchorRy: Double = 1.0
    private var anchorRz: Double = 0.0
    private var anchorU: Double = 0.5
    private var anchorV: Double = 0.5

    // Mode A integration & micro-coalescing state
    private var lastGyroTimestampNs: Long = 0L
    private var accumRelDx: Double = 0.0
    private var accumRelDy: Double = 0.0
    private var lastRelSendTimeUs: Long = 0L

    // Mode B calibration basis in world frame W: f_0 (forward), r_0 (right), u_0 (up)
    private var hasCalibration: Boolean = false
    private var pendingRecenter: Boolean = false
    private var f0x = 0.0
    private var f0y = 1.0
    private var f0z = 0.0
    private var r0x = 1.0
    private var r0y = 0.0
    private var r0z = 0.0
    private var u0x = 0.0
    private var u0y = 0.0
    private var u0z = 1.0
    private var lastAbsSendTimeUs: Long = 0L

    private val oneEuroFilter = SharedOneEuroFilter2D(
        fMin = EURO_F_MIN,
        beta = EURO_BETA,
        dCutoff = EURO_D_CUTOFF
    )

    fun notifyClickPulse() {
        val untilNs = SystemClock.elapsedRealtimeNanos() + CLICK_STABILIZE_WINDOW_NS
        synchronized(stateLock) {
            clickStabilizeUntilNs = max(clickStabilizeUntilNs, untilNs)
        }
    }

    fun setDisplayRotation(rotation: Int) {
        val normalized = when (rotation) {
            Surface.ROTATION_90 -> Surface.ROTATION_90
            Surface.ROTATION_180 -> Surface.ROTATION_180
            Surface.ROTATION_270 -> Surface.ROTATION_270
            else -> Surface.ROTATION_0
        }
        synchronized(stateLock) {
            if (displayRotation == normalized) return
            displayRotation = normalized
            lastGyroTimestampNs = 0L
            accumRelDx = 0.0
            accumRelDy = 0.0
            hasClickAnchor = false
            oneEuroFilter.reset()
            if (hasRawRotationMatrix) {
                hasRotationMatrix = remapRawMatrixLocked()
                if (desiredMode == MODE_ABSOLUTE) {
                    hasCalibration = false
                    pendingRecenter = true
                }
            }
        }
    }

    fun setConfig(rawMode: String, rawSensitivity: Double) {
        val normalizedMode = when (rawMode.trim().lowercase()) {
            MODE_RELATIVE -> MODE_RELATIVE
            MODE_ABSOLUTE -> MODE_ABSOLUTE
            else -> MODE_OFF
        }
        val clampedSens = if (rawSensitivity.isFinite()) {
            rawSensitivity.coerceIn(0.2, 5.0)
        } else {
            1.0
        }

        var stateToReport: String? = null
        synchronized(stateLock) {
            val modeChanged = normalizedMode != desiredMode
            desiredMode = normalizedMode
            sensitivity = clampedSens

            if (modeChanged) {
                lastGyroTimestampNs = 0L
                accumRelDx = 0.0
                accumRelDy = 0.0
                hasClickAnchor = false
                oneEuroFilter.reset()
                when (normalizedMode) {
                    MODE_OFF -> {
                        clutchEngaged = false
                        stateToReport = reportStateLocked(MODE_OFF)
                    }
                    MODE_RELATIVE -> {
                        clutchEngaged = false
                        stateToReport = if (gyroSensor == null || rotationSensor == null) {
                            reportStateLocked("unavailable")
                        } else {
                            reportStateLocked("active")
                        }
                    }
                    MODE_ABSOLUTE -> {
                        // Start live upon entering absolute mode; setClutch(false) can pause/resume
                        clutchEngaged = true
                        pendingRecenter = !hasCalibration
                        stateToReport = if (rotationSensor == null) {
                            reportStateLocked("unavailable")
                        } else {
                            reportStateLocked("active")
                        }
                    }
                }
            }
            updateSensorRegistrationLocked()
        }
        stateToReport?.let(onGyroStateChanged)
    }

    fun setClutch(engaged: Boolean) {
        var flushDx = 0f
        var flushDy = 0f
        var shouldFlush = false
        var stateToReport: String? = null

        synchronized(stateLock) {
            if (clutchEngaged == engaged) return
            clutchEngaged = engaged
            // Always reset time baseline on clutch transition so paused intervals are never integrated
            lastGyroTimestampNs = 0L
            hasClickAnchor = false
            oneEuroFilter.resetTimestamp()

            if (!engaged) {
                if (desiredMode == MODE_RELATIVE && (accumRelDx != 0.0 || accumRelDy != 0.0)) {
                    flushDx = accumRelDx.toFloat()
                    flushDy = accumRelDy.toFloat()
                    shouldFlush = true
                }
                accumRelDx = 0.0
                accumRelDy = 0.0
            } else if (desiredMode != MODE_OFF) {
                stateToReport = reportStateLocked("active")
            }
            updateSensorRegistrationLocked()
        }

        if (shouldFlush) {
            arbiter.sendGyroRelative(flushDx, flushDy, WireFrameCodec.nowSampleTimeUs())
        }
        stateToReport?.let(onGyroStateChanged)
    }

    fun recenter() {
        var stateToReport: String? = null
        var calibratedImmediately: Boolean

        synchronized(stateLock) {
            hasClickAnchor = false
            oneEuroFilter.reset()
            if (hasRotationMatrix) {
                calibratedImmediately = captureCalibrationFromCurrentMatrixLocked()
                pendingRecenter = !calibratedImmediately
                stateToReport = reportStateLocked(
                    if (calibratedImmediately) "active" else "vertical_guard"
                )
            } else {
                pendingRecenter = true
                stateToReport = reportStateLocked("active")
            }
        }

        onRecenterHaptic()
        stateToReport?.let(onGyroStateChanged)
    }

    fun onAuthChanged(authorized: Boolean) {
        synchronized(stateLock) {
            if (sessionAuthorized == authorized) return
            sessionAuthorized = authorized
            if (!authorized) {
                if (desiredMode == MODE_RELATIVE) {
                    clutchEngaged = false
                }
                lastGyroTimestampNs = 0L
                accumRelDx = 0.0
                accumRelDy = 0.0
                hasClickAnchor = false
                oneEuroFilter.resetTimestamp()
            }
            updateSensorRegistrationLocked()
        }
    }

    fun onPause() {
        synchronized(stateLock) {
            activityResumed = false
            if (desiredMode == MODE_RELATIVE) {
                clutchEngaged = false
            }
            lastGyroTimestampNs = 0L
            accumRelDx = 0.0
            accumRelDy = 0.0
            hasClickAnchor = false
            oneEuroFilter.resetTimestamp()
            updateSensorRegistrationLocked()
        }
    }

    fun onResume() {
        synchronized(stateLock) {
            activityResumed = true
            lastGyroTimestampNs = 0L
            oneEuroFilter.resetTimestamp()
            updateSensorRegistrationLocked()
        }
    }

    fun destroy() {
        synchronized(stateLock) {
            desiredMode = MODE_OFF
            clutchEngaged = false
            activityResumed = false
            sessionAuthorized = false
            updateSensorRegistrationLocked()
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_GAME_ROTATION_VECTOR,
            Sensor.TYPE_ROTATION_VECTOR -> handleRotationVector(event)
            Sensor.TYPE_GYROSCOPE -> handleGyroscope(event)
        }
    }

    private fun remapRawMatrixLocked(): Boolean {
        return when (displayRotation) {
            Surface.ROTATION_90 -> SensorManager.remapCoordinateSystem(
                rawRotMatrix,
                SensorManager.AXIS_Y,
                SensorManager.AXIS_MINUS_X,
                rotMatrix
            )
            Surface.ROTATION_180 -> SensorManager.remapCoordinateSystem(
                rawRotMatrix,
                SensorManager.AXIS_MINUS_X,
                SensorManager.AXIS_MINUS_Y,
                rotMatrix
            )
            Surface.ROTATION_270 -> SensorManager.remapCoordinateSystem(
                rawRotMatrix,
                SensorManager.AXIS_MINUS_Y,
                SensorManager.AXIS_X,
                rotMatrix
            )
            else -> SensorManager.remapCoordinateSystem(
                rawRotMatrix,
                SensorManager.AXIS_X,
                SensorManager.AXIS_Y,
                rotMatrix
            )
        }
    }

    private fun handleRotationVector(event: SensorEvent) {
        var sendAbs = false
        var outU = 0f
        var outV = 0f
        var sampleTimeUs = 0L
        var stateToReport: String? = null

        synchronized(stateLock) {
            SensorManager.getRotationMatrixFromVector(rawRotMatrix, event.values)
            hasRawRotationMatrix = true
            hasRotationMatrix = remapRawMatrixLocked()
            if (!hasRotationMatrix) return

            if (pendingRecenter || (!hasCalibration && desiredMode == MODE_ABSOLUTE)) {
                if (captureCalibrationFromCurrentMatrixLocked()) {
                    pendingRecenter = false
                    hasClickAnchor = false
                    oneEuroFilter.reset()
                } else {
                    stateToReport = reportStateLocked("vertical_guard")
                    // Wait for valid non-vertical attitude before projecting
                }
            }

            if (desiredMode == MODE_ABSOLUTE && clutchEngaged && sessionAuthorized && hasCalibration) {
                // Current pointing ray in world coords: d = R_S * f_S where f_S = (0, 1, 0) -> 2nd column of R_S
                val dx = rotMatrix[1].toDouble()
                val dy = rotMatrix[4].toDouble()
                val dz = rotMatrix[7].toDouble()
                val dNorm = sqrt(dx * dx + dy * dy + dz * dz)
                if (dNorm > 1e-6) {
                    val rx = dx / dNorm
                    val ry = dy / dNorm
                    val rz = dz / dNorm

                    val projX = rx * r0x + ry * r0y + rz * r0z
                    val projY = rx * u0x + ry * u0y + rz * u0z
                    val projZ = rx * f0x + ry * f0y + rz * f0z

                    if (projZ <= ABS_MIN_FORWARD_Z) {
                        hasClickAnchor = false
                        oneEuroFilter.resetTimestamp()
                        stateToReport = reportStateLocked("out_of_bounds")
                    } else {
                        stateToReport = reportStateLocked("active")
                        // Scale FOV slightly with user sensitivity while keeping exact 25 deg at sensitivity == 1.0
                        val sensScale = sensitivity.coerceIn(0.4, 2.5)
                        val tanThetaH = TAN_THETA_H_BASE / sensScale
                        val tanThetaV = ASPECT_H_OVER_W * tanThetaH

                        val rawU = (0.5 + projX / (2.0 * projZ * tanThetaH)).coerceIn(0.0, 1.0)
                        val rawV = (0.5 - projY / (2.0 * projZ * tanThetaV)).coerceIn(0.0, 1.0)

                        val inClickStabilize = SystemClock.elapsedRealtimeNanos() < clickStabilizeUntilNs
                        val effectiveRawU: Double
                        val effectiveRawV: Double
                        var freezeAnchor = false

                        if (inClickStabilize) {
                            if (!hasClickAnchor) {
                                anchorRx = rx
                                anchorRy = ry
                                anchorRz = rz
                                anchorU = rawU
                                anchorV = rawV
                                hasClickAnchor = true
                            }
                            val dot = (rx * anchorRx + ry * anchorRy + rz * anchorRz).coerceIn(-1.0, 1.0)
                            if (dot >= COS_2_5_DEG) {
                                // Ray shift < 2.5 deg during click pulse: heavily damp so cursor stays dead-on target
                                effectiveRawU = anchorU + CLICK_STABILIZE_ABS_BLEND * (rawU - anchorU)
                                effectiveRawV = anchorV + CLICK_STABILIZE_ABS_BLEND * (rawV - anchorV)
                                freezeAnchor = true
                            } else {
                                effectiveRawU = rawU
                                effectiveRawV = rawV
                            }
                        } else {
                            effectiveRawU = rawU
                            effectiveRawV = rawV
                        }

                        val (filtU, filtV) = oneEuroFilter.filter(effectiveRawU, effectiveRawV, event.timestamp)
                        if (!freezeAnchor) {
                            anchorRx = rx
                            anchorRy = ry
                            anchorRz = rz
                            anchorU = filtU
                            anchorV = filtV
                            hasClickAnchor = true
                        }

                        val nowUs = WireFrameCodec.nowSampleTimeUs()
                        if (nowUs - lastAbsSendTimeUs >= MIN_ABS_SEND_INTERVAL_US) {
                            lastAbsSendTimeUs = nowUs
                            outU = filtU.toFloat()
                            outV = filtV.toFloat()
                            sampleTimeUs = nowUs
                            sendAbs = true
                        }
                    }
                }
            }
        }

        if (sendAbs) {
            arbiter.sendGyroAbsolute(outU, outV, sampleTimeUs)
        }
        stateToReport?.let(onGyroStateChanged)
    }

    private fun handleGyroscope(event: SensorEvent) {
        var sendRel = false
        var outDx = 0f
        var outDy = 0f
        var sampleTimeUs = 0L
        var stateToReport: String? = null

        synchronized(stateLock) {
            if (desiredMode != MODE_RELATIVE || !clutchEngaged || !sessionAuthorized || !hasRotationMatrix) {
                lastGyroTimestampNs = 0L
                return
            }

            // World up in screen frame S: u_S = R_S^T * (0, 0, 1) = third row of R_S
            val ux = rotMatrix[6].toDouble()
            val uy = rotMatrix[7].toDouble()
            val uz = rotMatrix[8].toDouble()

            // With pointing axis f_S = (0, 1, 0):
            // f_S x u_S = (uz, 0, -ux), norm h = hypot(uz, ux)
            val h = hypot(uz, ux)
            if (h < SIN_15_DEG) {
                // Within 15 deg of world vertical: pause cleanly without switching axes
                lastGyroTimestampNs = 0L
                accumRelDx = 0.0
                accumRelDy = 0.0
                stateToReport = reportStateLocked("vertical_guard")
            } else {
                stateToReport = reportStateLocked("active")

                val prevNs = lastGyroTimestampNs
                lastGyroTimestampNs = event.timestamp
                if (prevNs != 0L) {
                    val dt = (event.timestamp - prevNs) * 1e-9
                    if (dt > 0.0 && dt <= MAX_SENSOR_DT_S) {
                        // Orthonormal tangent basis orthogonal to f_S = (0, 1, 0):
                        // r_S = (uz / h, 0, -ux / h)  (view-right)
                        // p_S = r_S x f_S = (ux / h, 0, uz / h)  (view-up)
                        val rDx = uz / h
                        val rDz = -ux / h
                        val pDx = ux / h
                        val pDz = uz / h

                        // Transform raw device gyroscope vector (wx, wy, wz)_D into display screen basis S
                        // matching SensorManager.remapCoordinateSystem for ROTATION_0 / 90 / 180 / 270.
                        // Note: wyScreen (around pointing axis f_S = (0, 1, 0)) has zero dot product with r_S and p_S!
                        val rawWx = event.values[0].toDouble()
                        val rawWy = event.values[1].toDouble()
                        val rawWz = event.values[2].toDouble()

                        val wxScreen = when (displayRotation) {
                            Surface.ROTATION_90 -> -rawWy
                            Surface.ROTATION_180 -> -rawWx
                            Surface.ROTATION_270 -> rawWy
                            else -> rawWx
                        }
                        val wzScreen = rawWz

                        // Tangential angular velocities: a_x right, a_y up
                        val ax = -(wxScreen * pDx + wzScreen * pDz)
                        val ay = (wxScreen * rDx + wzScreen * rDz)

                        val s = hypot(ax, ay)
                        if (s > REL_DEADZONE_RAD_S) {
                            val b = max(0.0, s - REL_DEADZONE_RAD_S)
                            val b2 = b * b
                            val w02 = REL_W0 * REL_W0
                            val gain = (REL_K0 + (REL_K1 - REL_K0) * (b2 / (b2 + w02))) * sensitivity
                            var step = gain * b * dt

                            if (SystemClock.elapsedRealtimeNanos() < clickStabilizeUntilNs) {
                                val clickScale = when {
                                    s < CLICK_STABILIZE_REL_MAX_RAD_S -> CLICK_STABILIZE_REL_SCALE
                                    s < CLICK_STABILIZE_REL_RAMP_END_RAD_S -> {
                                        val t = (s - CLICK_STABILIZE_REL_MAX_RAD_S) /
                                            (CLICK_STABILIZE_REL_RAMP_END_RAD_S - CLICK_STABILIZE_REL_MAX_RAD_S)
                                        CLICK_STABILIZE_REL_SCALE + (1.0 - CLICK_STABILIZE_REL_SCALE) * t
                                    }
                                    else -> 1.0
                                }
                                step *= clickScale
                            }

                            accumRelDx += step * (ax / s)
                            accumRelDy += step * (-ay / s)

                            val nowUs = WireFrameCodec.nowSampleTimeUs()
                            if (nowUs - lastRelSendTimeUs >= MIN_REL_SEND_INTERVAL_US) {
                                val dxF = accumRelDx.toFloat()
                                val dyF = accumRelDy.toFloat()
                                if (dxF != 0f || dyF != 0f) {
                                    accumRelDx = 0.0
                                    accumRelDy = 0.0
                                    lastRelSendTimeUs = nowUs
                                    outDx = dxF
                                    outDy = dyF
                                    sampleTimeUs = nowUs
                                    sendRel = true
                                }
                            }
                        }
                    }
                }
            }
        }

        if (sendRel) {
            arbiter.sendGyroRelative(outDx, outDy, sampleTimeUs)
        }
        stateToReport?.let(onGyroStateChanged)
    }

    /**
     * Captures f_0 = R_0 * f_S, r_0 = normalize(f_0 x U), u_0 = r_0 x f_0 in world coordinates.
     * Returns false if f_0 is within 15 degrees of world vertical U = (0, 0, 1).
     */
    private fun captureCalibrationFromCurrentMatrixLocked(): Boolean {
        val rawFx = rotMatrix[1].toDouble()
        val rawFy = rotMatrix[4].toDouble()
        val rawFz = rotMatrix[7].toDouble()
        val fNorm = sqrt(rawFx * rawFx + rawFy * rawFy + rawFz * rawFz)
        if (fNorm < 1e-6) return false

        val fx = rawFx / fNorm
        val fy = rawFy / fNorm
        val fz = rawFz / fNorm

        // f_0 x U = (fx, fy, fz) x (0, 0, 1) = (fy, -fx, 0)
        val horizNorm = hypot(fy, fx)
        if (horizNorm < SIN_15_DEG) {
            return false
        }

        val rx = fy / horizNorm
        val ry = -fx / horizNorm
        val rz = 0.0

        // u_0 = r_0 x f_0
        val ux = ry * fz - rz * fy
        val uy = rz * fx - rx * fz
        val uz = rx * fy - ry * fx

        f0x = fx
        f0y = fy
        f0z = fz
        r0x = rx
        r0y = ry
        r0z = rz
        u0x = ux
        u0y = uy
        u0z = uz
        hasCalibration = true
        return true
    }

    private fun updateSensorRegistrationLocked() {
        val shouldRun = activityResumed && sessionAuthorized && desiredMode != MODE_OFF
        if (shouldRun && !sensorsRegistered) {
            var anyRegistered = false
            rotationSensor?.let {
                anyRegistered = sensorManager.registerListener(
                    this,
                    it,
                    SensorManager.SENSOR_DELAY_GAME
                ) || anyRegistered
            }
            if (desiredMode == MODE_RELATIVE) {
                gyroSensor?.let {
                    anyRegistered = sensorManager.registerListener(
                        this,
                        it,
                        SensorManager.SENSOR_DELAY_GAME
                    ) || anyRegistered
                }
            }
            sensorsRegistered = anyRegistered
        } else if (shouldRun && sensorsRegistered && desiredMode == MODE_RELATIVE && gyroSensor != null) {
            // Ensure gyroscope listener is active if switching from absolute -> relative while already registered
            sensorManager.registerListener(this, gyroSensor, SensorManager.SENSOR_DELAY_GAME)
        } else if (!shouldRun && sensorsRegistered) {
            sensorManager.unregisterListener(this)
            sensorsRegistered = false
            hasRawRotationMatrix = false
            hasRotationMatrix = false
            lastGyroTimestampNs = 0L
        }
    }

    private fun reportStateLocked(next: String): String? {
        if (next == lastReportedState) return null
        lastReportedState = next
        return next
    }
}

/**
 * 2D Shared-Cutoff One-Euro Filter operating on normalized [0, 1] screen coordinates.
 */
private class SharedOneEuroFilter2D(
    private val fMin: Double,
    private val beta: Double,
    private val dCutoff: Double
) {
    private var initialized: Boolean = false
    private var lastTimestampNs: Long = 0L
    private var prevRawX: Double = 0.5
    private var prevRawY: Double = 0.5
    private var xHat: Double = 0.5
    private var yHat: Double = 0.5
    private var dxHat: Double = 0.0
    private var dyHat: Double = 0.0

    fun reset() {
        initialized = false
        lastTimestampNs = 0L
        dxHat = 0.0
        dyHat = 0.0
    }

    fun resetTimestamp() {
        lastTimestampNs = 0L
    }

    fun filter(rawX: Double, rawY: Double, timestampNs: Long): Pair<Double, Double> {
        if (!initialized) {
            initialized = true
            lastTimestampNs = timestampNs
            prevRawX = rawX
            prevRawY = rawY
            xHat = rawX
            yHat = rawY
            dxHat = 0.0
            dyHat = 0.0
            return xHat to yHat
        }

        if (lastTimestampNs == 0L) {
            lastTimestampNs = timestampNs
            prevRawX = rawX
            prevRawY = rawY
            return xHat to yHat
        }

        val dt = (timestampNs - lastTimestampNs) * 1e-9
        lastTimestampNs = timestampNs
        if (dt <= 1e-6 || dt > 0.25) {
            prevRawX = rawX
            prevRawY = rawY
            xHat = rawX
            yHat = rawY
            dxHat = 0.0
            dyHat = 0.0
            return xHat to yHat
        }

        val dx = (rawX - prevRawX) / dt
        val dy = (rawY - prevRawY) / dt
        prevRawX = rawX
        prevRawY = rawY

        val alphaD = smoothingAlpha(dCutoff, dt)
        dxHat = alphaD * dx + (1.0 - alphaD) * dxHat
        dyHat = alphaD * dy + (1.0 - alphaD) * dyHat

        val speed = hypot(dxHat, dyHat)
        val fc = fMin + beta * speed
        val alphaX = smoothingAlpha(fc, dt)

        xHat = (alphaX * rawX + (1.0 - alphaX) * xHat).coerceIn(0.0, 1.0)
        yHat = (alphaX * rawY + (1.0 - alphaX) * yHat).coerceIn(0.0, 1.0)
        return xHat to yHat
    }

    private fun smoothingAlpha(cutoffHz: Double, dtSeconds: Double): Double {
        val tau = 2.0 * PI * cutoffHz * dtSeconds
        return tau / (1.0 + tau)
    }
}
