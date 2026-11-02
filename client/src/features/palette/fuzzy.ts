/** Letters in order, word starts and runs ranked higher. null: no match. */
export function fuzzy(query:string,text:string){
  const lower=text.toLowerCase();let score=0,at=0,run=0;const hits:number[]=[];
  for(const char of query){
    const index=lower.indexOf(char,at);if(index<0)return null;
    const start=index===0||/[\s:.\-_/]/.test(lower[index-1]);
    run=index===at&&hits.length?run+1:0;
    score+=1+(start?6:0)+run*3-Math.min(index-at,6)*.3;hits.push(index);at=index+1;
  }
  return {score:score-text.length*.02,hits};
}
