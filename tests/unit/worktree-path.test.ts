import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestWorktreePath} from '../../shared/worktree-path.ts';
test('worktree location suggestions support branch folders and Windows, UNC and POSIX paths',()=>{
 assert.equal(suggestWorktreePath('C:\\code\\app','feat/ssh'),'C:\\code\\app-worktrees\\feat/ssh');
 assert.equal(suggestWorktreePath('C:/code/app/','fix/usage'),'C:/code/app-worktrees/fix/usage');
 assert.equal(suggestWorktreePath('\\\\server\\share\\app','feat/ssh'),'\\\\server\\share\\app-worktrees\\feat/ssh');
 assert.equal(suggestWorktreePath('/home/user/app/',' feat/ssh '),'/home/user/app-worktrees/feat/ssh');
 assert.equal(suggestWorktreePath('/app','fix'),'/app-worktrees/fix');
 assert.equal(suggestWorktreePath('/','fix'),'');assert.equal(suggestWorktreePath('','fix'),'');assert.equal(suggestWorktreePath('/app',' '),'');
});
