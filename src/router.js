'use strict';

const Router = require('koa-router');
const router = new Router();
const { listTransactionsEndPoint, transactionEndPoint } = require('./');
const args = require('yargs').argv;
const network = args.network

const noop = require('./watcher/noop');

router.get(`/`, noop);
router.get(`/list_transactions/`, listTransactionsEndPoint)
router.get(`/transaction/`, transactionEndPoint)


module.exports = router;