import fs from 'node:fs';
import path from 'node:path';
import Koa from 'koa';

import { IO } from '../src/index.ts';

const app = new Koa();
const io = new IO<
  Koa.DefaultState,
  {
    teststring?: string;
    id?: string;
  }
>();
const chat = new IO('chat');

io.attach(app);
chat.attach(app);

/**
 * Koa Middlewares
 */
app.use(async (ctx, next) => {
  const start = new Date();
  await next();
  const ms = Date.now() - start.getTime();
  console.log(`${ctx.method} ${ctx.url} - ${ms}ms`);
});

/**
 * App handlers
 */
app.use((ctx) => {
  ctx.type = 'text/html';
  ctx.body = fs.createReadStream(path.join(__dirname, 'index.html'));
});

/**
 * Socket middlewares
 */
io.use(async (_ctx, next) => {
  console.log('Socket middleware');
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`WS ${ms}ms`);
});

io.use(async (ctx, next) => {
  ctx.teststring = 'test';
  await next();
});

/**
 * Socket handlers
 */
io.on('connection', async (ctx) => {
  console.log('Join event', ctx.id);
  io.broadcast('connections', {
    numConnections: io.connections.size,
  });

  ctx.on('disconnect', () => {
    console.log('leave event', ctx.id);
    io.broadcast('connections', {
      numConnections: io.connections.size,
    });
  });
});

io.on('data', async (ctx, data) => {
  console.log('data event', data);
  console.log('ctx:', ctx.event, ctx.data, ctx.id);
  console.log('ctx.teststring:', ctx.teststring);
  ctx.socket.emit('response', {
    message: 'response from server',
  });
});

io.on('ack', async (ctx, data) => {
  console.log('data event with acknowledgement', data);
  ctx.acknowledge('received');
});

io.on('numConnections', async (_packet) => {
  console.log(`Number of connections: ${io.connections.size}`);
});

/**
 * Chat handlers
 */
chat.on('connection', async (ctx) => {
  console.log('Joining chat namespace', ctx.id);
});

chat.on('message', async (ctx) => {
  console.log('chat message received', ctx.data);

  // Broadcasts to everybody, including this connection
  (app as unknown as { chat: typeof io }).chat.broadcast('message', 'yo connections, lets chat');

  // Broadcasts to all other connections
  ctx.socket.broadcast.emit('message', 'ok connections:chat:broadcast');

  // Emits to just this socket
  ctx.socket.emit('message', 'ok connections:chat:emit');
});

chat.use(async (ctx, next) => {
  ctx.teststring = 'chattest';
  console.log('ctx.socket =>');
  console.dir(ctx.socket, { colors: true, depth: 2 });
  console.log('ctx.socket.nsp =>', ctx.socket.nsp);
  await next();
});

const PORT = 3000;
app.listen(3000, () => {
  console.log(`Listening on ${PORT}`);
});
