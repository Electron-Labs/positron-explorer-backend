/*
  Warnings:

  - You are about to drop the column `originTime` on the `eth_near` table. All the data in the column will be lost.
  - You are about to drop the column `tokenAddressOrigin` on the `eth_near` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "eth_near" DROP COLUMN "originTime",
DROP COLUMN "tokenAddressOrigin",
ADD COLUMN     "sourceTime" TIMESTAMP(3),
ADD COLUMN     "tokenAddressSource" VARCHAR(64);
