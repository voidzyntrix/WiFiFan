import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
}

// The app's version: the shared app's (web/package.json), so Android, Windows and the web build
// always carry the same number. The in-app updater compares it with the newest
// wififan-app-<version>.apk on GitHub.
val appVersion: String = Regex(""""version"\s*:\s*"(\d+\.\d+\.\d+)"""")
    .find(rootProject.file("web/package.json").readText())!!.groupValues[1]

// Release signing: keystore.properties in the project root (local builds) or
// WIFIFAN_* environment variables (GitHub Actions). See docs/APP_UPDATES.md.
val keystoreProps = Properties().apply {
    rootProject.file("keystore.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}
fun signingValue(key: String, env: String): String? =
    keystoreProps.getProperty(key) ?: System.getenv(env)?.takeIf { it.isNotEmpty() }
val releaseKeystore = signingValue("storeFile", "WIFIFAN_KEYSTORE_FILE")

android {
    namespace = "io.github.voidqubex.wifi_fan"
    compileSdk {
        version = release(36)
    }

    defaultConfig {
        applicationId = "io.github.voidqubex.wifi_fan"
        minSdk = 31
        targetSdk = 36
        // 1.2.3 -> 10203; Android only installs an update with a higher versionCode.
        versionCode = appVersion.split('.').map { it.toInt() }
            .let { (major, minor, patch) -> major * 10000 + minor * 100 + patch }
        versionName = appVersion
    }

    signingConfigs {
        if (releaseKeystore != null) {
            create("release") {
                storeFile = rootProject.file(releaseKeystore)
                storePassword = signingValue("storePassword", "WIFIFAN_KEYSTORE_PASSWORD")
                keyAlias = signingValue("keyAlias", "WIFIFAN_KEY_ALIAS")
                keyPassword = signingValue("keyPassword", "WIFIFAN_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            // Unsigned without a keystore; Android Studio's "Generate Signed APK" still works.
            signingConfig = signingConfigs.findByName("release")
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    // The shared app, built by `npm run build` in web/, is served from assets/web.
    sourceSets["main"].assets.srcDir(file("build/generated/webAssets"))
    lint {
        checkReleaseBuilds = false
    }
}

// Copies web/dist (build it first: `npm ci && npm run build` in web/) into the APK's assets/web.
val copyWebAssets by tasks.registering(Copy::class) {
    val dist = rootProject.file("web/dist")
    doFirst {
        if (!dist.resolve("index.html").exists()) {
            throw GradleException("web/dist is missing: run `npm ci && npm run build` in web/ first")
        }
    }
    from(dist)
    into(file("build/generated/webAssets/web"))
}
tasks.named("preBuild") { dependsOn(copyWebAssets) }

dependencies {
    implementation(libs.androidx.webkit)
}
