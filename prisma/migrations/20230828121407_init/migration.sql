/*
  Warnings:

  - You are about to drop the column `tokenAddressDestination` on the `eth_near` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "eth_near" DROP COLUMN "tokenAddressDestination";
