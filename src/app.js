'use strict';

const Koa = require('koa');
const body = require('koa-bodyparser');

const router = require('./router');

const app = new Koa();

app.use(body());

app.context.cache = {};

app.use(router.routes());
app.use(router.allowedMethods());

const port = 5001;
app.listen(port);
console.log(`> watcher running! (:${port})`);