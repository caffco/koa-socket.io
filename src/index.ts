import { createServer as createHttpsServer } from 'https';
import { createServer as createHttpServer } from 'http';

import { Server as SocketIOServer, Socket, Namespace, ServerOptions } from 'socket.io';
import Koa from 'koa';
import compose from 'koa-compose';

export interface Options {
  /**
   * Namespace id
   * @default null
   */
  namespace: string | null;
  /**
   * Hidden instances do not append to the koa app, but still require attachment
   * @default false
   */
  hidden: boolean;
  /**
   * Options to pass when instantiating socket.io
   * @default {}
   */
  ioOptions: Partial<ServerOptions>;
}

export type EnhancedKoaContext<StateT, BaseKoaContext> = Koa.ParameterizedContext<
  StateT,
  BaseKoaContext & {
    socket: Socket;
  }
>;

export class EnhancedKoa<
  StateT extends Record<string, unknown> = Koa.DefaultContext,
  ContextT extends Record<string, unknown> = Koa.DefaultContext
> extends Koa<StateT, EnhancedKoaContext<StateT, ContextT>> {
  server?: ReturnType<typeof createHttpServer> | ReturnType<typeof createHttpServer>;
  _io?: SocketIOServer;
  io?: IO<StateT, ContextT>;
}

export type EnhancedKoaInstance<
  StateT extends Record<string, unknown>,
  ContextT extends Record<string, unknown>
> = EnhancedKoa<StateT, ContextT> & Record<string, IO<StateT, ContextT> | undefined>;

export interface BaseEventHandlerContext {
  event: string;
  data: unknown;
  socket: Socket;
  acknowledge: (data?: unknown) => void;
}

export type EventHandler<Context extends Record<string, unknown>> = (
  ctx: BaseEventHandlerContext & Context,
  ...rest: Array<unknown>
) => Promise<unknown>;

export interface EnhancedSocket<ContextT extends Record<string, unknown>> extends Socket {
  /**
   * Registers the new list of listeners and middleware composition
   * @param listeners map of events and callbacks
   * @param middleware > the composed middleware
   */
  update: (listeners: Map<string, Array<EventHandler<ContextT>>>) => void;
}

/**
 * Main IO class that handles the socket.io connections
 * @class
 */
export class IO<
  StateT extends Record<string, unknown> = Koa.DefaultState,
  ContextT extends Record<string, unknown> = Koa.DefaultContext
> {
  /**
   * List of middlewares, these are composed into an execution chain and
   * evaluated with each event
   */
  middleware: Array<compose.Middleware<EnhancedKoaContext<StateT, ContextT>>>;
  /**
   * Composed middleware stack
   */
  composed: compose.ComposedMiddleware<EnhancedKoaContext<StateT, ContextT>> | null;
  /**
   * All of the listeners currently added to the IO instance
   * event:callback
   * @type <Map>
   */
  listeners: Map<string, Array<EventHandler<ContextT>>>;
  /**
   * All active connections
   * id:Socket
   * @type <Map>
   */
  connections: Map<string, EnhancedSocket<ContextT>>;
  /**
   * Holds the socketIO connection
   * @type <Socket.IO>
   */
  socket: SocketIOServer | Namespace | null;
  opts: Options;
  adapter?: SocketIOServer['adapter'];

  /**
   * @constructs
   */
  constructor(optionsOrNamespace?: string | Partial<Options>) {
    if (
      optionsOrNamespace &&
      !(typeof optionsOrNamespace === 'string' || typeof optionsOrNamespace === 'object')
    ) {
      throw new Error('Incorrect argument passed to koaSocket constructor');
    }

    this.middleware = [];
    this.composed = null;
    this.listeners = new Map();
    this.connections = new Map();

    const options =
      typeof optionsOrNamespace === 'string'
        ? { namespace: optionsOrNamespace }
        : optionsOrNamespace;

    this.opts = Object.assign(
      {
        namespace: null,
        hidden: false,
        ioOptions: {},
      },
      options,
    );

    this.socket = null;

    this.onConnection = this.onConnection.bind(this);
    this.onDisconnect = this.onDisconnect.bind(this);
  }

  private createServerIfNeeded(
    app: Koa<StateT, ContextT>,
    https: boolean,
    opts: Parameters<typeof createHttpsServer>[0],
  ) {
    const enhancedApp = (app as unknown) as EnhancedKoa<StateT, ContextT>;

    if (enhancedApp.server) {
      if (enhancedApp.server.constructor.name !== 'Server') {
        throw new Error("app.server already exists but it's not an http server");
      }

      return;
    }

    // Create a server if it doesn't already exists
    const server = https
      ? createHttpsServer(opts, enhancedApp.callback())
      : createHttpServer(enhancedApp.callback());

    const listen = (...params: Parameters<typeof app.listen>): ReturnType<typeof app.listen> => {
      const boundListen = server.listen.bind(enhancedApp.server);
      boundListen(...params);

      return server;
    };

    // Patch `app.listen()` to call `app.server.listen()`
    enhancedApp.server = server;
    enhancedApp.listen = (listen as unknown) as typeof app.listen;
  }

  private ensureDefaultNamespaceIsNotHidden() {
    if (this.opts.hidden && !this.opts.namespace) {
      throw new Error('Default namespace can not be hidden');
    }
  }

  /**
   * Attach to a koa application
   * @param app the koa app to use
   * @param https whether to activate HTTPS (`true`) or not
   */
  attach(
    app: Koa<StateT, ContextT>,
    https = false,
    opts: Parameters<typeof createHttpsServer>[0] = {},
  ): SocketIOServer | Namespace {
    const enhancedApp = (app as unknown) as EnhancedKoaInstance<StateT, ContextT>;

    this.createServerIfNeeded(app, https, opts);

    if (enhancedApp._io) {
      // Without a namespace we’ll use the default, but .io already exists meaning
      // the default is taken already
      if (!this.opts.namespace) {
        throw new Error('Socket failed to initialise::Instance may already exist');
      }

      return this.attachNamespace(enhancedApp, this.opts.namespace);
    }

    this.ensureDefaultNamespaceIsNotHidden();

    enhancedApp._io = new SocketIOServer(enhancedApp.server, this.opts.ioOptions);

    if (this.opts.namespace) {
      return this.attachNamespace(enhancedApp, this.opts.namespace);
    }

    // Local aliases / passthrough socket.io functionality
    this.adapter = enhancedApp._io.adapter.bind(enhancedApp._io);

    // Attach default namespace
    enhancedApp.io = this;

    // If there is no namespace then connect using the default
    this.socket = enhancedApp._io;
    this.socket.on('connection', this.onConnection);

    return enhancedApp._io;
  }

  /**
   * Attaches the namespace to the server
   * @param app the koa app to use
   * @param id namespace identifier
   */
  attachNamespace(app: EnhancedKoaInstance<StateT, ContextT>, id: string): Namespace {
    if (!app._io) {
      throw new Error('Namespaces can only be attached once a socketIO instance has been attached');
    }

    const namespace = app._io.of(id);
    this.socket = namespace;
    this.socket.on('connection', this.onConnection);

    if (this.opts.hidden) {
      return namespace;
    }

    if (app[id]) {
      throw new Error('Namespace ' + id + ' already attached to koa instance');
    }

    app[id] = this;

    return namespace;
  }

  /**
   * Pushes a middleware on to the stack
   * @param fn the middleware function to execute
   */
  use(fn: compose.Middleware<EnhancedKoaContext<StateT, ContextT>>): this {
    this.middleware.push(fn);
    this.composed = compose(this.middleware);

    this.updateConnections();

    return this;
  }

  /**
   * Adds a new listener to the stack
   * @param event the event id
   * @param handler the callback to execute
   * @return this
   */
  on(event: 'connect' | 'connection', handler: (socket: Socket) => Promise<void>): this;
  on(event: string, handler: EventHandler<ContextT>): this;
  on(event: string, handler: EventHandler<ContextT> | ((socket: Socket) => Promise<void>)): this {
    if (['connect', 'connection'].includes(event)) {
      if (!this.socket) {
        throw new Error(
          'Event handlers can only be added once a socketIO instance has been attached',
        );
      }

      this.socket.on(event, handler);
      return this;
    }

    const listeners = this.listeners.get(event);

    // If this is a new event then just set it
    if (!listeners) {
      this.listeners.set(event, [handler as EventHandler<ContextT>]);
      this.updateConnections();
      return this;
    }

    listeners.push(handler as EventHandler<ContextT>);
    this.listeners.set(event, listeners);
    this.updateConnections();

    return this;
  }

  /**
   * Removes a listener from the event
   * @param event if omitted will remove all listeners
   * @param handler if omitted will remove all from the event
   */
  off(event?: string, handler?: EventHandler<ContextT>): this {
    if (!event) {
      this.listeners = new Map();
      this.updateConnections();
      return this;
    }

    if (!handler) {
      this.listeners.delete(event);
      this.updateConnections();
      return this;
    }

    const listeners = this.listeners.get(event) ?? [];
    const handlerIndex = listeners.findIndex((value) => value === handler);
    listeners.splice(handlerIndex, 1);

    this.updateConnections();
    return this;
  }

  /**
   * Broadcasts an event to all connections
   * @param event
   * @param data
   */
  broadcast<Data>(event: string, data: Data): void {
    this.connections.forEach((socket: Socket) => socket.emit(event, data));
  }

  /**
   * Perform an action on a room
   * @param room
   * @return socket
   */
  to(room: string): SocketIOServer | Namespace {
    if (!this.socket) {
      throw new Error(
        'Room actions can only be performed once a socketIO instance has been attached',
      );
    }

    return this.socket.to(room);
  }

  private socketOnFactory(
    socket: Socket,
  ): (event: string, handler: EventHandler<ContextT>) => Socket {
    return (event, handler) =>
      socket.on(event, (data, cb) => {
        const packet = {
          event,
          data,
          socket,
          acknowledge: cb,
        } as EnhancedKoaContext<StateT, BaseEventHandlerContext & ContextT>;

        const handleEvent = () => handler(packet, data);

        const { composed } = this;
        const handleMiddlewareChain = composed ? () => composed(packet, handleEvent) : handleEvent;

        handleMiddlewareChain();
      });
  }

  private socketUpdateFactory(
    socket: Socket,
  ): (listeners: Map<string, Array<EventHandler<ContextT>>>) => void {
    return (listeners) => {
      const on = this.socketOnFactory(socket);

      socket.removeAllListeners();

      listeners.forEach((handlersForEvent, event) => {
        if (event === 'connection') {
          return;
        }

        for (const handler of handlersForEvent) {
          on(event, handler);
        }
      });
    };
  }

  /**
   * Triggered for each new connection
   * Creates a new Socket instance and adds that to the stack and sets up the
   * disconnect event
   * @param sock <Socket.io Socket>
   * @private
   */
  private onConnection(sock: Socket): void {
    const enhancedSocket = sock as EnhancedSocket<ContextT>;

    enhancedSocket.update = this.socketUpdateFactory(sock);

    // Append listeners and composed middleware function
    enhancedSocket.update(this.listeners);

    this.connections.set(sock.id, enhancedSocket);
    sock.on('disconnect', () => this.onDisconnect(sock));

    // Trigger the connection event if attached to the socket listener map
    const connectionHandlers = this.listeners.get('connection') ?? [];
    for (const handler of connectionHandlers) {
      handler(
        {
          event: 'connection',
          data: sock,
          socket: sock,
        } as BaseEventHandlerContext & ContextT,
        sock.id,
      );
    }
  }

  /**
   * Fired when the socket disconnects, simply reflects stack in the connections
   * stack
   * @param sock
   * @private
   */
  private onDisconnect(sock: Socket): void {
    this.connections.delete(sock.id);
  }

  /**
   * Updates all existing connections with current listeners and middleware
   * @private
   */
  private updateConnections(): void {
    this.connections.forEach((connection) => connection.update(this.listeners));
  }
}
