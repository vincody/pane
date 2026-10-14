// Independently implemented from Herdr's signal-priority approach:
// CLI OSC state, then live-screen blockers, then completion evidence.
export function readTerminalActivity(screen, previous = {}, {title='',agent='codex'} = {}) {
  const completion = [...screen.matchAll(/(?:Worked for\s+[^\n]+|[✻✽✶✢✳]\s+(?:Worked|Baked|Brewed|Cooked|Churned|Cogitated|Crunched|Sautéed|Simmered|Stewed|Whisked)\s+for\s+[^\n]+)/gi)].at(-1)?.[0] || '';
  const initialized = previous.completion !== undefined;
  const tail=screen.trimEnd().split('\n').slice(-14).join('\n');
  const titleBlocked=/action\s+required/i.test(title);
  const titleWorking=agent==='claude'?/^[\u2800-\u28ff\u25d0-\u25d3]\s/.test(title):/(?:^|[\s\[])\s*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏](?:[\s\]]|$)/.test(title);
  const titleIdle=(agent==='claude'?/^✳\s/.test(title):Boolean(title.trim())) && !titleBlocked && !titleWorking;
  const transcriptViewer=/(?:↑\/?↓ to scroll|pgup\/pgdn to|showing detailed transcript)/i.test(tail) && /(?:q to quit|esc.*edit prev|ctrl\+o|ctrl\+e)/i.test(tail);
  if(transcriptViewer)return {...previous,completed:false};
  const claudeModelPicker=agent==='claude' && /select model/i.test(tail) && /enter to set as default/i.test(tail) && /esc to cancel/i.test(tail);
  if(claudeModelPicker)return {...previous,completed:false};
  // Command pickers also say "Enter to confirm". That hint alone is not
  // an agent request, and repainting history is not a completed turn.
  const commandMenu=/^[\s›❯>]\s*\/[\w-]*\s*$/m.test(tail) || (tail.match(/^\s*\/[a-z][\w-]*\s+\S/gim)?.length || 0)>=2;
  const questionPanel=/\bQuestion\s+\d+\s*\/\s*\d+\b/i.test(screen) || /(?:Select an option to add notes|Submit with unanswered questions\?|None of the above[^\n]*|Add notes)/i.test(tail) && /(?:\bsubmit\b|\btab\b|\benter\b|\d+[.)]\s)/i.test(tail);
  const promptLines=tail.split('\n');const lastPrompt=promptLines.findLastIndex(line=>/^\s*[›❯>]\s/.test(line));const live=lastPrompt>=0?promptLines.slice(lastPrompt).join('\n'):tail;
  const claudeBlocked=agent==='claude' && (
    /esc to cancel/i.test(tail) && /(?:enter to confirm|enter to select.*(?:arrows|arrow keys|↑\/?↓|tab)|MCP server .+ requests your input)/i.test(tail)
    || /(?:waiting for permission|do you want to allow this connection\?|tab to amend|ctrl\+e to explain|review your answers|skip interview and plan immediately)/i.test(live)
  );
  const blocked=!commandMenu && (titleBlocked || questionPanel || claudeBlocked || /(?:No, and tell|Would you like to (?:run|proceed|allow)|Do you want to (?:proceed|allow)|Allow .*\?|permission required|1\.\s+Yes|Tab to switch questions|Type your answer|enter to submit (?:answer|all)|allow command\?)/i.test(live));
  const claudeWorking=agent==='claude' && /(?:^[*·✢✳✶✻✽]\s+\S[^\n]*…\s*\(\d+[smh]|^[*·✢✳✶✻✽]\s+Waiting for [1-9]\d* background agents? to finish|^[*·✢✳✶✻✽]\s+[^\n]*·\s*[1-9]\d* MCP tasks? still running)/im.test(tail);
  const working=titleWorking || claudeWorking || /(?:esc to interrupt|ctrl\+c to interrupt|\([0-9hms ]+s • [^\n]*to interrupt\))/i.test(tail);
  const completed=!commandMenu && initialized && previous.inTurn && !blocked && !working && ((Boolean(completion) && completion!==previous.completion) || (titleIdle && previous.titleTurn));
  return {status:blocked?'blocked':!commandMenu&&working?'working':'idle',completion:initialized && !commandMenu && !blocked && working ? previous.completion : completion || previous.completion || '',completed:Boolean(completed),inTurn:!commandMenu && !blocked && (working || Boolean(previous.inTurn && !completed)),titleTurn:!commandMenu && !blocked && !completed && (titleWorking || Boolean(previous.titleTurn))};
}
