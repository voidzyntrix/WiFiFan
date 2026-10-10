package io.github.voidqubex.wifi_fan.ota

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** A firmware build attached to a GitHub release. */
typealias FirmwareRelease = ReleaseAsset

/**
 * Finds board firmware in this repo's GitHub Releases.
 *
 * Convention: a release has an asset named `wififan-fw-<major>.<minor>.<patch>.bin`
 * (made by the firmware project's tools/make_fw_release.sh). The newest version
 * across all releases wins; drafts and pre-releases are ignored.
 */
object FirmwareRepository {
    private val ASSET_NAME = Regex("""wififan-fw-(\d+\.\d+\.\d+)\.bin""")

    /** Must match the board's bootloader: app slot size and link address. */
    const val APP_MAX = 56 * 1024
    private const val APP_BASE = 0x2000

    suspend fun latest(): FirmwareRelease? = GitHubReleases.newest(ASSET_NAME)

    /** Downloads the image and checks it fits the board; throws with a readable message if not. */
    suspend fun download(release: FirmwareRelease): ByteArray = withContext(Dispatchers.IO) {
        val image = GitHubReleases.get(release.downloadUrl, limit = APP_MAX + 1)
        validate(image)?.let { throw IOException(it) }
        image
    }

    /** null if the image can be flashed, otherwise why not. */
    fun validate(image: ByteArray): String? {
        if (image.size < 8) return "Firmware file is empty"
        if (image.size > APP_MAX) return "Firmware is ${image.size} bytes, the board holds $APP_MAX"
        // Word 1 is the vector table's _start entry = the address the image was linked for.
        val base = ByteBuffer.wrap(image, 4, 4).order(ByteOrder.LITTLE_ENDIAN).int
        if (base != APP_BASE) {
            return "Firmware is built for address 0x%x, not 0x%x (bootloader layout)".format(base, APP_BASE)
        }
        return null
    }
}
