plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "lab.palailab.coo.mobile"
    compileSdk = 35
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "lab.palailab.coo.mobile"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "0.2.0-local"
        ndk { abiFilters += "arm64-v8a" }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources.excludes += setOf("META-INF/*.kotlin_module")
        // proot 必须是磁盘上的真文件（要 exec），不能让 AGP 把 .so 留在 APK 里
        jniLibs.useLegacyPackaging = true
    }

    androidResources {
        // 素材本身已经是 gzip 包，别再让 aapt2 压一遍
        // 注意：aapt2 会把 *.gz 自动解压成同名无后缀的条目（坑），所以用 .tgz
        noCompress += "tgz"
    }
}

dependencies {
}