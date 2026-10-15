package io.github.voidqubex.wifi_fan.solar

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.io.IOException

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35])
class FoxEssClientTest {
    @Test fun md5OfAKnownString() {
        assertEquals("900150983cd24fb0d6963f7d28e17f72", FoxEssClient.md5Hex("abc"))
    }

    @Test fun signatureIsMd5OfPathTokenAndTimestampSeparatedByCrLf() {
        val expected = FoxEssClient.md5Hex("/op/v0/device/list" + "\r\n" + "KEY" + "\r\n" + "1700000000000")
        assertEquals(expected, FoxEssClient.signature("/op/v0/device/list", "KEY", 1_700_000_000_000L))
    }

    private fun datas(vararg pairs: Pair<String, Double>) =
        pairs.joinToString(",") { """{"variable":"${it.first}","unit":"kW","name":"x","value":${it.second},"time":"t"}""" }

    private fun answer(inner: String) =
        """{"errno":0,"msg":"success","result":[{"deviceSN":"SN1","datas":[$inner]}]}"""

    @Test fun readingFromTheRealTimeAnswer() {
        val r = FoxEssClient.parseReading(
            answer(
                datas(
                    "pvPower" to 2.4, "gridConsumptionPower" to 0.3, "feedinPower" to 0.0,
                    "loadsPower" to 1.1, "SoC" to 82.0, "runningState" to 163.0, "currentFaultCount" to 0.0
                )
            )
        )
        assertEquals(0.3f, r.gridKw, 0.001f)
        assertEquals(82f, r.socPercent!!, 0.001f)
        assertEquals(2.4f, r.pvKw, 0.001f)
        assertEquals(1.1f, r.loadKw, 0.001f)
        assertFalse(r.fault)
    }

    @Test fun exportingIsNegativeGrid() {
        val r = FoxEssClient.parseReading(answer(datas("gridConsumptionPower" to 0.0, "feedinPower" to 1.7)))
        assertEquals(-1.7f, r.gridKw, 0.001f)
    }

    @Test fun noBatteryMeansNoSoc() {
        val r = FoxEssClient.parseReading(answer(datas("pvPower" to 1.0)))
        assertNull(r.socPercent)
    }

    @Test fun offGridIsRunningState164() {
        assertTrue(FoxEssClient.parseReading(answer(datas("runningState" to 164.0))).offGrid)
        assertFalse(FoxEssClient.parseReading(answer(datas("runningState" to 163.0))).offGrid)
        assertFalse(FoxEssClient.parseReading(answer(datas("pvPower" to 1.0))).offGrid)
    }

    @Test fun faultsAreRecognised() {
        assertTrue(FoxEssClient.parseReading(answer(datas("currentFaultCount" to 2.0))).fault)
        assertTrue(FoxEssClient.parseReading(answer(datas("runningState" to 165.0))).fault)
        assertFalse(FoxEssClient.parseReading(answer(datas("runningState" to 163.0))).fault)
    }

    @Test fun anErrorAnswerSaysWhatIsWrong() {
        try {
            FoxEssClient.parseReading("""{"errno":40256,"msg":"illegal signature"}""")
            fail("expected an IOException")
        } catch (e: IOException) {
            assertTrue(e.message!!, e.message!!.contains("API key"))
        }
    }

    @Test fun devicesFromTheListAnswer() {
        val list = FoxEssClient.parseDevices(
            """{"errno":0,"result":{"currentPage":1,"pageSize":10,"total":1,"data":[
               {"deviceSN":"SN1","moduleSN":"M1","stationID":"S","stationName":"Home","status":1,"hasPV":true,"hasBattery":true}]}}"""
        )
        assertEquals(1, list.size)
        assertEquals("SN1", list[0].serial)
        assertEquals("Home", list[0].name)
        assertEquals(1, list[0].status)
    }
}
