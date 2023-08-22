BigInt.prototype.toJSON = function () { return this.toString() }

const sleep = (duration) => new Promise((resolve, reject) => setTimeout(resolve, duration));

const getEmptyData = () => {
    return {
        nonce: undefined,
        sourceTime: undefined,
        destinationTime: undefined,
        senderAddress: undefined,
        receiverAddress: undefined,
        sourceTx: undefined,
        destinationTx: undefined,
        amount: undefined,
        action: undefined,
        tokenAddressSource: undefined,
        status: undefined
    }
}

async function retry(fn, ...args) {
    let r, e;
    for (let i = 0; i < 5; i++) {
        try {
            r = await fn(...args);
            return r;
        } catch (err) {
            e = err;
            await sleep(1000);
        }
    }
    throw e;
}

module.exports = { sleep, getEmptyData, retry }