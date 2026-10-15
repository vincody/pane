import {test} from 'node:test';
import assert from 'node:assert/strict';
import {liveMarkdownReason,markdownMeaning,splitMarkdownSource} from '../../client/src/features/files/markdown-modes.ts';
import {richMarkdownReason} from '../../client/src/features/files/rich-markdown-editor.ts';
import {readFileSync} from 'node:fs';
import {parseWorkbenchJournal} from '../../client/src/features/layout/workbench-journal.ts';

test('live Markdown eligibility excludes unsafe syntax while code fences and front matter remain intact',()=>{
 assert.equal(liveMarkdownReason('README.MD','---\ntitle: Demo\n---\n# Heading\n\n- [ ] Task\n\n```html\n<div>code</div>\n```\n'),null);
 assert.match(liveMarkdownReason('notes.md','<details>hidden</details>')!,/HTML/);
 assert.match(liveMarkdownReason('notes.md','[guide][ref]\n\n[ref]: https://example.com')!,/reference/);
 assert.match(liveMarkdownReason('notes.md','Note[^1]\n\n[^1]: Footnote')!,/footnote/);
 assert.match(liveMarkdownReason('notes.md','a'.repeat(256*1024+1))!,/too large/);
 assert.match(liveMarkdownReason('index.ts','# Heading')!,/Markdown/);
 assert.deepEqual(splitMarkdownSource('---\r\ntitle: Demo\r\n---\r\n# Body\r\n'),{frontmatter:'---\r\ntitle: Demo\r\n---\r\n',body:'# Body\r\n',eol:'\r\n',trailing:true});
});
test('round-trip comparison ignores markup style but detects missing text, links, code and table structure',()=>{
 assert.equal(markdownMeaning('* item with _emphasis_\n'),markdownMeaning('- item with *emphasis*\n'));
 assert.notEqual(markdownMeaning('# Heading'),markdownMeaning('Heading'));
 assert.notEqual(markdownMeaning('[Link](https://one.example)'),markdownMeaning('[Link](https://two.example)'));
 assert.notEqual(markdownMeaning('```js\nconst x = 1;\n```'),markdownMeaning('```js\nconst x = 2;\n```'));
 assert.notEqual(markdownMeaning('| A | B |\n| - | - |\n| 1 | 2 |'),markdownMeaning('| A | B |\n| - | - |\n| 1 | 3 |'));
});
test('workbench accepts Live Editor views and still reads older Source and Preview journals',()=>{
 const journal=parseWorkbenchJournal({version:1,files:[{project:'one',path:'notes.md',pane:true,view:'live'}],views:[{project:'one',kind:'file',mode:'live',secondaryMode:'live'}]});
 assert.equal(journal?.files[0].view,'live');assert.equal(journal?.views[0].mode,'live');assert.equal(journal?.views[0].secondaryMode,'live');
 assert.equal(parseWorkbenchJournal({version:1,files:[{project:'one',path:'old.md',view:'preview'}]})?.files[0].view,'preview');
});


test('live codec accepts equivalent entities and reordered inline marks, but preserves semantic guards',()=>{
 assert.equal(markdownMeaning('# Brand & Accent'),markdownMeaning('# Brand &amp; Accent'));
 assert.equal(markdownMeaning('**[Link](https://example.com)**'),markdownMeaning('[**Link**](https://example.com)'));
 assert.notEqual(markdownMeaning('**Link**'),markdownMeaning('Link'));
 assert.notEqual(markdownMeaning('`&amp;`'),markdownMeaning('`&`'));
 for(const file of ['README.md','demo/Welcome.md','docs/desktop.md','docs/repository-structure.md'])assert.equal(richMarkdownReason(readFileSync(file,'utf8')),null,file);
 assert.ok(richMarkdownReason('First line\nsecond line\n---\n'),'multiline heading currently loses its heading node');
});
