import type {SshConnection} from './contracts.ts';
export function validateSshConnection(value:unknown):SshConnection{
 if(!value||typeof value!=='object')throw new Error('Provide an SSH connection.');
 const data=value as Record<string,unknown>;
 if(typeof data.host!=='string'||!data.host||data.host.length>253||! /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(data.host))throw new Error('Enter a hostname, IP address or SSH alias without spaces.');
 if(data.username!==undefined&&(typeof data.username!=='string'||! /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,63}$/.test(data.username)))throw new Error('Enter a valid SSH username.');
 if(data.port!==undefined&&(typeof data.port!=='number'||!Number.isInteger(data.port)||data.port<1||data.port>65535))throw new Error('Port must be between 1 and 65535.');
 const name=typeof data.name==='string'?data.name.trim():data.host;
 if(data.identityFile!==undefined&&(typeof data.identityFile!=='string'||!data.identityFile.trim()||data.identityFile.length>4096||/[\0\r\n]/.test(data.identityFile)))throw new Error('Enter a valid SSH key file path.');
 if(!name||name.length>80)throw new Error('Connection name must be 1–80 characters.');
 return {name,host:data.host,...(data.username?{username:data.username as string}:{}),...(data.port?{port:data.port as number}:{}),...(data.identityFile?{identityFile:data.identityFile as string}:{})};
}
export function sshArguments(value:unknown):string[]{
 const connection=validateSshConnection(value);
 return [...(connection.port?['-p',String(connection.port)]:[]),...(connection.username?['-l',connection.username]:[]),...(connection.identityFile?['-i',connection.identityFile]:[]),connection.host];
}
