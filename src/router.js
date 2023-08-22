'use strict';

const Router = require('koa-router');
const router = new Router();
const { listTransactionsEndPoint, transactionEndPoint } = require('./');
const args = require('yargs').argv;
const network = args.network

const noop = require('./watcher/noop');

router.get(`/${network}`, noop);
router.get(`/${network}/list_transactions/`, listTransactionsEndPoint)
router.get(`/${network}/transaction/`, transactionEndPoint)


module.exports = router;