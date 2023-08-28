-- CreateEnum
CREATE TYPE "Action" AS ENUM ('Lock', 'Unlock');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('Completed', 'Pending', 'Failed');

-- CreateTable
CREATE TABLE "eth_near" (
    "nonce" BIGINT NOT NULL,
    "sourceTime" TIMESTAMP(3),
    "destinationTime" TIMESTAMP(3),
    "senderAddress" VARCHAR(66),
    "sourceTx" VARCHAR(66),
    "receiverAddress" VARCHAR(66),
    "destinationTx" VARCHAR(66),
    "sourceAmount" BIGINT,
    "destinationAmount" BIGINT,
    "action" "Action" NOT NULL,
    "tokenAddressSource" VARCHAR(66),
    "tokenAddressDestination" VARCHAR(66),
    "status" "Status" NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "eth_near_nonce_action_key" ON "eth_near"("nonce", "action");
