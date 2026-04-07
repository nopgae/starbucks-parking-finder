-- CreateEnum
CREATE TYPE "ParkingType" AS ENUM ('FREE', 'PAID', 'VALIDATION', 'UNAVAILABLE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('INCORRECT', 'OUTDATED', 'NEW_INFO');

-- CreateTable
CREATE TABLE "Store" (
    "id" SERIAL NOT NULL,
    "storeCode" TEXT NOT NULL,
    "bizCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "roadAddress" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "sido" TEXT NOT NULL,
    "sidoCode" TEXT NOT NULL,
    "gugun" TEXT NOT NULL,
    "gugunCode" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "notice" TEXT,
    "themeState" TEXT,
    "hasDriveThru" BOOLEAN NOT NULL DEFAULT false,
    "hasParking" BOOLEAN NOT NULL DEFAULT false,
    "parkingRaw" TEXT,
    "parkingType" "ParkingType" NOT NULL DEFAULT 'UNKNOWN',
    "parkCapacity" TEXT,
    "parkLocation" TEXT,
    "parkPriceRaw" TEXT,
    "parkCondition" TEXT,
    "parkPayment" TEXT,
    "parkLastVerified" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingReport" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "type" "ReportType" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParkingReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_storeCode_key" ON "Store"("storeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Store_bizCode_key" ON "Store"("bizCode");

-- CreateIndex
CREATE INDEX "Store_lat_lng_idx" ON "Store"("lat", "lng");

-- CreateIndex
CREATE INDEX "Store_sido_gugun_idx" ON "Store"("sido", "gugun");

-- CreateIndex
CREATE INDEX "Store_parkingType_idx" ON "Store"("parkingType");

-- CreateIndex
CREATE INDEX "Store_hasParking_idx" ON "Store"("hasParking");

-- CreateIndex
CREATE INDEX "ParkingReport_storeId_idx" ON "ParkingReport"("storeId");

-- AddForeignKey
ALTER TABLE "ParkingReport" ADD CONSTRAINT "ParkingReport_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
