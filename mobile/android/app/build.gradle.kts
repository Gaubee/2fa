import org.gradle.api.GradleException

plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "com.gaubee.twofa"
  compileSdk = 35

  defaultConfig {
    applicationId = "com.gaubee.twofa"
    minSdk = 29
    targetSdk = 35
    versionCode = 1
    versionName = "0.1.0"
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      proguardFiles(
        getDefaultProguardFile("proguard-android-optimize.txt"),
        "proguard-rules.pro",
      )
    }
  }

  buildFeatures {
    compose = true
  }

  composeOptions {
    kotlinCompilerExtensionVersion = "1.5.15"
  }

  kotlinOptions {
    jvmTarget = "17"
  }
}

val rustAndroidTargets = listOf("arm64-v8a", "armeabi-v7a", "x86_64")
val verifyRustAndroidLibs = tasks.register("verifyRustAndroidLibs") {
  doLast {
    val missingTargets = rustAndroidTargets.filter { abi ->
      !layout.projectDirectory.file("src/main/jniLibs/$abi/libgaubee_2fa_mobile_bridge.so").asFile.exists()
    }

    if (missingTargets.isNotEmpty()) {
      throw GradleException(
        "缺少 Rust Android 动态库: ${missingTargets.joinToString(", ")}。先运行 `pnpm mobile:android:rust`。",
      )
    }
  }
}

tasks.named("preBuild") {
  dependsOn(verifyRustAndroidLibs)
}

dependencies {
  val composeBom = platform("androidx.compose:compose-bom:2025.02.00")

  implementation(composeBom)
  androidTestImplementation(composeBom)

  implementation("androidx.activity:activity-compose:1.10.1")
  implementation("androidx.compose.foundation:foundation")
  implementation("androidx.compose.material3:material3")
  implementation("androidx.compose.ui:ui")
  implementation("androidx.compose.ui:ui-tooling-preview")
  implementation("net.java.dev.jna:jna:5.12.0@aar")
  debugImplementation("androidx.compose.ui:ui-tooling")
}
