import type {Server} from 'node:http';
import assert from 'node:assert/strict';

export function serverPort(server:Server):number {
 const address=server.address();
 assert.ok(address && typeof address!=='string', 'Expected a listening TCP server');
 return address.port;
}
