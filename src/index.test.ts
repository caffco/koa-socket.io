/* eslint-disable @typescript-eslint/no-non-null-assertion */
import 'jest';

import { createServer, Server as HTTPServer } from 'http';
import { AddressInfo } from 'net';

import { Server as SocketIOServer } from '@caff/socket.io';
import Koa from 'koa';
import SocketIOClient from 'socket.io-client';

import { IO, EnhancedKoa } from '.';

const deferredFactory = () => {
  const deferred = {} as {
    promise: Promise<void>;
    resolve: () => void;
    reject: (error: Error) => void;
  };

  deferred.promise = new Promise<void>((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });

  return deferred;
};

const testApplicationFactory = <
  ContextT extends Record<string, unknown> = Koa.DefaultContext
>() => {
  const app = new Koa<Koa.DefaultState, ContextT>();
  const socket = new IO<Koa.DefaultState, ContextT>();
  socket.attach(app);
  const server = app.listen();
  const address = server.address() as AddressInfo;

  return {
    app: (app as unknown) as EnhancedKoa<Koa.DefaultState, ContextT>,
    server,
    address,
    socket,
  };
};

const connectedClientFactory = (port: number) =>
  SocketIOClient.connect(`ws://0.0.0.0:${port}`, {
    transports: ['websocket'],
  });

const testEnvironmentFactory = <
  ContextT extends Record<string, unknown> = Koa.DefaultContext
>() => {
  const deferred = deferredFactory();
  const { app, server, address, socket } = testApplicationFactory<ContextT>();

  const client = connectedClientFactory(address.port);

  client.on('disconnect', () => {
    server.close();
    deferred.resolve();
  });

  const endTest = () => {
    client.disconnect();
  };

  return { client, server, app, socket, endTest, promise: deferred.promise };
};

const semaphoreFactory = (count: number) => {
  const deferred = deferredFactory();

  const release = () => {
    count--;

    if (count <= 0) {
      deferred.resolve();
    }
  };

  return {
    release,
    promise: deferred.promise,
  };
};

const asyncWait = (timeoutInMilliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, timeoutInMilliseconds));

describe('IO', () => {
  describe('#constructor', () => {
    it('should create a new instance when options is a string', () => {
      expect(new IO('the namespace').opts).toEqual({
        namespace: 'the namespace',
        hidden: false,
        ioOptions: {},
      });
    });

    it('should create a new instance when options is an object', () => {
      expect(
        new IO({ namespace: 'the namespace', hidden: true, ioOptions: { cookie: true } }).opts,
      ).toEqual({
        namespace: 'the namespace',
        hidden: true,
        ioOptions: { cookie: true },
      });
    });

    it('should create a new instance when options is missing', () => {
      expect(new IO().opts).toEqual({
        namespace: null,
        hidden: false,
        ioOptions: {},
      });
    });

    it('should throw an error if options are invalid', () => {
      expect(() => new IO((1 as unknown) as string)).toThrowError(
        'Incorrect argument passed to koaSocket constructor',
      );
    });
  });

  describe('#attach', () => {
    it('should add socket.io to Koa app', () => {
      const app = new Koa();
      const socket = new IO();
      expect(socket.attach(app)).toEqual(expect.any(SocketIOServer));

      expect(((app as unknown) as EnhancedKoa).io).toEqual(expect.any(IO));
      expect(((app as unknown) as EnhancedKoa).server).toBeTruthy();

      ((app as unknown) as EnhancedKoa).server!.close();
    });

    it('should not alter a koa app that already has ._io unless called with a namespace', () => {
      const app = new Koa();
      const socket = new IO();

      ((app as unknown) as EnhancedKoa)._io = ({} as unknown) as SocketIOServer;

      expect(() => socket.attach(app)).toThrowError(
        'Socket failed to initialise::Instance may already exist',
      );
    });

    it('should work with koa app that already has .server', () => {
      const app = new Koa();
      const socket = new IO();
      ((app as unknown) as EnhancedKoa).server = createServer();
      expect(socket.attach(app)).toEqual(expect.any(SocketIOServer));

      expect(((app as unknown) as EnhancedKoa).io).toEqual(expect.any(IO));

      ((app as unknown) as EnhancedKoa).server!.close();
    });

    it("shouldn't work if app.server exists but it's not an http server", () => {
      const app = new Koa();
      const socket = new IO();
      ((app as unknown) as EnhancedKoa).server = ({} as unknown) as HTTPServer;

      expect(() => socket.attach(app)).toThrowError(
        "app.server already exists but it's not an http server",
      );
    });

    it('should allow attaching a namespace to a koa app with socket.io existing', () => {
      const app = new Koa();
      const socket = new IO();
      const chat = new IO('chat');

      expect(socket.attach(app)).toEqual(expect.any(SocketIOServer));
      expect(chat.attach(app)).toHaveProperty('constructor.name', 'Namespace');

      expect(((app as unknown) as { chat: unknown }).chat).toEqual(chat);
    });

    it("should allow attaching a namespace to a 'clean' koa app", () => {
      const app = new Koa();
      const chat = new IO('chat');

      expect(chat.attach(app)).toHaveProperty('constructor.name', 'Namespace');

      expect(((app as unknown) as EnhancedKoa)._io).toEqual(expect.any(SocketIOServer));
      expect(((app as unknown) as { chat: unknown }).chat).toEqual(chat);
    });

    it('should allow manually creating the socketIO instance and attaching namespaces without a default', () => {
      const app = new Koa();
      const chat = new IO('chat');

      const server = createServer(app.callback());
      const io = new SocketIOServer(server);
      ((app as unknown) as EnhancedKoa)._io = io;

      expect(chat.attach(app)).toHaveProperty('constructor.name', 'Namespace');
    });

    it('should allow attaching a namespace should be done via an options object', () => {
      const app = new Koa();
      const chat = new IO({ namespace: 'chat' });

      expect(chat.attach(app)).toHaveProperty('constructor.name', 'Namespace');

      expect(((app as unknown) as { chat: unknown }).chat).toEqual(chat);
    });

    it('should allow hiding namespaces from the app object', async () => {
      const deferred = deferredFactory();
      const app = new Koa();
      const chat = new IO({ namespace: 'chat', hidden: true });

      expect(chat.attach(app)).toHaveProperty('constructor.name', 'Namespace');

      const server = ((app as unknown) as EnhancedKoa).server!.listen();
      const address = server.address() as AddressInfo;
      const client = SocketIOClient(`ws://0.0.0.0:${address.port}/chat`, {
        transports: ['websocket'],
      });

      client.on('disconnect', () => {
        server.close();
        deferred.resolve();
      });
      client.on('connect', () => {
        client.disconnect();
      });

      chat.on('connection', async () => {
        expect(app).not.toHaveProperty('chat');
      });

      await deferred.promise;
    });

    it("shouldn't allow hiding the default namespace, app.io must be attached to app", () => {
      const app = new Koa();
      const socket = new IO({ hidden: true });

      expect(() => socket.attach(app)).toThrowError('Default namespace can not be hidden');
    });

    it('should call app.server when calling app.listen', () => {
      const app = new Koa();
      const socket = new IO();

      expect(socket.attach(app)).toEqual(expect.any(SocketIOServer));

      const spy = jest.fn();
      ((app as unknown) as EnhancedKoa).server!.listen = spy;

      const server = app.listen(() => {
        server.close();
      });

      expect(spy).toHaveBeenCalled();
    });
  });
});

describe('Connections', () => {
  it('should allow connecting to server', async () => {
    const { client, socket, endTest, promise } = testEnvironmentFactory();
    const deferred = deferredFactory();

    socket.on('disconnect', async () => {
      deferred.resolve();
    });

    client.on('connect', async () => {
      endTest();
    });

    await promise;
    await deferred.promise;
  });

  it('should update number of connections when a client connects', async () => {
    const { client, socket, endTest, promise } = testEnvironmentFactory();

    expect(socket.connections.size).toBe(0);

    socket.on('connection', async (ctx) => {
      expect(socket.connections.size).toBe(1);
      ctx.disconnect();
    });
    client.on('disconnect', () => {
      expect(socket.connections.size).toBe(0);
      endTest();
    });

    await promise;
  });

  it('should update number of connections when multiple clients connect', async () => {
    const { address, server, socket } = testApplicationFactory();
    const semaphore = semaphoreFactory(2);

    expect(socket.connections.size).toBe(0);

    const firstClient = connectedClientFactory(address.port);
    const secondClient = connectedClientFactory(address.port);

    socket.on('connection', async () => {
      semaphore.release();
    });

    await semaphore.promise;

    expect(socket.connections.size).toBe(2);

    firstClient.disconnect();
    secondClient.disconnect();
    server.close();
  });

  it('should allow picking a specific conneciton from the list of active connections', async () => {
    const deferred = deferredFactory();
    const { address, app, socket } = testApplicationFactory();

    app._io!.on('connection', (s) => {
      expect(socket.connections.has(s.id)).toBe(true);
      s.disconnect();
      deferred.resolve();
    });

    connectedClientFactory(address.port);

    await deferred.promise;
  });

  it('should allow booting a client from the connection list', async () => {
    const deferred = deferredFactory();
    const { address, app, server, socket } = testApplicationFactory();

    app._io!.on('connection', () => {
      expect(socket.connections.size).toBe(1);
    });

    const client = connectedClientFactory(address.port);
    client.on('disconnect', () => {
      expect(socket.connections.size).toBe(0);
      deferred.resolve();
    });

    await asyncWait(20);

    const s = socket.connections.get(client.id)!;
    s.disconnect();
    server.close();

    await deferred.promise;
  });

  it('should allow applying a connection handler to the koaIO instance', async () => {
    const deferred = deferredFactory();
    const { address, server, socket } = testApplicationFactory();

    const spy = jest.fn();

    socket.on('connection', async (ctx) => {
      spy();
      ctx.disconnect();
      server.close();
      deferred.resolve();
    });

    connectedClientFactory(address.port);

    await deferred.promise;

    expect(spy).toHaveBeenCalled();
  });
});

describe('Handlers', () => {
  it('should associate event handlers with events', async () => {
    const { client, socket, endTest, promise } = testEnvironmentFactory();

    const spy = jest.fn();

    socket.on('req', async () => {
      spy();
      endTest();
    });

    client.emit('req');

    await promise;

    expect(spy).toHaveBeenCalled();
  });

  it('should allow listening to multiple events', async () => {
    const { client, socket, endTest, promise } = testEnvironmentFactory();

    const spyA = jest.fn();
    const spyB = jest.fn();

    socket.on('req', async () => {
      spyA();
    });
    socket.on('req2', async () => {
      spyB();
      endTest();
    });

    client.emit('req');
    client.emit('req2');

    await promise;

    expect(spyA).toHaveBeenCalled();
    expect(spyB).toHaveBeenCalled();
  });

  it('should allow connecting multipler handlers to the same event', async () => {
    const { client, socket, endTest, promise } = testEnvironmentFactory();

    const spyA = jest.fn();
    const spyB = jest.fn();

    socket.on('req', async () => {
      spyA();
    });
    socket.on('req', async () => {
      spyB();
    });
    socket.on('end', async () => {
      endTest();
    });

    client.emit('req');
    client.emit('end');

    await promise;

    expect(spyA).toHaveBeenCalled();
    expect(spyB).toHaveBeenCalled();
  });

  it('should allow removing a handler', async () => {
    const { client, socket, endTest, promise } = testEnvironmentFactory();

    const spy = jest.fn();

    socket.on('req', spy);

    client.emit('req');
    await asyncWait(20);

    expect(spy).toHaveBeenCalledTimes(1);

    socket.off('req', spy);
    client.emit('req');

    endTest();

    await promise;

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should allow removing a handler from a multiple handler event', async () => {
    const { client, socket, endTest, promise } = testEnvironmentFactory();

    const spyA = jest.fn();
    const spyB = jest.fn();

    socket.on('req', spyA);
    socket.on('req', spyB);

    client.emit('req');
    await asyncWait(20);

    expect(spyA).toHaveBeenCalledTimes(1);
    expect(spyB).toHaveBeenCalledTimes(1);

    socket.off('req', spyA);
    client.emit('req');
    await asyncWait(20);

    endTest();

    await promise;

    expect(spyA).toHaveBeenCalledTimes(1);
    expect(spyB).toHaveBeenCalledTimes(2);
  });

  it('should allow removing all handlers from an event', async () => {
    const { client, socket, endTest, promise } = testEnvironmentFactory();

    const spyA = jest.fn();
    const spyB = jest.fn();

    socket.on('req', spyA);
    socket.on('req', spyB);

    client.emit('req');
    await asyncWait(20);

    expect(spyA).toHaveBeenCalledTimes(1);
    expect(spyB).toHaveBeenCalledTimes(1);

    socket.off('req');
    client.emit('req');
    await asyncWait(20);

    endTest();

    await promise;

    expect(spyA).toHaveBeenCalledTimes(1);
    expect(spyB).toHaveBeenCalledTimes(1);
  });

  it('should allow removing all handlers from a socket instance', async () => {
    const { client, socket, endTest, promise } = testEnvironmentFactory();

    const spyA = jest.fn();
    const spyB = jest.fn();

    socket.on('reqA', spyA);
    socket.on('reqB', spyB);

    client.emit('reqA');
    client.emit('reqB');
    await asyncWait(20);

    expect(spyA).toHaveBeenCalledTimes(1);
    expect(spyB).toHaveBeenCalledTimes(1);

    socket.off();
    client.emit('reqA');
    client.emit('reqB');
    await asyncWait(20);

    endTest();

    await promise;

    expect(spyA).toHaveBeenCalledTimes(1);
    expect(spyB).toHaveBeenCalledTimes(1);
  });

  it('should run middleware before listeners', async () => {
    const { client, socket, endTest, promise } = testEnvironmentFactory();

    const spy = jest.fn();

    socket.use(async (ctx, next) => {
      spy();
      await next();
    });

    socket.on('req', async () => {
      expect(spy).toHaveBeenCalled();
      endTest();
    });

    client.emit('req');
    await promise;

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should allow mutating context inside middlewares', async () => {
    const { client, socket, endTest, promise } = testEnvironmentFactory();

    socket.use(async (ctx, next) => {
      ctx.foo = true;
      await next();
    });

    socket.on('req', async (ctx) => {
      expect(((ctx as unknown) as { foo: boolean }).foo).toBe(true);
      endTest();
    });

    client.emit('req');
    await promise;
  });

  it('should traverse middlewares', async () => {
    const { client, socket, endTest, promise } = testEnvironmentFactory();

    socket.use(async (ctx, next) => {
      ctx.counter = 0;
      await next();
      expect(ctx.counter).toBe(1);
      ctx.counter++;
    });
    socket.use(async (ctx, next) => {
      ctx.counter++;
      await next();
    });

    socket.on('req', async (ctx) => {
      expect(((ctx as unknown) as { counter: number }).counter).toBe(1);
      endTest();
    });

    client.emit('req');
    await promise;
  });
});

describe('Stack', () => {
  it('should allow adding listeners to connected clients during runtime', async () => {
    const { client, socket, endTest, promise } = testEnvironmentFactory();

    const clientResponseSpy = jest.fn();

    client.on('connect', async () => {
      client.on('response', clientResponseSpy);

      client.emit('request');
      await asyncWait(20);

      expect(clientResponseSpy).toHaveBeenCalledTimes(0);

      socket.on('request', async (ctx) => {
        ctx.socket.emit('response');
      });

      client.emit('request');
      await asyncWait(20);

      expect(clientResponseSpy).toHaveBeenCalledTimes(1);
      endTest();
    });

    await promise;
  });

  it('should allow adding a middleware to connected clients', async () => {
    const { client, socket, promise, endTest } = testEnvironmentFactory();

    socket.on('req1', async (ctx) => {
      ctx.socket.emit('res1', ((ctx as unknown) as { foo: string }).foo);
    });
    socket.on('req2', async (ctx) => {
      ctx.socket.emit('res2', ((ctx as unknown) as { foo: string }).foo);
    });

    client.on('connect', async () => {
      client.on('res1', (data: unknown) => {
        expect(data).toBeNull();

        socket.use(async (ctx, next) => {
          ctx.foo = 'foo';
          await next();
        });

        client.emit('req2');
      });

      client.on('res2', (data: unknown) => {
        expect(data).toEqual('foo');
        endTest();
      });

      client.emit('req1');
    });

    await promise;
  });
});
