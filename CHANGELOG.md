## 4.0.0

### Major Changes

- 1ee6d9e: Move from @caff/socket.io to socket.io

## 3.2.5

### Patch Changes

- Upgrade dependencies

## 3.2.4

### Patch Changes

- Upgrade dependencies

## 3.2.3

### Patch Changes

- Update dependencies

## 3.2.2

### Patch Changes

- Use `@caff/socket.io` instead of `socket.io`.

  The only difference in `@caff/socket.io` is that all `@types` dependencies are moved to devDependencies so there are fewer dependencies installed in production with no effect in runtime.

## 3.2.1

### Patch Changes

- Fix typeEnhancedKoaContext so it includes event property

## 3.2.0

### Minor Changes

- Return Socket.io server / namespace on attach

### Patch Changes

- Upgrade socket.io to v3.1.0

## 3.1.4

### Patch Changes

- Fix return type of chainable functions like use, on and off

## 3.1.3

### Patch Changes

- Improve type information of event handler contexts

## 3.1.2

### Patch Changes

- Improve type information

## 3.1.1

### Patch Changes

- Export EnhancedKoaContext and fix type definitions for Koa context

## 3.1.0

### Minor Changes

- Export EnhancedKoa class and EnhancedKoaInstance type

## 3.0.2

### Patch Changes

- Sourcemaps will no longer be published

## 3.0.1

### Patch Changes

- Ensure published code is the latest build available

### Major Changes

- fd67770: Codebase ported to TypeScript

## 1.1.0 - 05.09.2019

- _update_ promoted Socket.IO for better API exposure
- _update_ improved async passthrough handling

## 1.0.17 - 05.12.2017

- _update_ improved and re-added bug fix for promise chaining (credit: ihwbox)

## 1.0.16 - 03.12.2017

- _update_ revert bug fix for promise chaining, tests failing

## 1.0.15 - 03.12.2017

- _update_ bug fix for promise chaining

## 1.0.14 - 23.11.2017

- _update_ bug fix for multi-node adapter support (credit: ihwbox)

## 1.0.13 - 23.06.2017

- _update_ room broadcast functionality

## 1.0.12 - 14.06.2017

- _add_ socket ack functionality

## 1.0.11 - 13.06.2017

- _update_ documentation

## 1.0.10 - 08.06.2017

- _add_ multi-node clustering adapter support

## 1.0.9 - 07.06.2017

- _remove_ babel support
- _remove_ co wrapper support
- _update_ examples to NodeJS v7
- _update_ documentation
- _update_ tests

## 1.0.8 - 06.06.2017

- _update_ minor bug fixes for room support

## 1.0.7 - 06.06.2017

- _update_ documentation
- _add_ room list

## 1.0.6 - 06.06.2017

- _update_ improved room management

## 1.0.5 - 05.06.2017

- _add_ room join/leave support

## 1.0.4 - 02.06.2017

- _update_ documentation

## 1.0.3 - 18.05.2017

- _update_ documentation

## 1.0.2 - 15.05.2017

- _update_ breaking change - broadcast functionality now works as in the native method
- _add_ volatile message support
- _add_ compress message support

## 1.0.1 - 12.05.2017

- _add_ built-in HTTPS support

## 1.0.0 - 11.05.2017

- _update_ upgraded socket.io version to >= 2.0.1
