import type {SessionRecord,Workspace} from '../../../../shared/contracts.ts';
import {workspaceForSession} from '../history/history-session.ts';
import type {SavedTerminal} from './terminal-journal.ts';

const START_SLACK_MS=5000;

/** Finds the AI conversation a restored terminal was running. Returns null instead of guessing when it is ambiguous. */
export function pickConversation(saved:SavedTerminal,project:Pick<Workspace,'root'>,records:SessionRecord[],claimed:ReadonlySet<string>,rivals:number):SessionRecord|null{
 const known=saved.conversation;
 if(known)return records.find(record=>record.agent===known.agent&&record.agent_session.value===known.id)||null;
 if(rivals>0||saved.openedAt===undefined||(saved.launch!=='claude'&&saved.launch!=='codex'))return null;
 const since=saved.openedAt-START_SLACK_MS;
 return records.filter(record=>record.agent===saved.launch&&!claimed.has(record.agent_session.value)&&workspaceForSession(record,[project])&&Date.parse(record.createdAt||record.updatedAt)>=since)
  .sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt))[0]||null;
}
