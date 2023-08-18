-- CreateEnum
CREATE TYPE "Action" AS ENUM ('Lock', 'Unlock');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('Completed', 'Pending', 'Failed');

-- CreateTable
CREATE TABLE "eth_near" (
    "nonce" BIGINT NOT NULL,
    "originTime" TIMESTAMP(3),
    "destinationTime" TIMESTAMP(3),
    "senderAddress" VARCHAR(64),
    "sourceTx" VARCHAR(66),
    "receiverAddress" VARCHAR(64),
    "destinationTx" VARCHAR(66),
    "amount" BIGINT NOT NULL,
    "action" "Action" NOT NULL,
    "tokenAddressOrigin" VARCHAR(64) NOT NULL,
    "status" "Status" NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "eth_near_nonce_action_key" ON "eth_near"("nonce", "action");
