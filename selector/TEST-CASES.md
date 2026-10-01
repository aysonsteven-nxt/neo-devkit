# Selector Test Cases

## Android/Kotlin project
Expected: Android, Kotlin, Gradle, and optional Compose/Room/Hilt signals.
`android-kotlin-dev` should receive the strongest matching technical evidence.

## Java/Spring project
Expected: Java, Spring Boot, Maven/Gradle and REST signals where present.
`java-dev` should receive the strongest matching technical evidence.

## Empty project
The selector must not invent technologies.
