'use strict';

const Koa = require('koa');
const body = require('koa-bodyparser');

const router = require('./router');
const app = new Koa();

const network = process.argv[2].slice(2)

app.use(body());

app.context.cache = {};

app.use(router.routes());
app.use(router.allowedMethods());

let port
if (network == "testnet") port = 5001;
else if (network == "mainnet") port = 5002;
else throw new Error('Bad `network` argument!');

app.listen(port);
console.log(`> ${network} watcher running! (:${port})`);