# Bước 1: build plugin đọc bảng nhân viên (Java 21 + Maven, chạy trong Docker)
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY providers/nhanvien-storage/pom.xml .
RUN mvn -q -B dependency:go-offline
COPY providers/nhanvien-storage/src ./src
RUN mvn -q -B package -DskipTests

# Bước 2: Keycloak kèm plugin
FROM quay.io/keycloak/keycloak:26.4
COPY --from=build /src/target/nhanvien-storage.jar /opt/keycloak/providers/
