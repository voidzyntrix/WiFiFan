import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.roborazzi)
}

// The app's version. Bump it for every release; the in-app updater compares it
// with the newest wififan-app-<version>.apk on GitHub.
val appVersion = "1.18.3"

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

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
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
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
    }
    // Screenshot tests (Robolectric + Roborazzi) need the merged resources.
    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
    // Release lint doubles the CI build time; run it on demand with ./gradlew lint.
    lint {
        checkReleaseBuilds = false
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    testImplementation(libs.junit)
    testImplementation(libs.androidx.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.roborazzi)
    testImplementation(libs.roborazzi.compose)
    testImplementation(libs.roborazzi.junit.rule)
    testImplementation(platform(libs.androidx.compose.bom))
    testImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

}
