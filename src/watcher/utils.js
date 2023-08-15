const { keyStores, connect } = require('near-api-js');
const BN = require('bn.js')
const numberToBN = require('number-to-bn');


const numberToHex = (value) => {
    if ((value === null || value === undefined)) {
        return value;
    }

    if (!isFinite(value) && !isHexStrict(value)) {
        throw new Error('Given input "' + value + '" is not a number.');
    }

    var number = toBN(value);
    var result = number.toString(16);

    return number.lt(new BN(0)) ? '-0x' + result.slice(1) : '0x' + result;
};

const toBN = function (number) {
    try {
        return numberToBN.apply(null, arguments);
    } catch (e) {
        throw new Error(e + ' Given value: "' + number + '"');
    }
};

const isHexStrict = function (hex) {
    return ((typeof hex === 'string' || typeof hex === 'number') && /^(-)?0x[0-9a-f]*$/i.test(hex));
};

const sleep = (duration) => new Promise((resolve, reject) => setTimeout(resolve, duration));

async function createNearConnection(networkId, nodeUrl, credentialsPath) {
    let keyStore = new keyStores.UnencryptedFileSystemKeyStore(credentialsPath);
    let config = {
        keyStore,
        networkId: networkId,
        nodeUrl: nodeUrl
    }
    let near_connection = await connect(config);
    return near_connection;
}

module.exports = { numberToHex, sleep, createNearConnection }