const formatter=new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
const timestamp=record=>Date.parse(record.updatedAt || record.createdAt || '') || 0;
export const newestSessions=records=>[...records].sort((a,b)=>timestamp(b)-timestamp(a));
export function sessionDate(record){const milliseconds=timestamp(record);if(!milliseconds)return null;const date=new Date(milliseconds);return {iso:date.toISOString(),label:formatter.format(date),full:date.toLocaleString()};}
