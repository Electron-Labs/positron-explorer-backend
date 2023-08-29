const { PrismaClient } = require('@prisma/client')
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

BigInt.prototype.toJSON = function () { return this.toString() }

const sleep = (duration) => new Promise((resolve, reject) => setTimeout(resolve, duration));

const TOKEN_ADDRESS = {
    "0xc5bbAC81754d2CCfDdE030f6aEA05d881752f2f8": "electron-zkusdc.admin_electronlabs.testnet",
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": "zk-usdc.zkrouter.near"
}

const getEmptyData = () => {
    return {
        nonce: undefined,
        sourceTime: undefined,
        destinationTime: undefined,
        senderAddress: undefined,
        receiverAddress: undefined,
        sourceTx: undefined,
        destinationTx: undefined,
        sourceAmount: undefined,
        destinationAmount: undefined,
        action: undefined,
        tokenAddressSource: undefined,
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

const getPrisma = (network) => {
    return new PrismaClient({
        datasources: {
            db: {
                url: `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${network}?schema=public`
            },
        },
    })
}

const getRangesFromNumbers = (...numbers) => {
    ranges = []
    numbers.forEach((number) => ranges.push({ fromBlock: number, toBlock: number }))
    return ranges
}

const myFormat = winston.format.printf(({ level, message, timestamp }) => {
    return `${timestamp} ${level.toUpperCase()}: ${message}`;
});

const getLogger = (network) => {
    const logger = winston.createLogger({
        format: winston.format.combine(
            winston.format.timestamp(),
            myFormat
        ),
        transports: [
            new DailyRotateFile({
                dirname: `logs/eth_near_${network}_logs`,
                maxSize: '10k',
                maxFiles: '4d',
            }),
        ],
        level: "info"
    });
    return logger
}

module.exports = { TOKEN_ADDRESS, sleep, getEmptyData, retry, getPrisma, getRangesFromNumbers, getLogger }