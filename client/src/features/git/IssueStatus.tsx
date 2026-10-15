import type {GitHubItem} from '../../../../shared/contracts.ts';

export function IssueStatus({issue}:{issue:GitHubItem}){
 const closed=issue.state==='closed',label=closed?'Closed issue':'Open issue';
 return <span className="github-pull-status github-issue-status" data-state={closed?'closed':'open'} role="img" aria-label={label} title={label}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/>{closed?<path d="m8 12 3 3 5-6"/>:<circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>}</svg></span>;
}
