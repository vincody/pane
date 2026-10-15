import type {GitHubItem} from '../../../../shared/contracts.ts';

export function PullStatus({pull}:{pull:GitHubItem&{draft?:unknown}}){
 const state=pull.state==='merged'?'merged':pull.state==='closed'?'closed':pull.draft?'draft':'open';
 const label={open:'Open',closed:'Closed',merged:'Merged',draft:'Draft'}[state];
 return <span className="github-pull-status" data-state={state} role="img" aria-label={`${label} pull request`} title={`${label} pull request`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="6" cy="5" r="2.5"/><circle cx="6" cy="19" r="2.5"/><path d="M6 7.5v9"/>{state==='merged'?<><circle cx="18" cy="19" r="2.5"/><path d="M6 7.5c0 6 12 1 12 9"/></>:state==='closed'?<><path d="m15 3 6 6m0-6-6 6M18 11v5.5"/><circle cx="18" cy="19" r="2.5"/></>:<><path d="m14 3-3 3 3 3m-3-3h4a3 3 0 0 1 3 3v7.5" strokeDasharray={state==='draft'?'2 3':undefined}/><circle cx="18" cy="19" r="2.5"/></>}</svg></span>;
}
