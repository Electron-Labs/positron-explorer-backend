'use strict';

const Koa = require('koa');
const body = require('koa-bodyparser');
const cors = require('@koa/cors');

const router = require('./router');
const app = new Koa();

const args = require('yargs').argv;
const network = args.network

app.use(body());

app.context.cache = {};

app.use(cors({ origin: '*' }));
app.use(router.routes());
app.use(router.allowedMethods());

let port
if (network == "testnet") port = 5001;
else if (network == "mainnet") port = 5002;
else throw new Error('Bad `network` argument!');

app.listen(port);
console.log(`> ${network} watcher running! (:${port})`);