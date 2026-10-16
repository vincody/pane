export type ClipboardPaste =
 |{kind:'empty'}
 |{kind:'text';text:string}
 |{kind:'files';paths:string[]}
 |{kind:'image';path:string}
 |{kind:'error';message:string};
